"use client";

import { useState, useSyncExternalStore } from "react";
import { Dialog } from "@/views/parts/ui/Dialog";
import { Icon } from "@/views/parts/ui/Icon";
import { useI18n } from "@/i18n/client";
import type { MessageKey } from "@/i18n/t";
import { installPlatform, type InstallPlatform } from "./install-platform";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const STEPS: Record<InstallPlatform, MessageKey[]> = {
  ios: ["pwa.ios1", "pwa.ios2", "pwa.ios3"],
  macSafari: ["pwa.mac1", "pwa.mac2"],
  other: ["pwa.other1", "pwa.other2"],
};

// Kept outside React: the browser raises this event once, often before the page is interactive.
let installEvent: InstallEvent | null = null;
let installed = false;
const watchers = new Set<() => void>();
const changed = () => watchers.forEach((watcher) => watcher());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installEvent = event as InstallEvent;
  });
  window.addEventListener("appinstalled", () => {
    installEvent = null;
    installed = true;
    changed();
  });
}

function subscribe(watcher: () => void) {
  watchers.add(watcher);
  return () => void watchers.delete(watcher);
}

function runsAsApp(): boolean {
  return (
    installed ||
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** True in a browser tab; false once the site runs as the installed app. Before the page starts it says `beforeStart`. */
export function useCanInstall(beforeStart: boolean): boolean {
  return useSyncExternalStore(
    subscribe,
    () => !runsAsApp(),
    () => beforeStart,
  );
}

/**
 * Offers the app in any browser. Chrome, Edge and Android open their own
 * install dialog. Safari lets no website do that, so there, and whenever the
 * browser gave no install event, the button shows the steps instead.
 */
export function InstallButton({ className, onInstalled }: { className?: string; onInstalled?: () => void }) {
  const { t } = useI18n();
  const canInstall = useCanInstall(true);
  const [steps, setSteps] = useState<MessageKey[] | null>(null);
  if (!canInstall) return null;

  const install = async () => {
    if (!installEvent) {
      setSteps(STEPS[installPlatform(navigator.userAgent, navigator.maxTouchPoints)]);
      return;
    }
    const event = installEvent;
    // The browser allows one prompt per event; a later tap shows the steps.
    installEvent = null;
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === "accepted") onInstalled?.();
  };

  return (
    <>
      <button type="button" onClick={install} className={className}>
        {t("pwa.install")}
      </button>
      {/* Mounted only when open: the dialog's title has a fixed id and the home page has two of these buttons. */}
      {steps ? (
        <Dialog open title={t("pwa.stepsTitle")} onClose={() => setSteps(null)}>
          <ol className="flex flex-col gap-3">
            {steps.map((key, index) => (
              <li key={key} className="flex gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-paper text-sm font-bold">
                  {index + 1}
                </span>
                <span>{t(key)}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 flex gap-2 text-sm text-ink-muted">
            <Icon name="alert" size={18} className="mt-0.5 shrink-0" />
            {t("pwa.note")}
          </p>
        </Dialog>
      ) : null}
    </>
  );
}
