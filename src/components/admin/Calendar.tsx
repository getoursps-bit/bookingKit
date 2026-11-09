"use client";

import FullCalendar, {
  type CalendarRef,
  type DateClickInfo,
  type DatesSetInfo,
  type DayCellInfo,
  type DateSelectInfo,
  type EventClickInfo,
  type EventDisplayInfo,
  type EventDropInfo,
  type EventInput,
  type EventResizeDoneInfo,
} from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import enLocale from "@fullcalendar/react/locales/en-gb";
import heLocale from "@fullcalendar/react/locales/he";
import formaTheme from "@fullcalendar/react/themes/forma";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/forma/theme.css";
import "@fullcalendar/react/themes/forma/palettes/red.css";
import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { useI18n } from "@/i18n/client";

type Booking = {
  id: number;
  start: string;
  end: string;
  status: "confirmed" | "completed" | "no_show";
  customerName: string;
  phone: string | null;
  notes: string | null;
  lines: { petName: string | null; serviceName: string; vetName: string | null; vaccinesConfirmed: boolean }[];
  summary: string | null;
};

type Service = { id: number; name: string; durationMin: number };

/** One weekday's opening hours, "HH:MM", or null when closed. */
export type DayHours = { weekday: number; opens: string; closes: string } | null;

type View = "timeGridDay" | "timeGridWeek" | "dayGridMonth";

const VIEWS: { type: View; key: "cal.day" | "cal.week" | "cal.month" }[] = [
  { type: "timeGridDay", key: "cal.day" },
  { type: "timeGridWeek", key: "cal.week" },
  { type: "dayGridMonth", key: "cal.month" },
];

const TIME_ZONE = "Asia/Jerusalem";

function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The hours the grid shows: from the earliest opening to the latest closing, whole hours, with a fallback. */
function visibleRange(hours: DayHours[]): { min: string; max: string } {
  const open = hours.filter((day): day is NonNullable<DayHours> => day !== null);
  if (open.length === 0) return { min: "08:00:00", max: "20:00:00" };
  const first = Math.min(...open.map((day) => Number(day.opens.slice(0, 2))));
  const last = Math.max(...open.map((day) => Math.ceil(Number(day.closes.slice(0, 2)) + Number(day.closes.slice(3, 5)) / 60)));
  const pad = (n: number) => `${String(Math.max(0, Math.min(24, n))).padStart(2, "0")}:00:00`;
  return { min: pad(first), max: pad(last) };
}

/** A booking's day in the salon's time zone, "YYYY-MM-DD". */
function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
}

/** A calendar day cell's own date, "YYYY-MM-DD" (the cell date carries the wall-clock date). */
function cellKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function petsOf(booking: Booking): string {
  return booking.lines.map((line) => [line.petName, line.serviceName].filter(Boolean).join(" · ")).join(", ");
}

/**
 * Day, week and month views across the full page width, in the owner's
 * language (Hebrew right to left, English left to right), weeks from Sunday,
 * hours trimmed to the opening hours with closed times shaded. Dragging moves
 * a booking through the server's move rule (a refusal snaps it back), pulling
 * the bottom edge lengthens it, a click on an empty time opens the owner
 * booking form and a click on a booking opens its details, both in a drawer
 * (a bottom sheet on phones). Month days show how many bookings they hold and
 * whether the salon is closed; a click on a day opens that day.
 */
export function Calendar({
  csrf,
  services,
  hours,
  focusId,
}: {
  csrf: string;
  services: Service[];
  hours: DayHours[];
  focusId: number | null;
}) {
  const calendar = useRef<CalendarRef>(null);
  const { t, locale, dir } = useI18n();
  const [view, setView] = useState<View>("timeGridDay");
  const [title, setTitle] = useState("");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selected, setSelected] = useState<Booking | null>(null);
  const [newStart, setNewStart] = useState<Date | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const focused = useRef(false);
  // FullCalendar starts loading during the first render; its results wait for the mount before touching state.
  const [mountGate] = useState(() => {
    let open = () => {};
    const promise = new Promise<void>((resolve) => {
      open = resolve;
    });
    return { promise, open };
  });
  useEffect(() => mountGate.open(), [mountGate]);
  const range = useMemo(() => visibleRange(hours), [hours]);
  const businessHours = useMemo(
    () =>
      hours
        .filter((day): day is NonNullable<DayHours> => day !== null)
        .map((day) => ({ daysOfWeek: [day.weekday], startTime: day.opens, endTime: day.closes })),
    [hours],
  );
  const closedDays = useMemo(() => {
    const open = new Set(hours.flatMap((day) => (day ? [day.weekday] : [])));
    return new Set([0, 1, 2, 3, 4, 5, 6].filter((weekday) => !open.has(weekday)));
  }, [hours]);
  const perDay = useMemo(() => {
    const counts = new Map<string, number>();
    for (const booking of bookings) {
      if (booking.status === "no_show") continue;
      const key = dayKey(booking.start);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [bookings]);
  const api = () => calendar.current?.getApi();

  // The new-appointment form starts at the name field.
  useEffect(() => {
    if (newStart) document.getElementById("new-name")?.focus();
  }, [newStart]);

  const dateTime = (iso: string, options: Intl.DateTimeFormatOptions) =>
    new Date(iso).toLocaleString(locale === "en" ? "en-GB" : "he-IL", { timeZone: TIME_ZONE, ...options });

  async function post(body: Record<string, string | number | boolean>): Promise<boolean> {
    const response = await fetch("/api/admin/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({ csrf, ...body }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      const text =
        data.error === "SlotTaken"
          ? t("cal.moveFailed")
          : data.error === "OutsideHours"
            ? t("cal.outsideHours")
            : data.error === "TimeOff"
              ? t("cal.timeOff")
              : t("admin.error.invalid");
      setMessage({ kind: "error", text });
      return false;
    }
    setMessage({ kind: "ok", text: t("admin.saved") });
    api()?.refetchEvents();
    return true;
  }

  async function loadEvents(info: { startStr: string; endStr: string }): Promise<EventInput[]> {
    const response = await fetch(
      `/api/admin/bookings?start=${encodeURIComponent(info.startStr)}&end=${encodeURIComponent(info.endStr)}`,
    );
    if (!response.ok) return [];
    const loaded = (await response.json()) as Booking[];
    await mountGate.promise;
    setBookings([...loaded].sort((a, b) => a.start.localeCompare(b.start)));
    if (focusId && !focused.current) {
      const match = loaded.find((booking) => booking.id === focusId);
      if (match) {
        focused.current = true;
        setSelected(match);
      }
    }
    return loaded.map((booking) => ({
      id: String(booking.id),
      title: `${booking.customerName} · ${petsOf(booking)}`,
      start: booking.start,
      end: booking.end,
      className: `ff-event ff-event-${booking.status}`,
      editable: booking.status === "confirmed",
      extendedProps: booking,
    }));
  }

  // FullCalendar treats a new function as a new event source and reloads it; loading updates this
  // component's state, so the source must keep one identity across renders.
  const loader = useRef(loadEvents);
  useEffect(() => {
    loader.current = loadEvents;
  });
  const eventSource = useMemo(
    // The calendar also renders on the server, where there is nothing to load yet.
    () => async (info: { startStr: string; endStr: string }) => (typeof window === "undefined" ? [] : loader.current(info)),
    [],
  );

  async function onDrop(info: EventDropInfo) {
    const ok = await post({ action: "move", id: Number(info.event.id), start: info.event.start!.toISOString() });
    if (!ok) info.revert();
    else setMessage({ kind: "ok", text: t("cal.moved") });
  }

  async function onResize(info: EventResizeDoneInfo) {
    const minutes = Math.round(info.endDelta.milliseconds / 60_000 + info.endDelta.days * 1440);
    if (!(await post({ action: "extend", id: Number(info.event.id), minutes }))) info.revert();
  }

  /** Dragging across free times (day and week only) opens the form at the first one. */
  function onSelect(info: DateSelectInfo) {
    if (info.allDay) return;
    setSelected(null);
    setNewStart(info.start);
  }

  /** A click on a free time opens the form there; a click on a month day opens that day. */
  function onDateClick(info: DateClickInfo) {
    if (info.view.type === "dayGridMonth") {
      api()?.changeView("timeGridDay", info.date);
      return;
    }
    setSelected(null);
    setNewStart(info.date);
  }

  function dayCellClass(info: DayCellInfo): string {
    return closedDays.has(info.dow) ? "ff-day ff-day-closed" : "ff-day";
  }

  /** Month days: the date, then the day's booking count or "closed". */
  function dayCellTopContent(info: DayCellInfo) {
    if (info.view.type !== "dayGridMonth") return info.dayNumberText;
    const count = info.isOther ? 0 : (perDay.get(cellKey(info.date)) ?? 0);
    return (
      <>
        {info.dayNumberText}
        {count > 0 ? (
          <span className="ff-day-count" aria-label={t("cal.dayCount", { n: count })}>
            {count}
          </span>
        ) : closedDays.has(info.dow) && !info.isOther ? (
          <span className="ff-day-closed-label">{t("cal.closed")}</span>
        ) : null}
      </>
    );
  }

  function onClick(info: EventClickInfo) {
    info.jsEvent.preventDefault();
    setNewStart(null);
    setSelected(info.event.extendedProps as Booking);
  }

  function onDates(info: DatesSetInfo) {
    setTitle(info.view.title);
    setView(info.view.type as View);
  }

  /** "New appointment": the next quarter hour today, or the opening time of the day in view. */
  function startNew() {
    const shown = api()?.view.currentStart ?? new Date();
    const now = new Date();
    const sameDay = shown.toDateString() === now.toDateString();
    const start = new Date(sameDay ? now : shown);
    if (sameDay) start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15, 0, 0);
    else start.setHours(Number(range.min.slice(0, 2)), 0, 0, 0);
    setSelected(null);
    setNewStart(start);
  }

  function close() {
    setSelected(null);
    setNewStart(null);
  }

  async function createBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const ok = await post({
      action: "create",
      name: String(data.get("name") ?? ""),
      phone: String(data.get("phone") ?? ""),
      start: new Date(String(data.get("start"))).toISOString(),
      services: data.getAll("service").join(","),
      notes: String(data.get("notes") ?? ""),
      notify: data.get("notify") === "on",
    });
    if (ok) setNewStart(null);
  }

  async function act(action: string, extra: Record<string, string | number | boolean> = {}) {
    if (selected && (await post({ action, id: selected.id, ...extra }))) setSelected(null);
  }

  function eventContent(info: EventDisplayInfo) {
    const booking = info.event.extendedProps as Booking;
    if (info.view.type === "dayGridMonth") {
      return (
        <div className="ff-event-line">
          <span className="ff-event-time" dir="ltr">
            {dateTime(booking.start, { hour: "2-digit", minute: "2-digit" })}
          </span>
          <span className="ff-event-name">{booking.customerName}</span>
        </div>
      );
    }
    return (
      <div className="ff-event-body">
        {/* Times read left to right in both languages; narrow week columns show the start only. */}
        <span className="ff-event-time" dir="ltr">
          {view === "timeGridWeek" ? dateTime(booking.start, { hour: "2-digit", minute: "2-digit" }) : info.timeText}
        </span>
        <span className="ff-event-name">
          {booking.status === "completed" ? <Icon name="check" size={14} /> : null}
          {booking.customerName}
        </span>
        {info.isShort ? null : <span className="ff-event-pets">{petsOf(booking)}</span>}
      </div>
    );
  }

  const details = selected ? (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm text-ink-muted">
          {dateTime(selected.start, { weekday: "long", day: "numeric", month: "long" })}
        </p>
        <p className="text-2xl font-semibold tabular-nums">
          <bdi>
            {dateTime(selected.start, { hour: "2-digit", minute: "2-digit" })}–
            {dateTime(selected.end, { hour: "2-digit", minute: "2-digit" })}
          </bdi>
        </p>
        <StatusBadge status={selected.status} label={t(`cal.status.${selected.status}`)} />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-lg font-semibold">{selected.customerName}</p>
        {selected.phone ? (
          <a href={`tel:${selected.phone}`} dir="ltr" className="w-fit text-brand-strong underline">
            {selected.phone}
          </a>
        ) : null}
      </div>
      <ul className="flex flex-col gap-1 border-t border-line pt-3">
        {selected.lines.map((line, index) => (
          <li key={index} className="flex gap-2">
            <Icon name="paw" size={18} className="mt-0.5 shrink-0 text-ink-muted" />
            <span className="flex flex-col">
              <span>{[line.petName, line.serviceName].filter(Boolean).join(" – ")}</span>
              {line.vetName ? (
                <span className="text-sm text-ink-muted">
                  {t("cal.vet", { name: line.vetName })} ·{" "}
                  {line.vaccinesConfirmed ? t("cal.vaccinesYes") : t("cal.vaccinesNo")}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {selected.notes ? <p className="rounded-xl bg-paper p-3 text-sm">{selected.notes}</p> : null}
      {selected.summary ? (
        <p className="flex gap-2 rounded-xl bg-paper p-3 text-sm">
          <Icon name="sparkle" className="shrink-0 text-brand" />
          <span className="whitespace-pre-line">{selected.summary}</span>
        </p>
      ) : null}
      {selected.status === "confirmed" ? (
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn btn-primary" onClick={() => act("completed")}>
              <Icon name="check" />
              {t("cal.complete")}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => act("no_show")}>
              {t("cal.noShow")}
            </button>
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => act("extend", { minutes: 15 })}>
            <Icon name="plus" />
            {t("cal.extend")}
          </button>
          <button
            type="button"
            className="btn border border-danger/30 text-danger hover:bg-danger-soft"
            onClick={() => act("cancel", { notify: true })}
          >
            {t("cal.cancelNotify")}
          </button>
        </div>
      ) : null}
    </div>
  ) : null;

  const form = newStart ? (
    <form onSubmit={createBooking} className="flex flex-col gap-4">
      <div className="field">
        <label htmlFor="new-name" className="field-label">
          {t("cal.customer")}
        </label>
        <input id="new-name" name="name" className="input" required maxLength={80} />
      </div>
      <div className="field">
        <label htmlFor="new-phone" className="field-label">
          {t("cal.phone")}
        </label>
        <input id="new-phone" name="phone" type="tel" dir="ltr" className="input text-end" required inputMode="tel" />
      </div>
      <div className="field">
        <label htmlFor="new-start" className="field-label">
          {t("cal.start")}
        </label>
        <input
          id="new-start"
          name="start"
          type="datetime-local"
          dir="ltr"
          className="input"
          required
          step={900}
          defaultValue={toLocalInput(newStart)}
        />
      </div>
      <fieldset className="field">
        <legend className="field-label mb-1.5">{t("cal.services")}</legend>
        <div className="choices">
          {services.map((service) => (
            <label key={service.id} className="choice">
              <input type="checkbox" name="service" value={service.id} />
              {service.name}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="field">
        <label htmlFor="new-notes" className="field-label">
          {t("cal.notes")}
        </label>
        <textarea id="new-notes" name="notes" className="input min-h-20" maxLength={1000} />
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="notify" defaultChecked className="size-5 accent-brand" />
        {t("cal.notify")}
      </label>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary">
          {t("cal.create")}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setNewStart(null)}>
          {t("admin.cancel")}
        </button>
      </div>
    </form>
  ) : null;

  const panelTitle = selected ? t("cal.details") : newStart ? t("cal.new") : null;
  const panelBody = details ?? form;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-full border border-line-strong">
            <button
              type="button"
              onClick={() => api()?.prev()}
              className="grid size-11 place-items-center rounded-full hover:bg-paper"
            >
              <Icon name="arrow" className="rtl:rotate-180" />
              <span className="visually-hidden">{t("cal.prev")}</span>
            </button>
            <button type="button" onClick={() => api()?.today()} className="min-h-11 px-3 text-sm font-semibold">
              {t("cal.today")}
            </button>
            <button
              type="button"
              onClick={() => api()?.next()}
              className="grid size-11 place-items-center rounded-full hover:bg-paper"
            >
              <Icon name="arrow" className="ltr:rotate-180" />
              <span className="visually-hidden">{t("cal.next")}</span>
            </button>
          </div>
          <h2 aria-live="polite" className="cal-title text-lg font-semibold md:text-xl">
            {title}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <div role="group" aria-label={t("cal.view")} className="flex rounded-full bg-paper p-1">
            {VIEWS.map(({ type, key }) => (
              <button
                key={type}
                type="button"
                aria-pressed={view === type}
                onClick={() => api()?.changeView(type)}
                className={`min-h-9 rounded-full px-4 text-sm font-semibold ${
                  view === type ? "bg-surface text-ink shadow-sm" : "text-ink-muted"
                }`}
              >
                {t(key)}
              </button>
            ))}
          </div>
          <button type="button" onClick={startNew} className="btn btn-primary min-h-11 px-4">
            <Icon name="plus" size={18} />
            <span className="hidden sm:inline">{t("cal.new")}</span>
            <span className="visually-hidden sm:hidden">{t("cal.new")}</span>
          </button>
        </div>
      </div>

      <div aria-live="polite">{message ? <Alert kind={message.kind}>{message.text}</Alert> : null}</div>

      <div className="admin-calendar min-w-0 overflow-hidden rounded-2xl border border-line bg-surface">
          <FullCalendar
            ref={calendar}
            plugins={[formaTheme, timeGridPlugin, dayGridPlugin, interactionPlugin]}
            key={locale}
            locale={locale === "en" ? enLocale : heLocale}
            direction={dir}
            firstDay={0}
            initialView="timeGridDay"
            headerToolbar={false}
            slotMinTime={range.min}
            slotMaxTime={range.max}
            slotDuration="00:15:00"
            slotHeaderInterval="01:00"
            scrollTime={range.min}
            businessHours={businessHours}
            allDaySlot={false}
            nowIndicator
            height="auto"
            selectable
            selectMirror
            editable
            eventDurationEditable
            eventStartEditable
            navLinks
            dayMaxEvents={3}
            fixedWeekCount={false}
            eventDisplay="block"
            views={{ dayGridMonth: { selectable: false, eventDurationEditable: false } }}
            datesSet={onDates}
            events={eventSource}
            eventContent={eventContent}
            eventClass={(info) =>
              [
                info.view.type === "dayGridMonth" ? "ff-event-month" : "",
                selected && info.event.id === String(selected.id) ? "ff-event-selected" : "",
              ].join(" ")
            }
            moreLinkClass="ff-more"
            select={onSelect}
            dateClick={onDateClick}
            dayCellClass={dayCellClass}
            dayCellTopContent={dayCellTopContent}
            eventClick={onClick}
            eventDrop={onDrop}
            eventResize={onResize}
          />
      </div>

      <Sheet open={panelBody !== null} title={panelTitle ?? ""} onClose={close} closeLabel={t("cal.close")}>
        {panelBody}
      </Sheet>
    </div>
  );
}

function StatusBadge({ status, label }: { status: Booking["status"]; label: string }) {
  const style =
    status === "completed"
      ? "bg-success-soft text-success-ink"
      : status === "no_show"
        ? "bg-paper text-ink-muted"
        : "bg-brand-soft text-brand-strong";
  return <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${style}`}>{label}</span>;
}

function Panel({
  title,
  onClose,
  closeLabel,
  children,
}: {
  title: string;
  onClose: () => void;
  closeLabel: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby="cal-panel-title" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="cal-panel-title" className="text-lg font-semibold">
          {title}
        </h2>
        <button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-full hover:bg-paper">
          <Icon name="close" />
          <span className="visually-hidden">{closeLabel}</span>
        </button>
      </div>
      {children}
    </section>
  );
}

/**
 * The details and new-booking drawer: a native modal <dialog> on the end side
 * of wide screens and fixed to the bottom on phones, so focus stays inside,
 * Escape closes it and focus returns to what opened it.
 */
function Sheet({
  open,
  title,
  onClose,
  closeLabel,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  closeLabel: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="cal-sheet bg-surface backdrop:bg-ink/40"
    >
      <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong" aria-hidden="true" />
      {open ? (
        <Panel title={title} onClose={onClose} closeLabel={closeLabel}>
          {children}
        </Panel>
      ) : null}
    </dialog>
  );
}
