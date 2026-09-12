const CACHE = "orbit-resilient-sync-shell-v1";
const SYNC_TAG = "orbit-resilient-sync";

const safeRequest = (request) => {
  const url = new URL(request.url);
  return request.method === "GET"
    && url.origin === self.location.origin
    && !url.pathname.startsWith("/api/")
    && !url.pathname.startsWith("/auth/")
    && !url.search
    && ["document", "script", "style", "font", "image"].includes(request.destination);
};

self.addEventListener("install", (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  if (!safeRequest(event.request)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(event.request);
      if (response.ok && response.type === "basic") await cache.put(event.request, response.clone());
      return response;
    } catch {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      if (event.request.mode === "navigate") return new Response("ORBIT está sin conexión. Tus cambios pendientes permanecen guardados.", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
      throw new Error("OFFLINE_ASSET_UNAVAILABLE");
    }
  })());
});
self.addEventListener("sync", (event) => {
  if (event.tag !== SYNC_TAG) return;
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) client.postMessage({ type: "ORBIT_SYNC_REQUESTED" });
  })());
});
