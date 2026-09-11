/* JMS PWA service worker — minimal, keeps the app fresh (network-first for
   pages), only caches same-origin static assets. API calls (cross-origin) and
   non-GET requests are passed straight through. */
const CACHE = "jms-shell-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.add("/")).catch(() => {}));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API / other origins: pass through

  if (req.mode === "navigate") {
    // Network-first so a new deploy is picked up immediately; offline → cached shell.
    event.respondWith(
      (async () => {
        try {
          return await fetch(req);
        } catch {
          return (await caches.match("/")) || (await caches.match(req)) || Response.error();
        }
      })()
    );
    return;
  }

  // Same-origin static assets (Next fingerprints chunk URLs, so cache-first is safe).
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      } catch {
        return cached || Response.error();
      }
    })()
  );
});
