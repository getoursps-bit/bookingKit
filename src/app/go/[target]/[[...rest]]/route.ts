import { type NextRequest, NextResponse } from "next/server";
import { formatPrice } from "@/i18n/format";
import { pick } from "@/i18n/content";
import { localePath } from "@/i18n/locales";
import { translator } from "@/i18n/translator";
import { MULTI_LINE_BOOKING } from "@/server/booking/draft";
import { getDraft, requestLocale, setDraft } from "@/server/booking/http";
import { getConfig } from "@/server/config";
import { whatsappLink } from "@/server/links";
import { listProducts, listServices } from "@/server/repos/catalog";
import { getSettings } from "@/server/repos/settings";
import { countClick } from "@/server/tracking";
import { firstWith } from "@/extension/registry";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ target: string; rest?: string[] }> };

// Counted redirects, so "Book" and "Order on WhatsApp" clicks are measured
// without any script on the page:
//   /go/book[?<filter>=<value>] → /book (or /en/book, in the visitor's language), keeping an extension's
//                                 service filter such as species=dog
//   /go/book?service=<id>       → the time step with that service chosen (with several lines on:
//                                 the first step, with it added as one more line)
//   /go/book?at=<ISO instant>   → the same, with that start saved in the booking draft for the
//                                 time step (straight to it when services are already chosen)
//   /go/order/<productId>       → wa.me chat with the product named
/** A start from the address, if it is a real time in the next 60 days. */
function wantedStart(value: string | null): string | null {
  const at = value ? new Date(value) : null;
  if (!at || Number.isNaN(at.getTime())) return null;
  const ahead = at.getTime() - Date.now();
  return ahead > 0 && ahead < 60 * 86_400_000 ? at.toISOString() : null;
}

export async function GET(request: NextRequest, { params }: Props): Promise<Response> {
  const { target, rest = [] } = await params;
  // Redirects use the public address: behind the proxy, the request's own
  // host is the container's (for example 0.0.0.0:3000).
  const base = getConfig().APP_BASE_URL;
  const locale = requestLocale(request);

  if (target === "book") {
    await countClick("book");
    const to = new URL(localePath(locale, "/book"), base);
    // A filter of the service list that an extension offers ("species=dog") carries over.
    const filter = firstWith("serviceTags")?.param;
    const value = filter ? request.nextUrl.searchParams.get(filter.name) : null;
    if (filter && value && filter.values.includes(value)) to.searchParams.set(filter.name, value);
    const at = wantedStart(request.nextUrl.searchParams.get("at"));
    const serviceId = Number(request.nextUrl.searchParams.get("service"));
    let draft = getDraft(request);
    let chosen = false;
    if (Number.isInteger(serviceId) && serviceId > 0 && (!MULTI_LINE_BOOKING || !draft.serviceIds.includes(serviceId))) {
      const [settings, services] = await Promise.all([getSettings(), listServices({ activeOnly: true })]);
      const bookable = services.some((service) => service.id === serviceId && service.bookableOnline);
      if (bookable && !MULTI_LINE_BOOKING) {
        // One line per booking: the link's service is the booking's, and the time comes next.
        draft = { ...draft, serviceIds: [serviceId], details: [], start: null, holdId: null };
        chosen = true;
      } else if (bookable && draft.serviceIds.length < settings["booking.maxLines"]) {
        // A service link adds the service as one more line; the first step shows it as chosen.
        draft = { ...draft, serviceIds: [...draft.serviceIds, serviceId], start: null, holdId: null };
      }
    } else if (!at) {
      return NextResponse.redirect(to, 303);
    }
    if ((at || chosen) && draft.serviceIds.length > 0) to.searchParams.set("step", "time");
    const response = NextResponse.redirect(to, 303);
    setDraft(request, response, at ? { ...draft, wantedStart: at } : draft);
    return response;
  }

  if (target === "order" && rest.length === 1 && /^\d+$/.test(rest[0]!)) {
    const [settings, products] = await Promise.all([getSettings(), listProducts({ activeOnly: true })]);
    const product = products.find((candidate) => candidate.id === Number(rest[0]));
    const text = product
      ? translator(locale)("products.orderText", {
          name: pick(locale, product, "name"),
          price: formatPrice(product.priceAgorot, locale),
        })
      : undefined;
    const link = product ? whatsappLink(settings["whatsapp.chatNumber"], text) : null;
    if (!link) return NextResponse.redirect(new URL(localePath(locale, "/contact"), base), 303);
    await countClick("order_whatsapp");
    return NextResponse.redirect(link, 303);
  }

  return new NextResponse(null, { status: 404 });
}
