"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useI18n } from "@/i18n/client";
import { LanguageSwitch } from "./LanguageSwitch";
import { NavLinks } from "./NavLinks";

/**
 * The phone menu from the mobile design: a button that opens a panel with the
 * main links, the accessibility statement and the language switch. Escape and
 * the close button shut it and return focus to the menu button.
 */
export function MobileMenu() {
  const { t, lp } = useI18n();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="grid size-11 place-items-center rounded-full text-ink hover:bg-brand-soft"
      >
        <Icon name={open ? "close" : "menu"} size={24} />
        <span className="visually-hidden">{open ? t("nav.closeMenu") : t("nav.menu")}</span>
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute inset-x-0 top-full z-40 border-b border-line bg-surface px-4 pb-5 shadow-[var(--shadow-float)]"
      >
        <nav aria-label={t("nav.menu")}>
          <NavLinks variant="menu" onNavigate={() => setOpen(false)} />
        </nav>
        <div className="mt-4 flex items-center justify-between gap-4">
          <Link href={lp("/accessibility")} onClick={() => setOpen(false)} className="text-ink-muted">
            {t("nav.a11yShort")}
          </Link>
          <LanguageSwitch className="btn btn-secondary min-h-11 px-4" />
        </div>
      </div>
    </div>
  );
}
