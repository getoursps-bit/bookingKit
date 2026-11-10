"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/views/parts/ui/Icon";
import { useI18n } from "@/i18n/client";

const SW_URL = "/admin-sw.js";
const SCOPE = "/admin/";

/** Registers the admin's own service worker (scope /admin/), which shows alerts. */
export function AdminServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register(SW_URL, { scope: SCOPE }).catch(() => undefined);
  }, []);
  return null;
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

type State = "idle" | "working" | "enabled" | "denied" | "unsupported" | "failed";

/** Asks for permission and subscribes this device to owner alerts. */
export function EnablePush({ vapidKey, csrf }: { vapidKey: string; csrf: string }) {
  const [state, setState] = useState<State>("idle");
  const { t } = useI18n();

  async function enable() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setState("unsupported");
      return;
    }
    setState("working");
    try {
      if ((await Notification.requestPermission()) !== "granted") {
        setState("denied");
        return;
      }
      const registration = await navigator.serviceWorker.register(SW_URL, { scope: SCOPE });
      await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidKey) }));
      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({ csrf, subscription: subscription.toJSON() }),
      });
      setState(response.ok ? "enabled" : "failed");
    } catch {
      setState("failed");
    }
  }

  const message =
    state === "enabled"
      ? t("today.enabled")
      : state === "denied"
        ? t("today.denied")
        : state === "unsupported"
          ? t("today.unsupported")
          : state === "failed"
            ? t("admin.error.invalid")
            : null;

  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={enable} disabled={state === "working"} className="btn btn-primary w-fit">
        <Icon name="bell" />
        {t("today.enable")}
      </button>
      <p role="status" className="text-sm">
        {message}
      </p>
    </div>
  );
}
