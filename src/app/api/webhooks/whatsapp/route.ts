import { NextResponse, type NextRequest } from "next/server";
import { getConfig, providerMode } from "@/core/platform/config";
import { handleWebhook, signatureOk } from "@/core/platform/notify/webhook";

export const dynamic = "force-dynamic";

/** The signing secret: the real one, or with fake providers the session secret, so tests can sign. */
function secret(): string | null {
  const config = getConfig();
  const mode = providerMode("whatsapp");
  if (mode === "real") return config.WEBHOOK_SECRET_MESSAGING ?? null;
  if (mode === "fake") return config.SESSION_SECRET;
  return null;
}

/** Meta's subscription check: echo the challenge when the verify token matches. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const config = getConfig();
  const expected = providerMode("whatsapp") === "real" ? config.WHATSAPP_VERIFY_TOKEN : null;
  if (params.get("hub.mode") === "subscribe" && expected && params.get("hub.verify_token") === expected) {
    return new NextResponse(params.get("hub.challenge") ?? "", { headers: { "Content-Type": "text/plain" } });
  }
  return new NextResponse("forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  const key = secret();
  if (!key) return new NextResponse("not found", { status: 404 });
  const raw = await request.text();
  if (!signatureOk(key, raw, request.headers.get("x-hub-signature-256"))) {
    return new NextResponse("bad signature", { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse("bad body", { status: 400 });
  }
  const result = await handleWebhook(body);
  return NextResponse.json(result);
}
