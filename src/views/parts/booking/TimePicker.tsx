"use client";

import { type KeyboardEvent, type MouseEvent, useRef, useState } from "react";
import { Icon } from "@/views/parts/ui/Icon";
import { useI18n } from "@/i18n/client";
import type { MessageKey } from "@/i18n/t";
import { formatLocal } from "@/core/platform/time";
import { SubmitButton } from "./SubmitButton";

export type WeekData = {
  date: string;
  lengthMin: number;
  days: { date: string; status: "available" | "full" | "closed" }[];
  /** ISO instants. */
  slots: string[];
  firstAvailable: { date: string; start: string } | null;
};

type Props = {
  initial: WeekData;
  csrf: string;
  /** Where the slot form posts, and its hidden fields (action, token). */
  action: string;
  hidden: Record<string, string>;
  /** Page address before `date=`, for example "/book?step=time&". */
  basePath: string;
  /** Extra query for the week API, for example "&token=…" when moving a booking. */
  apiQuery: string;
  submitLabel?: string;
  /** A start chosen before this step (the home page's first free time); offered first when it still fits. */
  picked?: { start: string; fits: boolean } | null;
};

const STATUS_KEY = { available: "time.free", full: "time.full", closed: "time.closed" } as const;

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

/** Noon on a local date: safe to format as that day in any time zone offset Israel uses. */
function noon(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

/**
 * The weekly day strip, the free times on the chosen day and the "first
 * available" shortcut. Every day is a real link and every time a real submit
 * button, so it all works without JavaScript; with it, days load in place and
 * the arrow keys move between days.
 */
export function TimePicker({ initial, csrf, action, hidden, basePath, apiQuery, submitLabel, picked }: Props) {
  const { t, locale, dir } = useI18n();
  const [week, setWeek] = useState(initial);
  const [loading, setLoading] = useState(false);
  const stripRef = useRef<HTMLUListElement>(null);

  const href = (date: string) => `${basePath}date=${date}`;

  async function load(date: string, event?: MouseEvent) {
    event?.preventDefault();
    setLoading(true);
    try {
      const response = await fetch(`/api/booking/week?date=${date}${apiQuery}`, {
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as Omit<WeekData, "date">;
      setWeek({ ...data, date });
      window.history.replaceState(null, "", href(date));
    } catch {
      window.location.assign(href(date));
    } finally {
      setLoading(false);
    }
  }

  function onStripKey(event: KeyboardEvent<HTMLAnchorElement>) {
    const links = [...(stripRef.current?.querySelectorAll<HTMLAnchorElement>("a.day") ?? [])];
    const index = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (index < 0) return;
    // The arrow that points along the reading direction moves to the next day.
    const forward = dir === "rtl" ? 1 : -1;
    const step = { ArrowLeft: forward, ArrowRight: -forward, Home: -index, End: links.length - 1 - index }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    links[Math.max(0, Math.min(links.length - 1, index + step))]?.focus();
  }

  const selected = week.days.find((day) => day.date === week.date);
  const offer = picked?.fits
    ? { start: picked.start, key: "time.picked" as const }
    : week.firstAvailable
      ? { start: week.firstAvailable.start, key: "time.first" as const }
      : null;
  const dayName = formatLocal(noon(week.date), "EEEE dd/MM", locale);

  return (
    <div className="flex flex-col gap-6" aria-busy={loading}>
      <p className="chip w-fit">
        <Icon name="clock" size={16} />
        {t("time.length", { minutes: week.lengthMin })}
      </p>

      {picked && !picked.fits ? (
        <p className="alert alert-info">
          {t("time.pickedGone", { when: formatLocal(new Date(picked.start), "EEEE dd/MM HH:mm", locale) })}
        </p>
      ) : null}

      {offer ? (
        <form
          method="post"
          action={action}
          className="card flex flex-wrap items-center justify-between gap-3 bg-brand-soft p-4"
        >
          <input type="hidden" name="csrf" value={csrf} />
          {Object.entries(hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <input type="hidden" name="start" value={offer.start} />
          <p className="font-semibold">
            <Icon name="sparkle" className="me-1 inline text-brand" />
            {t(offer.key, { when: formatLocal(new Date(offer.start), "EEEE dd/MM HH:mm", locale) })}
          </p>
          <SubmitButton className="btn btn-primary">{t("time.takeFirst")}</SubmitButton>
        </form>
      ) : (
        <p className="alert alert-info">{t("time.none")}</p>
      )}

      <section aria-labelledby="week-title" className="card p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="week-title" className="text-lg font-bold">
            {t("time.week")}
          </h2>
          <div className="flex gap-1">
            <a
              href={href(addDays(week.date, -7))}
              onClick={(event) => load(addDays(week.date, -7), event)}
              className="grid size-11 place-items-center rounded-full hover:bg-brand-soft"
            >
              <Icon name="arrow" className="rtl:rotate-180" />
              <span className="visually-hidden">{t("time.prevWeek")}</span>
            </a>
            <a
              href={href(addDays(week.date, 7))}
              onClick={(event) => load(addDays(week.date, 7), event)}
              className="grid size-11 place-items-center rounded-full hover:bg-brand-soft"
            >
              <Icon name="arrow" className="ltr:rotate-180" />
              <span className="visually-hidden">{t("time.nextWeek")}</span>
            </a>
          </div>
        </div>
        <ul ref={stripRef} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {week.days.map((day) => {
            const date = noon(day.date);
            return (
              <li key={day.date}>
                <a
                  href={href(day.date)}
                  onClick={(event) => load(day.date, event)}
                  onKeyDown={onStripKey}
                  aria-current={day.date === week.date ? "date" : undefined}
                  data-status={day.status}
                  className="day"
                >
                  <span className="font-semibold">{formatLocal(date, "EEEEEE", locale)}</span>
                  <bdi className="text-base font-bold">{formatLocal(date, "dd/MM", locale)}</bdi>
                  <span className="text-xs">{t(STATUS_KEY[day.status] as MessageKey)}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="slots-title" aria-live="polite">
        <h2 id="slots-title" className="mb-3 text-lg font-bold">
          {t("time.slots", { day: dayName })}
        </h2>
        {week.slots.length === 0 || selected?.status !== "available" ? (
          <p className="text-ink-muted">{t("time.noSlots")}</p>
        ) : (
          <form method="post" action={action}>
            <input type="hidden" name="csrf" value={csrf} />
            {Object.entries(hidden).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {week.slots.map((slot) => (
                <li key={slot}>
                  <SubmitButton name="start" value={slot} className="slot w-full">
                    <bdi>{formatLocal(new Date(slot), "HH:mm", locale)}</bdi>
                    {submitLabel ? <span className="visually-hidden"> {submitLabel}</span> : null}
                  </SubmitButton>
                </li>
              ))}
            </ul>
          </form>
        )}
      </section>
    </div>
  );
}
