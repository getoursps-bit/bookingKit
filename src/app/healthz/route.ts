import { query } from "@/server/db";
import { log } from "@/server/log";

export const dynamic = "force-dynamic";

/** Answers 200 once Postgres responds, 503 otherwise. The server's deploy tool polls this path. */
export async function GET(): Promise<Response> {
  try {
    await query("select 1");
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    log.warn({ err: error }, "health check failed");
    return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
