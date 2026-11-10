import { randomUUID } from "node:crypto";
import type pg from "pg";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { openDay } from "../setup/days";
import { testDbAvailable, withMigratedSchema } from "../setup/db";
import { createFakeAi } from "@ext/ai/server/fake";
import { runAiJobs } from "@ext/ai/server/jobs";
import { queueSummaries } from "@ext/ai/server/summary";
import { PhotoResult } from "@ext/pets/server/photo-ai";
import { acceptSuggestion, deleteExpiredPhotos, petPhotoLines, savePetPhoto } from "@ext/pets/server/photos";
import { hasExtension } from "@/extension/registry";
import { bookingsBetween } from "@/server/admin/data";
import { erase } from "@/server/repos/customers";
import { confirmBooking, requestHold } from "@/server/booking/service";
import { addLocalDays } from "@/server/booking/slots";
import { getStorage } from "@/server/storage";
import { localDateTimeToUtc } from "@/server/time";
import { testDog } from "../setup/pets";

const hasDb = await testDbAvailable();

async function setting(pool: pg.Pool, key: string, value: unknown) {
  await pool.query(
    "insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value",
    [key, JSON.stringify(value)],
  );
}

async function booked(pool: pg.Pool, n: number, ahead = 3, time = "10:00") {
  const hold = await requestHold(
    {
      start: localDateTimeToUtc(openDay(ahead), time),
      lines: [testDog],
      name: `לקוח ${n}`,
      phone: `+97255503${String(n).padStart(4, "0")}`,
      idempotencyKey: randomUUID(),
      address: `10.3.0.${n}`,
    },
    { db: pool },
  );
  if (!hold.ok) throw new Error(hold.reason);
  const confirmed = await confirmBooking(hold.hold.appointmentId, { db: pool });
  if (!confirmed.ok) throw new Error(confirmed.reason);
  return { id: hold.hold.appointmentId, token: confirmed.booking.manageToken };
}

async function summaryJob(pool: pg.Pool, appointmentId: number) {
  await pool.query("insert into ai_jobs (kind, appointment_id) values ('summary', $1)", [appointmentId]);
}

const jobs = (pool: pg.Pool) =>
  pool.query("select kind, status, attempts, error, cost_agorot as cost, result from ai_jobs order by id").then((r) => r.rows);
const spend = (pool: pg.Pool) => pool.query("select coalesce(sum(total_agorot), 0)::int as total from ai_spend").then((r) => r.rows[0].total);

describe("settings of an extension", () => {
  it("are known only while the extension is on", async () => {
    const { allSettingDefaults, isSettingKey, settingValid } = await import("@/server/repos/settings");
    expect(isSettingKey("booking.maxLines")).toBe(true);
    expect(isSettingKey("ai.summary")).toBe(hasExtension("ai"));
    expect(isSettingKey("ai.photo")).toBe(hasExtension("pets"));
    expect(settingValid("ai.summary", "yes")).toBe(false);
    if (hasExtension("ai")) {
      expect(settingValid("ai.summary", true)).toBe(true);
      expect(allSettingDefaults()).toMatchObject({ "ai.summary": false, "cap.aiMonthlyAgorot": 15000 });
    }
  });
});

describe("photo result check", () => {
  it("accepts only the fixed fields and conditions", () => {
    expect(PhotoResult.safeParse({ species: "dog", breed: "פודל", coat: "תלתלי", condition: "matted" }).success).toBe(true);
    expect(PhotoResult.safeParse({ species: "dog", breed: null, coat: null, condition: "injured" }).success).toBe(false);
    expect(PhotoResult.safeParse({ species: "horse", breed: null, coat: null, condition: "normal" }).success).toBe(false);
    expect(PhotoResult.safeParse("a sick dog").success).toBe(false);
  });
});

describe.skipIf(!hasDb || !hasExtension("ai"))("AI jobs", () => {
  it("with the switch off, no job runs and nothing is spent", async () => {
    await withMigratedSchema(async (pool) => {
      const booking = await booked(pool, 1);
      await summaryJob(pool, booking.id);
      const ai = createFakeAi();
      await runAiJobs({ db: pool, ai });
      expect(ai.calls).toBe(0);
      expect((await jobs(pool))[0]).toMatchObject({ status: "skipped", error: "switched off" });
      expect(await queueSummaries(new Date(), pool)).toBe(0);
    });
  });

  it("writes a summary and records model, prompt and cost", async () => {
    await withMigratedSchema(async (pool) => {
      await setting(pool, "ai.summary", true);
      const booking = await booked(pool, 2);
      await summaryJob(pool, booking.id);
      await runAiJobs({ db: pool, ai: createFakeAi() });
      const [job] = await jobs(pool);
      expect(job).toMatchObject({ status: "done", cost: 5 });
      // The pet's name is in the note when the client books pets.
      if (hasExtension("pets")) expect(job.result.text).toContain("בדיקה");
      expect(await spend(pool)).toBe(5);

      // The owner reads the note with the booking, on her today page and calendar.
      const [shown] = await bookingsBetween(new Date(), new Date(Date.now() + 30 * 86_400_000), {}, pool);
      expect(shown?.summary).toBe(job.result.text);

      // Erasing the customer removes the note, which holds what the customer wrote.
      await erase(shown!.customerId, pool);
      expect(await jobs(pool)).toEqual([]);
    });
  });

  it("the cap stops calls and tells the owner once", async () => {
    await withMigratedSchema(async (pool) => {
      await setting(pool, "ai.summary", true);
      await setting(pool, "cap.aiMonthlyAgorot", 3);
      await summaryJob(pool, (await booked(pool, 3)).id);
      await summaryJob(pool, (await booked(pool, 4, 3, "13:00")).id);
      const ai = createFakeAi();
      await runAiJobs({ db: pool, ai });
      expect(ai.calls).toBe(0);
      expect((await jobs(pool)).map((job) => job.error)).toEqual(["monthly cap", "monthly cap"]);
      const events = await pool.query("select 1 from owner_events where type = 'ai_cap_reached'");
      expect(events.rowCount).toBe(1);
    });
  });

  it("a failing or slow provider fails quietly after two tries and leaves the booking alone", async () => {
    await withMigratedSchema(async (pool) => {
      await setting(pool, "ai.summary", true);
      const booking = await booked(pool, 5);
      const second = await booked(pool, 6, 3, "13:00");
      await summaryJob(pool, booking.id);
      await summaryJob(pool, second.id);
      const messagesBefore = (await pool.query("select 1 from message_outbox")).rowCount;
      const ai = createFakeAi();
      ai.mode = "fail";
      await runAiJobs({ db: pool, ai, limit: 2 });
      ai.mode = "slow";
      await runAiJobs({ db: pool, ai, timeoutMs: 30 });
      const rows = await jobs(pool);
      expect(rows.map((job) => [job.status, job.attempts])).toEqual([
        ["failed", 2],
        ["failed", 2],
      ]);
      const status = await pool.query("select status from appointments where id = any($1)", [[booking.id, second.id]]);
      expect(status.rows.map((row) => row.status)).toEqual(["confirmed", "confirmed"]);
      // Only the tokens the failed calls used stay counted.
      expect(await spend(pool)).toBe(2);
      // Nothing reaches the customer or the owner.
      expect((await pool.query("select 1 from message_outbox")).rowCount).toBe(messagesBefore);
    });
  });

  it("invalid output counts as a failure", async () => {
    await withMigratedSchema(async (pool) => {
      await setting(pool, "ai.summary", true);
      await summaryJob(pool, (await booked(pool, 7)).id);
      const ai = createFakeAi();
      ai.mode = "invalid";
      await runAiJobs({ db: pool, ai });
      expect((await jobs(pool))[0]).toMatchObject({ status: "failed", result: null });
    });
  });

  it("queues tomorrow's summaries once at 19:00", async () => {
    await withMigratedSchema(async (pool) => {
      await setting(pool, "ai.summary", true);
      await booked(pool, 8, 1);
      const evening = localDateTimeToUtc(addLocalDays(openDay(1), -1), "19:00");
      expect(await queueSummaries(evening, pool)).toBe(1);
      expect(await queueSummaries(evening, pool)).toBe(0);
      expect((await jobs(pool))[0]).toMatchObject({ kind: "summary", status: "queued" });
    });
  });
});

describe.skipIf(!hasDb || !hasExtension("pets") || !hasExtension("ai"))("pet photos", () => {
  it("re-encodes without metadata, suggests, saves the accepted values, and expires", async () => {
    await withMigratedSchema(async (pool) => {
      await setting(pool, "ai.photo", true);
      const booking = await booked(pool, 9);
      const [{ id: petId }] = (await pool.query("select pet_id::int as id from appointment_lines where appointment_id = $1", [booking.id])).rows;
      const png = await sharp({ create: { width: 2000, height: 1500, channels: 3, background: "#c99" } })
        .withMetadata({ exif: { IFD0: { Copyright: "test" } } })
        .png()
        .toBuffer();

      expect(await savePetPhoto({ token: booking.token, petId, bytes: new Uint8Array([1, 2, 3]), type: "image/png" }, pool)).toEqual({
        ok: false,
        reason: "Invalid",
      });
      expect(await savePetPhoto({ token: booking.token, petId: petId + 999, bytes: png, type: "image/png" }, pool)).toEqual({
        ok: false,
        reason: "NotFound",
      });
      expect(await savePetPhoto({ token: booking.token, petId, bytes: png, type: "image/png" }, pool)).toEqual({ ok: true });

      const [photo] = (await pool.query("select storage_key as key from pet_photos")).rows;
      const stored = await getStorage().get(photo.key);
      const meta = await sharp(stored!).metadata();
      expect(meta).toMatchObject({ format: "webp", width: 1280 });
      expect(meta.exif).toBeUndefined();
      expect((await pool.query("select purpose from consents where purpose = 'photo_analysis'")).rowCount).toBe(1);

      await runAiJobs({ db: pool, ai: createFakeAi() });
      expect((await petPhotoLines(booking.id, pool))[0]?.suggestion).toMatchObject({ breed: "פודל מעורב", condition: "tangled" });

      expect(await acceptSuggestion({ token: booking.token, petId, breed: "פודל", condition: "matted" }, pool)).toBe(true);
      const [pet] = (await pool.query("select breed, coat_type, coat_condition from pets where id = $1", [petId])).rows;
      expect(pet).toEqual({ breed: "פודל", coat_type: "תלתלי", coat_condition: "matted" });
      expect((await petPhotoLines(booking.id, pool))[0]?.suggestion).toBeNull();

      const later = new Date(Date.now() + 100 * 86_400_000);
      expect(await deleteExpiredPhotos(later, pool)).toBe(1);
      expect(await getStorage().get(photo.key)).toBeNull();
    });
  });
});
