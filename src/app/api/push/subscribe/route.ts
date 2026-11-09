import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { csrfOk } from "@/server/booking/http";
import { query } from "@/server/db";
import { resolveSession, SESSION_COOKIE } from "@/server/staff/auth";

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
  const { endpoint, keys } = parsed.data.subscription;
  await query(
    `insert into push_subscriptions (staff_id, endpoint, p256dh, auth, device_label)
     values ($1, $2, $3, $4, left($5, 200))
     on conflict (endpoint) do update set staff_id = excluded.staff_id, customer_id = null,
       p256dh = excluded.p256dh, auth = excluded.auth, device_label = excluded.device_label`,
    [staff.id, endpoint, keys.p256dh, keys.auth, request.headers.get("user-agent")],
  );
  return NextResponse.json({ ok: true });
}
