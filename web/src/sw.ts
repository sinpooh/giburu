/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { clientsClaim } from "workbox-core";

declare const self: ServiceWorkerGlobalScope;

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
// 画面の切り替えはアプリ本体で。ただしサーバ処理（/api/…、/__/…）はそのまま通す
registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html"), { denylist: [/^\/api\//, /^\/__\//] }));

// プッシュ通知（functions/src/push.ts から data だけで届く）
self.addEventListener("push", (event) => {
  let payload: { data?: Record<string, string> } & Record<string, unknown> = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = {};
  }
  const d = (payload.data ?? payload) as Record<string, string>;
  // アイコンの赤い数字（ミッション＋依頼の件数）
  const nav = self.navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  if (d.badge !== undefined) {
    const n = Number(d.badge);
    (n > 0 ? nav.setAppBadge?.(n) : nav.clearAppBadge?.())?.catch(() => undefined);
  }
  event.waitUntil(
    self.registration.showNotification(d.title || "ギブる", {
      body: d.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { link: d.link || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link: string = event.notification.data?.link || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        if ("focus" in c) {
          await (c as WindowClient).navigate(link).catch(() => undefined);
          return (c as WindowClient).focus();
        }
      }
      return self.clients.openWindow(link);
    })(),
  );
});
