import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { csrfOk } from "@/core/booking/http";
import { saveOwnerDevice } from "@/core/platform/ownerDevices";
import { resolveSession, SESSION_COOKIE } from "@/core/platform/staff/auth";

export const dynamic = "force-dynamic";

const Body = z.object({
  csrf: z.string(),
  subscription: z.object({
    endpoint: z.url().max(1000),
    keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
  }),
});

/** Stores this device's push subscription for the signed-in staff member only. */
export async function POST(request: NextRequest) {
  const staff = await resolveSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!staff) return NextResponse.json({ ok: false }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !csrfOk(request, { csrf: parsed.data.csrf })) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  await saveOwnerDevice(staff.id, parsed.data.subscription, request.headers.get("user-agent"));
  return NextResponse.json({ ok: true });
}
