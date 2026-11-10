"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Icon } from "@/views/parts/ui/Icon";
import { useI18n } from "@/i18n/client";
import { splitLocale } from "@/i18n/locales";
import { InstallButton, useCanInstall } from "./InstallButton";

const CLOSED_KEY = "bk-install-closed";
/** Where a floating card would sit over the buttons a customer needs. */
const NOT_HERE = /^\/(book|b)(\/|$)/;

function closedThisVisit(): boolean {
  try {
    return sessionStorage.getItem(CLOSED_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberClosed(): void {
  try {
    sessionStorage.setItem(CLOSED_KEY, "1");
  } catch {
    // Private mode: the card just shows again on the next page.
  }
}

const subscribeNever = () => () => undefined;

/**
 * Registers the service worker and shows the "install as an app" card in every
 * browser, until the site runs as the installed app. Closing it lasts for this
 * visit; the home page keeps its own install button either way.
 */
export function InstallPrompt() {
  const { t } = useI18n();
  const pathname = usePathname();
  const canInstall = useCanInstall(false);
  const closedBefore = useSyncExternalStore(subscribeNever, closedThisVisit, () => false);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }
  }, []);

  if (!canInstall || closed || closedBefore || NOT_HERE.test(splitLocale(pathname).path)) return null;

  const close = () => {
    rememberClosed();
    setClosed(true);
  };

  return (
    <aside
      aria-label={t("pwa.install")}
      className="card fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 flex items-center gap-3 p-3 md:inset-x-auto md:end-6 md:bottom-6 md:max-w-sm"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-white">
        <Icon name="download" />
      </span>
      <InstallButton className="min-h-11 flex-1 text-start font-semibold" onInstalled={close} />
      <button
        type="button"
        onClick={close}
        className="grid size-10 place-items-center rounded-full hover:bg-brand-soft"
        aria-label={t("dialog.close")}
      >
        <Icon name="close" />
      </button>
    </aside>
  );
}
