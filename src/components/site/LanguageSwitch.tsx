"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useI18n } from "@/i18n/client";
import { localePath, splitLocale } from "@/i18n/locales";

function SwitchLink({ className }: { className?: string }) {
  const { locale, t } = useI18n();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const other = locale === "he" ? "en" : "he";
  const { path } = splitLocale(pathname);
  const href = localePath(other, `${path}${search ? `?${search}` : ""}`);
  // A full page load: the language changes the page direction and every string.
  return (
    <a href={href} lang={other} hrefLang={other} className={className}>
      {t("lang.other")}
    </a>
  );
}

/** The same page in the other language. */
export function LanguageSwitch({ className }: { className?: string }) {
  return (
    <Suspense fallback={null}>
      <SwitchLink className={className} />
    </Suspense>
  );
}
