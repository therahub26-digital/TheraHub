"use client";

import { useEffect } from "react";

// ---------------------------------------------------------------------
// Registers public/sw.js so /customer is installable as a PWA (added
// 2026-08-22, user request). Client-only, no UI -- rendered once from
// app/customer/layout.tsx. Fails silently on browsers without service
// worker support (older Safari, some in-app webviews) since this is a
// progressive enhancement, not a requirement to use the portal.
// ---------------------------------------------------------------------

export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Non-fatal -- the portal works fine without an active service
      // worker, it just won't be installable/offline-resilient.
    });
  }, []);

  return null;
}
