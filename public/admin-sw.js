// Service worker for the admin app (scope /admin/). It shows owner alerts and
// confirms each one arrived, so the daily check can tell when alerts stop.
const TITLES = {
  booking_created: "תור חדש",
  booking_moved: "תור הועבר",
  booking_cancelled: "תור בוטל",
  message_failed: "הודעה ללקוח לא נשלחה",
  reply_received: "הודעה חדשה מלקוח",
  ai_cap_reached: "הגעתם לתקרת ה-AI",
  alerts_stopped: "ההתראות הפסיקו להגיע",
  message_cap: "מכסת ההודעות מתמלאת",
  owner_check: "בדיקה יומית: ההתראות פועלות",
  test: "התראת בדיקה: הכול עובד",
};

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = TITLES[data.type] || "התראה";
  const time = data.time ? new Date(data.time).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" }) : "";
  event.waitUntil(
    Promise.all([
      // Browsers require a visible notification for every push; the daily
      // check shows a quiet one.
      self.registration.showNotification(title, {
        body: time,
        lang: "he",
        dir: "rtl",
        icon: "/app-icon/192",
        badge: "/app-icon/96",
        tag: data.type === "owner_check" ? "owner-check" : data.path || "alert",
        silent: data.type === "owner_check",
        data: { path: data.path || "/admin/" },
      }),
      self.registration.pushManager.getSubscription().then((subscription) =>
        subscription
          ? fetch("/api/push/receipt", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ endpoint: subscription.endpoint }),
            }).catch(() => undefined)
          : undefined,
      ),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.path) || "/admin/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url.includes("/admin") && "focus" in client) {
          client.navigate(path);
          return client.focus();
        }
      }
      return self.clients.openWindow(path);
    }),
  );
});
