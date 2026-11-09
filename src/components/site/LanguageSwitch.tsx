"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useI18n } from "@/i18n/client";
import { localePath, othersThan, PACKS, splitLocale } from "@/i18n/locales";

function SwitchLinks({ className }: { className?: string }) {
  const { locale } = useI18n();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const { path } = splitLocale(pathname);
  // A full page load: the language changes the page direction and every string.
  return othersThan(locale).map((other) => (
    <a
      key={other}
      href={localePath(other, `${path}${search ? `?${search}` : ""}`)}
      lang={other}
      hrefLang={other}
      className={className}
    >
      {PACKS[other].name}
    </a>
  ));
}

/** The same page in each other language, each link written in its own language. Nothing for a one-language site. */
export function LanguageSwitch({ className }: { className?: string }) {
  return (
    <Suspense fallback={null}>
      <SwitchLinks className={className} />
    </Suspense>
  );
}
