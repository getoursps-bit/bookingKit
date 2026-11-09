import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { query } from "@/server/db";

export const dynamic = "force-dynamic";

const Receipt = z.object({ endpoint: z.url().max(1000) });

/**
 * The owner device's service worker calls this when a push arrives, which
 * proves alerts still get through. The endpoint is the device's unguessable
 * push address, so it identifies the subscription.
 */
export async function POST(request: NextRequest) {
  const parsed = Receipt.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  const rows = await query("update push_subscriptions set last_receipt_at = now() where endpoint = $1 returning id", [
    parsed.data.endpoint,
  ]);
  return NextResponse.json({ ok: rows.length > 0 }, { status: rows.length > 0 ? 200 : 404 });
}
