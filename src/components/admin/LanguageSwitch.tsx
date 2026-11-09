import { type Locale, LOCALES, PACKS } from "@/i18n/locales";

/**
 * Links to the owner area in each other language. The route remembers the
 * choice in a cookie and returns to `back`. Each link is written in the
 * language it switches to, so it carries that language's `lang` and direction.
 */
export function LanguageSwitch({ locale, back, className }: { locale: Locale; back: string; className?: string }) {
  return LOCALES.filter((other) => other !== locale).map((other) => (
    <a
      key={other}
      href={`/lang/${other}?back=${encodeURIComponent(back)}`}
      lang={other}
      hrefLang={other}
      dir={PACKS[other].dir}
      className={className ?? "text-sm font-semibold underline"}
    >
      {PACKS[other].name}
    </a>
  ));
}
