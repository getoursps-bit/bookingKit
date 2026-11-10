// Worker entry point: sends the outbox and runs the timed jobs. Several copies
// may run at once; row locks and `job_runs` keep each piece of work single.
export {};

// Set before the logger loads, so every log line is tagged with this service.
process.env.APP_SERVICE ??= "worker";

const { log } = await import("../src/core/platform/log");
const { getConfig } = await import("../src/core/platform/config");
const { closePool, getPool } = await import("../src/core/platform/db");
const { claimDue, markFailed } = await import("../src/core/platform/outbox");
const { releaseExpiredHolds } = await import("../src/core/booking/appointments");
const { pruneTokens } = await import("../src/core/booking/manageTokens");
const { pruneRateLimits } = await import("../src/core/platform/rateLimits");
const { cleanup: cleanupCodes } = await import("../src/core/platform/identity/codes");
const { dispatch } = await import("../src/core/platform/notify/dispatch");
const { claimDaily } = await import("../src/core/platform/jobRuns");
const { checkMessageCap, checkReceipts, queueDailyCheck } = await import("../src/core/platform/ownerAlerts");
const { extensions } = await import("../src/extension/registry");

// Bad configuration stops the worker at once, so the container restarts and shows it,
// instead of logging the same error every few seconds.
try {
  getConfig();
} catch (error) {
  log.fatal({ err: error }, "worker cannot start");
  process.exit(1);
}

const OUTBOX_MS = 5_000;
const MINUTE_MS = 60_000;
const BATCH = 20;
let stopping = false;
let busy: Promise<void> = Promise.resolve();

/** Claims due rows and sends them one by one. A row that throws goes back to the queue. */
async function sendOutbox(): Promise<void> {
  const db = getPool();
  const rows = await claimDue(BATCH, undefined, db);
  for (const row of rows) {
    try {
      await dispatch(row, db);
    } catch (error) {
      log.error({ err: error, outboxId: row.id }, "outbox row failed");
      await markFailed(row.id, {
        channel: null,
        error: (error as Error).message,
        retryAt: new Date(Date.now() + row.attempts * row.attempts * MINUTE_MS),
      });
    }
  }
}

const DAILY: { name: string; hour: number; run: (now: Date) => Promise<unknown> }[] = [
  {
    name: "cleanup",
    hour: 3,
    run: async () => {
      const db = getPool();
      const codes = await cleanupCodes(db);
      const limits = await pruneRateLimits(db);
      await pruneTokens(db);
      // Each extension that is on cleans up what it keeps (pet photos, say).
      const extra: Record<string, number> = {};
      for (const extension of extensions()) Object.assign(extra, await extension.cleanup?.(db, new Date()));
      log.info({ codes, limits, ...extra }, "daily clean-up");
    },
  },
  { name: "owner_check", hour: 8, run: (now) => queueDailyCheck(now, getPool()) },
  { name: "owner_receipts", hour: 14, run: (now) => checkReceipts(now, getPool()) },
  // The daily jobs of the extensions that are on.
  ...extensions().flatMap((extension) =>
    (extension.daily ?? []).map((job) => ({ name: job.name, hour: job.hour, run: (now: Date) => job.run(now, getPool()) })),
  ),
];

async function everyMinute(): Promise<void> {
  const db = getPool();
  const now = new Date();
  const released = await releaseExpiredHolds(now, db);
  if (released > 0) log.info({ released }, "expired holds released");
  await checkMessageCap(now, db);
  for (const job of DAILY) {
    if (await claimDaily(job.name, job.hour, now, db)) {
      log.info({ job: job.name }, "daily job");
      await job.run(now);
    }
  }
  // Each extension's own work, after the core's. One that fails is logged and does not stop the others.
  for (const extension of extensions()) {
    if (!extension.minute) continue;
    try {
      const did = await extension.minute(db, now);
      if (Object.values(did).some((count) => count > 0)) log.info({ extension: extension.id, ...did }, "extension work");
    } catch (error) {
      log.error({ err: error, extension: extension.id }, "extension work failed");
    }
  }
}

/** Runs one task at a time, so shutdown can wait for the one in flight. */
function run(name: string, task: () => Promise<void>): void {
  if (stopping) return;
  busy = busy.then(task).catch((error: unknown) => log.error({ err: error, task: name }, "worker task failed"));
}

const outboxTimer = setInterval(() => run("outbox", sendOutbox), OUTBOX_MS);
const minuteTimer = setInterval(() => run("minute", everyMinute), MINUTE_MS);
run("minute", everyMinute);

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  log.info({ signal }, "worker stopping");
  clearInterval(outboxTimer);
  clearInterval(minuteTimer);
  await busy;
  await closePool();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

log.info("worker started");
