import { describe, expect, it } from "vitest";
import { testDbAvailable, withMigratedSchema } from "../setup/db";
import { readRanges } from "@ext/split-hours/server/ranges";
import { getOpeningHours, setOpeningHours } from "@/core/booking/catalog";
import { hourRanges } from "@/core/booking/hours";
import { hasExtension } from "@/extension/registry";
import { localBusinessJsonLd } from "@/core/website/seo";

const hasDb = await testDbAvailable();
const first = { opens: "09:00", closes: "13:00" };

describe("the second range on the hours form", () => {
  it("is read only when ticked, and must come after the first", () => {
    const form = { "split.3": "on", "opens2.3": "16:00", "closes2.3": "18:00" };
    expect(readRanges(form, 3, first)).toEqual([{ opens: "16:00", closes: "18:00" }]);
    expect(readRanges({ ...form, "split.3": undefined }, 3, first)).toEqual([]);
    expect(readRanges(form, 3, null)).toEqual([]);
    expect(readRanges({ ...form, "opens2.3": "12:00" }, 3, first)).toBe("invalid");
    expect(readRanges({ ...form, "closes2.3": "16:00" }, 3, first)).toBe("invalid");
    expect(readRanges({ ...form, "opens2.3": "4pm" }, 3, first)).toBe("invalid");
  });
});

describe.skipIf(!hasDb || !hasExtension("split-hours"))("a day with two ranges", () => {
  it("is saved with the day, listed for search engines, and gone when the day closes", async () => {
    await withMigratedSchema(async (pool) => {
      const writer = { staffId: null, db: pool };
      await setOpeningHours({ weekday: 3, closed: false, ...first, more: [{ opens: "16:00", closes: "18:00" }] }, writer);
      const wednesday = (await getOpeningHours(pool)).find((day) => day.weekday === 3);
      expect(hourRanges(wednesday)).toEqual([first, { opens: "16:00", closes: "18:00" }]);

      const profile = { name: "Sample", tagline: null, translations: {}, city: null, address: null, phoneE164: null, social: {}, logoKey: null, coverKey: null };
      const listed = localBusinessJsonLd(profile, [wednesday!], "https://example.test").openingHoursSpecification;
      expect(listed.map((entry) => `${entry.opens}-${entry.closes}`)).toEqual(["09:00-13:00", "16:00-18:00"]);

      await setOpeningHours({ weekday: 3, closed: true, opens: null, closes: null, more: [] }, writer);
      expect(hourRanges((await getOpeningHours(pool)).find((day) => day.weekday === 3))).toEqual([]);
      await setOpeningHours({ weekday: 3, closed: false, ...first }, writer);
      expect(hourRanges((await getOpeningHours(pool)).find((day) => day.weekday === 3))).toEqual([first]);
    });
  });
});
