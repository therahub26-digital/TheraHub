import type { Metadata, Viewport } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";
import "./ui.css";
import { ThemeProvider, THEME_INIT_SCRIPT } from "@/lib/theme";
import { BrandOverrideProvider } from "@/lib/brandOverride";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TheraHub — Spa Business Management System",
  description:
    "Satu sistem untuk operasional spa: absensi GPS, booking, treatment timer, kasir, stok, sampai payroll.",
};

export const viewport: Viewport = {
  themeColor: "#070b12",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // suppressHydrationWarning on <html> is required: THEME_INIT_SCRIPT writes
  // `data-theme` onto <html> before React hydrates, so the client DOM
  // legitimately carries an attribute the server HTML never sent. The flag only
  // silences attribute/text diffs on that one element (it does not cascade to
  // children) — the intended escape hatch for a pre-paint theme script.
  return (
    <html lang="id" className={`${inter.variable} ${outfit.variable}`} suppressHydrationWarning>
      <head>
        {/* Set data-theme before first paint so there is no flash of the wrong scheme. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>
          <BrandOverrideProvider>{children}</BrandOverrideProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
