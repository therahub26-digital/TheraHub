import type { Metadata, Viewport } from "next";
import PwaRegister from "@/components/PwaRegister";

// ---------------------------------------------------------------------
// Customer portal shell — added 2026-08-22 per user request: "halaman
// konsumen sebaiknya progressive web saja, tidak perlu android [native]".
// This is the only layout.tsx under app/customer (pages here previously
// had no shared layout at all, each just rendered its own <MobileShell>).
// It intentionally adds NOTHING visual — MobileShell inside each page
// still owns the actual UI — this file only attaches PWA installability
// to this one route segment (manifest + apple meta tags via Next's
// per-segment metadata merging, plus registering public/sw.js). Staff
// portals (manager/kasir/therapist/admin) are untouched: they don't have
// this layout, so they never load the manifest or service worker.
// ---------------------------------------------------------------------

export const metadata: Metadata = {
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TheraHub",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0d9488",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PwaRegister />
      {children}
    </>
  );
}
