import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { confirmPushReceipt } from "@/core/platform/ownerDevices";

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
  const known = await confirmPushReceipt(parsed.data.endpoint);
  return NextResponse.json({ ok: known }, { status: known ? 200 : 404 });
}
