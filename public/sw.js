// ---------------------------------------------------------------------
// Minimal service worker for the customer portal PWA (added 2026-08-22,
// user request: "halaman konsumen sebaiknya progressive web saja, tidak
// perlu android [native]"). Scope is intentionally small:
//   - Cache the app shell (manifest + icons + the /customer entry route)
//     so the install prompt has something real to work with and the app
//     icon/splash still resolve if the network hiccups right after open.
//   - Network-first for everything else, falling back to cache only when
//     the network genuinely fails (offline) -- this app is data-driven
//     (bookings, sessions, promos all come from Supabase), so serving a
//     stale cached page instead of a live one would be actively
//     misleading, not a convenience. No attempt at full offline support.
// Registered only from app/customer/layout.tsx (components/PwaRegister.tsx)
// -- staff portals (manager/kasir/therapist/admin) don't load this file.
// ---------------------------------------------------------------------

const CACHE_NAME = "therahub-customer-shell-v1";
const SHELL_URLS = ["/customer", "/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Only cache same-origin, successful, basic responses -- never
        // touch cross-origin calls (Supabase API, fonts, etc.).
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/customer")))
  );
});
