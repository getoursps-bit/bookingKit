// The standalone server leaves SIGTERM to the app (NEXT_MANUAL_SIG_HANDLE=true
// in the image), so the container contract's clean shutdown lives here: close
// the database pool, then exit 0.
import { closePool } from "./core/platform/db";
import { log } from "./core/platform/log";

let stopping = false;

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  log.info({ signal }, "web stopping");
  // Give requests already in flight a moment to finish.
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  await closePool().catch(() => undefined);
  process.exit(0);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
