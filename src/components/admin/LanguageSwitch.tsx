import type { Locale } from "@/i18n/locales";
import { translator } from "@/i18n/t";

/**
 * A link to the owner area in the other language. The route remembers the
 * choice in a cookie and returns to `back`. The link text is written in the
 * language it switches to, so it carries that language's `lang` and direction.
 */
export function LanguageSwitch({ locale, back, className }: { locale: Locale; back: string; className?: string }) {
  const other: Locale = locale === "he" ? "en" : "he";
  return (
    <a
      href={`/lang/${other}?back=${encodeURIComponent(back)}`}
      lang={other}
      hrefLang={other}
      dir={other === "he" ? "rtl" : "ltr"}
      className={className ?? "text-sm font-semibold underline"}
    >
      {translator(other)(`lang.name.${other}`)}
    </a>
  );
}
