/* Locked-In service worker — network-first HTML, cache-first static assets. */
const CACHE = "locked-in-v134";
const ASSET_V = "207";
const PRECACHE = [
  "./",
  "./index.html",
  `./style.css?v=${ASSET_V}`,
  `./css/screens.css?v=${ASSET_V}`,
  `./app.js?v=${ASSET_V}`,
  `./js/constants.js?v=${ASSET_V}`,
  `./js/runtime.js?v=${ASSET_V}`,
  `./js/storage.js?v=${ASSET_V}`,
  `./js/toast.js?v=${ASSET_V}`,
  `./js/utils.js?v=${ASSET_V}`,
  `./js/sync.js?v=${ASSET_V}`,
  `./js/theme-nav.js?v=${ASSET_V}`,
  `./js/setup.js?v=${ASSET_V}`,
  `./js/session.js?v=${ASSET_V}`,
  `./js/history.js?v=${ASSET_V}`,
  `./js/insights.js?v=${ASSET_V}`,
  `./js/notes.js?v=${ASSET_V}`,
  `./js/todos.js?v=${ASSET_V}`,
  `./js/week-reports.js?v=${ASSET_V}`,
  `./js/customize.js?v=${ASSET_V}`,
  `./js/settings.js?v=${ASSET_V}`,
  `./js/bind.js?v=${ASSET_V}`,
  "./assets/favicon.svg",
  "./assets/favicon-32.png",
  "./assets/favicon-64.png",
  "./assets/logo-mark.png",
  "./assets/logo-master.png",
  "./assets/apple-touch-icon.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/icon-512-maskable.png",
  "./manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isHtml(request, url) {
  if (request.mode === "navigate") return true;
  const accept = request.headers.get("accept") || "";
  if (accept.includes("text/html")) return true;
  const path = url.pathname;
  return path.endsWith("/") || path.endsWith(".html");
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isHtml(request, url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      });
    })
  );
});
