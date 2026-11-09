import { describe, expect, it } from "vitest";
import { formatHe, localDateOf, localDateTimeToUtc, localDayBounds } from "@/server/time";

const HOUR = 3_600_000;

describe("Israel time", () => {
  it("keeps 09:00 local across the autumn clock change (25 October 2026)", () => {
    // Summer time (UTC+3) before, winter time (UTC+2) after.
    expect(localDateTimeToUtc("2026-10-24", "09:00").toISOString()).toBe("2026-10-24T06:00:00.000Z");
    expect(localDateTimeToUtc("2026-10-26", "09:00").toISOString()).toBe("2026-10-26T07:00:00.000Z");
  });

  it("keeps 09:00 local across the spring clock change (27 March 2026)", () => {
    expect(localDateTimeToUtc("2026-03-26", "09:00").toISOString()).toBe("2026-03-26T07:00:00.000Z");
    expect(localDateTimeToUtc("2026-03-28", "09:00").toISOString()).toBe("2026-03-28T06:00:00.000Z");
  });

  it("gives the change days their real length", () => {
    const autumn = localDayBounds("2026-10-25");
    expect(autumn.end.getTime() - autumn.start.getTime()).toBe(25 * HOUR);
    const spring = localDayBounds("2026-03-27");
    expect(spring.end.getTime() - spring.start.getTime()).toBe(23 * HOUR);
    const normal = localDayBounds("2026-06-01");
    expect(normal.end.getTime() - normal.start.getTime()).toBe(24 * HOUR);
  });

  it("finds the local date of a late-evening UTC instant", () => {
    // 22:30 UTC on 1 June is 01:30 on 2 June in Israel.
    expect(localDateOf(new Date("2026-06-01T22:30:00Z"))).toBe("2026-06-02");
  });

  it("formats day first in Israel time", () => {
    expect(formatHe(new Date("2026-10-26T07:00:00Z"))).toBe("26/10/2026 09:00");
  });

  it("rejects malformed input", () => {
    expect(() => localDateTimeToUtc("26/10/2026", "09:00")).toThrow();
    expect(() => localDateTimeToUtc("2026-10-26", "9:00")).toThrow();
  });
});
