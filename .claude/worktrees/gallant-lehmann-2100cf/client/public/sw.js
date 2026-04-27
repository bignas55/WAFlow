/**
 * WAFlow Service Worker
 *
 * Strategy:
 *  - App shell (JS/CSS/fonts): Cache-First — load instantly from cache, update in background
 *  - API calls (/api/*):       Network-Only — always fresh data
 *  - Navigation (HTML pages):  Network-First with offline fallback
 */

const CACHE_NAME = "waflow-v1";
const OFFLINE_URL = "/offline.html";

// Files to pre-cache on install (app shell)
const PRECACHE_URLS = [
  "/",
  "/offline.html",
  "/manifest.json",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
];

// ── Install: pre-cache the app shell ─────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clean up old caches ─────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: routing strategy ───────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin requests
  if (request.method !== "GET" || url.origin !== location.origin) return;

  // API calls — always go to network (never cache)
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/socket.io")) return;

  // Static assets (JS/CSS/images/fonts) — cache first, update in background
  if (
    url.pathname.match(/\.(js|css|woff2?|ttf|png|jpg|jpeg|svg|ico|webp)$/) ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/assets/")
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        const networkFetch = fetch(request).then((res) => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        }).catch(() => null);
        return cached || networkFetch || new Response("Not found", { status: 404 });
      })
    );
    return;
  }

  // Navigation requests — network first, offline fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match(OFFLINE_URL).then((r) => r || caches.match("/")))
    );
    return;
  }

  // Everything else — network first
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

// ── Push notifications (future use) ──────────────────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || "WAFlow", {
      body:    data.body  || "",
      icon:    data.icon  || "/icons/icon-192x192.png",
      badge:   "/icons/icon-96x96.png",
      tag:     data.tag   || "waflow-notification",
      data:    data.url   ? { url: data.url } : undefined,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      const existing = clientList.find((c) => c.url === url && "focus" in c);
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});
