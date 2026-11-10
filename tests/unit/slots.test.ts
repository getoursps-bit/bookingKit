import { describe, expect, it } from "vitest";
import {
  dayStatus,
  type DayInput,
  firstAvailable,
  fitsDay,
  freeSlots,
  type SlotRules,
  visitLength,
} from "@/core/booking/slots";
import { formatHe, localDateTimeToUtc } from "@/core/platform/time";

const rules: SlotRules = { slotStepMin: 15, gapMin: 0, bufferMin: 10, noticeMin: 120, horizonDays: 30 };
const open = (weekday: number, opens = "09:00", closes = "16:00") => ({ weekday, opens, closes, closed: false });
const local = (date: string, time: string) => localDateTimeToUtc(date, time);
const times = (slots: Date[]) => slots.map((slot) => formatHe(slot, "HH:mm"));

// Monday 2 November 2026, winter time (UTC+2).
const MONDAY = "2026-11-02";
const day = (overrides: Partial<DayInput> = {}): DayInput => ({
  date: MONDAY,
  hours: open(1),
  timeOff: [],
  busy: [],
  ...overrides,
});
const earlyNow = new Date("2026-11-01T00:00:00Z");

describe("visitLength", () => {
  it("adds services, the gap between pets and one buffer", () => {
    expect(visitLength([{ durationMin: 80 }], rules)).toBe(90);
    expect(visitLength([{ durationMin: 80 }, { durationMin: 50 }], rules)).toBe(140);
    expect(
      visitLength([{ durationMin: 80 }, { durationMin: 50 }, { durationMin: 10 }], { gapMin: 5, bufferMin: 10 }),
    ).toBe(80 + 50 + 10 + 2 * 5 + 10);
    expect(visitLength([], rules)).toBe(0);
  });
});

describe("freeSlots", () => {
  it("steps from opening and the last visit ends by closing time", () => {
    // 60 minutes of work plus a 10 minute buffer: the last start is 15:00.
    const slots = times(freeSlots(day(), 70, rules, earlyNow));
    expect(slots[0]).toBe("09:00");
    expect(slots.at(-1)).toBe("15:00");
    expect(slots).toHaveLength(25);
  });

  it("keeps the last start that fits, not one past closing", () => {
    // 80 minutes of work: 14:30 ends 15:50, 14:45 would end 16:05.
    expect(times(freeSlots(day(), 90, rules, earlyNow)).at(-1)).toBe("14:30");
  });

  it("removes starts that overlap time off, buffer included", () => {
    const slots = times(
      freeSlots(
        day({ timeOff: [{ start: local(MONDAY, "11:00"), end: local(MONDAY, "12:00") }] }),
        70,
        rules,
        earlyNow,
      ),
    );
    expect(slots).toContain("09:45"); // 09:45 to 10:55
    expect(slots).not.toContain("10:00"); // would run to 11:10
    expect(slots).not.toContain("11:45");
    expect(slots).toContain("12:00");
  });

  it("removes starts that overlap a live booking", () => {
    const slots = times(
      freeSlots(day({ busy: [{ start: local(MONDAY, "13:00"), end: local(MONDAY, "14:00") }] }), 70, rules, earlyNow),
    );
    expect(slots).toContain("11:45"); // ends 12:55
    expect(slots).not.toContain("12:00");
    expect(slots).not.toContain("13:45");
    expect(slots).toContain("14:00");
  });

  it("applies the minimum notice", () => {
    const now = local(MONDAY, "08:00");
    expect(times(freeSlots(day(), 70, rules, now))[0]).toBe("10:00");
  });

  it("applies the booking horizon", () => {
    expect(freeSlots(day(), 70, rules, new Date("2026-10-01T00:00:00Z"))).toEqual([]);
    expect(freeSlots(day(), 70, rules, new Date("2026-10-04T00:00:00Z")).length).toBeGreaterThan(0);
  });

  it("returns nothing on a closed day", () => {
    expect(
      freeSlots(day({ hours: { weekday: 1, opens: null, closes: null, closed: true } }), 70, rules, earlyNow),
    ).toEqual([]);
    expect(freeSlots(day({ hours: undefined }), 70, rules, earlyNow)).toEqual([]);
  });
});

describe("dayStatus", () => {
  it("is closed with no hours or when time off covers the whole day", () => {
    expect(
      dayStatus(day({ hours: { weekday: 1, opens: null, closes: null, closed: true } }), 70, rules, earlyNow),
    ).toBe("closed");
    const sickDay = day({
      timeOff: [
        { start: local(MONDAY, "08:00"), end: local(MONDAY, "12:00") },
        { start: local(MONDAY, "12:00"), end: local(MONDAY, "17:00") },
      ],
    });
    expect(dayStatus(sickDay, 70, rules, earlyNow)).toBe("closed");
  });

  it("is full when open but nothing fits", () => {
    const booked = day({ busy: [{ start: local(MONDAY, "09:00"), end: local(MONDAY, "16:00") }] });
    expect(dayStatus(booked, 70, rules, earlyNow)).toBe("full");
  });

  it("is available otherwise", () => {
    expect(dayStatus(day(), 70, rules, earlyNow)).toBe("available");
  });
});

describe("firstAvailable", () => {
  it("scans forward to the first day with a free start", () => {
    const days: DayInput[] = [
      { date: "2026-11-04", hours: { weekday: 3, opens: null, closes: null, closed: true }, timeOff: [], busy: [] },
      {
        date: "2026-11-05",
        hours: open(4),
        timeOff: [],
        busy: [{ start: local("2026-11-05", "09:00"), end: local("2026-11-05", "16:00") }],
      },
      { date: "2026-11-06", hours: open(5, "12:00", "14:00"), timeOff: [], busy: [] },
    ];
    expect(firstAvailable(days, 70, rules, earlyNow)).toEqual({
      date: "2026-11-06",
      start: local("2026-11-06", "12:00"),
    });
    expect(firstAvailable(days.slice(0, 2), 70, rules, earlyNow)).toBeNull();
  });
});

describe("clock changes", () => {
  // Israel leaves summer time on 25 October 2026 and starts it on 27 March 2026,
  // both at 02:00 local, before the salon opens.
  for (const date of ["2026-10-24", "2026-10-25", "2026-03-26", "2026-03-27"]) {
    it(`keeps 09:00 local and an even 15 minute step on ${date}`, () => {
      const now = new Date(new Date(`${date}T00:00:00Z`).getTime() - 5 * 24 * 60 * 60_000);
      checkDay(freeSlots({ date, hours: open(0), timeOff: [], busy: [] }, 70, rules, now));
    });
  }

  it("has the right UTC offset on both sides of each change", () => {
    expect(local("2026-10-24", "09:00").toISOString()).toBe("2026-10-24T06:00:00.000Z");
    expect(local("2026-10-25", "09:00").toISOString()).toBe("2026-10-25T07:00:00.000Z");
    expect(local("2026-03-26", "09:00").toISOString()).toBe("2026-03-26T07:00:00.000Z");
    expect(local("2026-03-27", "09:00").toISOString()).toBe("2026-03-27T06:00:00.000Z");
  });

  function checkDay(slots: Date[]) {
    expect(times(slots)[0]).toBe("09:00");
    expect(times(slots).at(-1)).toBe("15:00");
    expect(slots).toHaveLength(25);
    for (let index = 1; index < slots.length; index++) {
      expect(slots[index]!.getTime() - slots[index - 1]!.getTime()).toBe(15 * 60_000);
    }
  }
});

describe("a day with a break", () => {
  // A morning and a late afternoon: 09:00 to 13:00 and 16:00 to 18:00.
  const split = { ...open(3, "09:00", "13:00"), more: [{ opens: "16:00", closes: "18:00" }] };
  const noBuffer: SlotRules = { ...rules, bufferMin: 0 };
  const WEDNESDAY = "2026-11-04";

  it("offers times in both ranges and none across the break", () => {
    const slots = times(freeSlots({ ...day(), date: WEDNESDAY, hours: split }, 60, noBuffer, earlyNow));
    expect(slots[0]).toBe("09:00");
    expect(slots).toContain("12:00"); // ends 13:00, the last of the morning
    expect(slots).not.toContain("12:15");
    expect(slots).not.toContain("15:45");
    expect(slots).toContain("16:00");
    expect(slots.at(-1)).toBe("17:00");
  });

  it("treats the break as closed time for the owner's own bookings", () => {
    const wednesday = { ...day(), date: WEDNESDAY, hours: split };
    expect(fitsDay(wednesday, local(WEDNESDAY, "12:00"), 60, 0)).toBe("ok");
    expect(fitsDay(wednesday, local(WEDNESDAY, "12:30"), 60, 0)).toBe("OutsideHours");
    expect(fitsDay(wednesday, local(WEDNESDAY, "14:00"), 60, 0)).toBe("OutsideHours");
    expect(fitsDay(wednesday, local(WEDNESDAY, "16:30"), 60, 0)).toBe("ok");
  });

  it("is closed only when time off covers both ranges", () => {
    const wednesday = { ...day(), date: WEDNESDAY, hours: split };
    const morningOff = { ...wednesday, timeOff: [{ start: local(WEDNESDAY, "08:00"), end: local(WEDNESDAY, "14:00") }] };
    expect(dayStatus(morningOff, 60, noBuffer, earlyNow)).toBe("available");
    const allOff = { ...morningOff, timeOff: [...morningOff.timeOff, { start: local(WEDNESDAY, "15:00"), end: local(WEDNESDAY, "19:00") }] };
    expect(dayStatus(allOff, 60, noBuffer, earlyNow)).toBe("closed");
  });

  it("keeps both ranges at their local times on the clock-change days", () => {
    // 25 October 2026 (autumn, 03:00 to 02:00) and 27 March 2026 (spring, 02:00 to 03:00).
    for (const [date, utcOffset] of [
      ["2026-10-25", "+02:00"],
      ["2026-03-27", "+03:00"],
    ] as const) {
      const dayBefore = new Date(new Date(`${date}T00:00:00Z`).getTime() - 86_400_000);
      const slots = freeSlots({ ...day(), date, hours: { ...split, weekday: 0 } }, 60, noBuffer, dayBefore);
      expect(slots.map((slot) => slot.toISOString())).toContain(new Date(`${date}T09:00:00${utcOffset}`).toISOString());
      expect(slots.map((slot) => slot.toISOString())).toContain(new Date(`${date}T16:00:00${utcOffset}`).toISOString());
      expect(times(slots)).not.toContain("13:00");
    }
  });
});
