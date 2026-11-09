import { getI18n } from "@/i18n/server";

/** First focusable element on every page; jumps keyboard users past the header. */
export async function SkipLink() {
  const { t } = await getI18n();
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2"
    >
      {t("nav.skipToContent")}
    </a>
  );
}
