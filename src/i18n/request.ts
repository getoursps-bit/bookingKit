import { getRequestConfig } from "next-intl/server";
import { messagesFor } from "./messages";
import { getLocale } from "./server";

// Tells next-intl which language and strings a request uses. The language is
// worked out by our own proxy (the address for public pages, the cookie for
// the owner area), not by the library's routing.
export default getRequestConfig(async () => {
  const locale = await getLocale();
  return { locale, messages: messagesFor(locale) };
});
