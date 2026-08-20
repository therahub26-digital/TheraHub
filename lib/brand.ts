// ============================================================
// Per-tenant brand identity — color & logo are configurable at
// setup time (Admin > Business Profile / Super Admin provisioning).
// The platform shell stays dark-premium; only the accent identity
// swaps per tenant via CSS custom properties.
// ============================================================

export interface BrandPreset {
  key: string;
  label: string;
  swatch: string; // solid preview color
  accent: string;
  accent2: string;
  glow: string;
  soft: string;
  soft2: string;
  /** Very low-alpha tints used by the ambient background layer. */
  wash: string;
  wash2: string;
}

export const BRAND_PRESETS: BrandPreset[] = [
  {
    key: "teal",
    label: "Zen Teal",
    swatch: "#10b981",
    accent: "#10b981",
    accent2: "#0d9488",
    glow: "rgba(16, 185, 129, 0.35)",
    soft: "rgba(16, 185, 129, 0.14)",
    soft2: "rgba(16, 185, 129, 0.24)",
    wash: "rgba(16, 185, 129, 0.10)",
    wash2: "rgba(16, 185, 129, 0.07)",
  },
  {
    key: "violet",
    label: "Orchid Violet",
    swatch: "#a78bfa",
    accent: "#a78bfa",
    accent2: "#7c3aed",
    glow: "rgba(167, 139, 250, 0.35)",
    soft: "rgba(167, 139, 250, 0.14)",
    soft2: "rgba(167, 139, 250, 0.24)",
    wash: "rgba(167, 139, 250, 0.10)",
    wash2: "rgba(167, 139, 250, 0.07)",
  },
  {
    key: "rose",
    label: "Lotus Rose",
    swatch: "#fb7185",
    accent: "#fb7185",
    accent2: "#e11d48",
    glow: "rgba(251, 113, 133, 0.35)",
    soft: "rgba(251, 113, 133, 0.14)",
    soft2: "rgba(251, 113, 133, 0.24)",
    wash: "rgba(251, 113, 133, 0.10)",
    wash2: "rgba(251, 113, 133, 0.07)",
  },
  {
    key: "gold",
    label: "Amber Gold",
    swatch: "#f0b429",
    accent: "#f0b429",
    accent2: "#c8860a",
    glow: "rgba(240, 180, 41, 0.35)",
    soft: "rgba(240, 180, 41, 0.14)",
    soft2: "rgba(240, 180, 41, 0.24)",
    wash: "rgba(240, 180, 41, 0.10)",
    wash2: "rgba(240, 180, 41, 0.07)",
  },
  {
    key: "sky",
    label: "Ocean Sky",
    swatch: "#38bdf8",
    accent: "#38bdf8",
    accent2: "#0284c7",
    glow: "rgba(56, 189, 248, 0.35)",
    soft: "rgba(56, 189, 248, 0.14)",
    soft2: "rgba(56, 189, 248, 0.24)",
    wash: "rgba(56, 189, 248, 0.10)",
    wash2: "rgba(56, 189, 248, 0.07)",
  },
  {
    key: "cyan",
    label: "Jade Cyan",
    swatch: "#22d3ee",
    accent: "#22d3ee",
    accent2: "#0e7490",
    glow: "rgba(34, 211, 238, 0.35)",
    soft: "rgba(34, 211, 238, 0.14)",
    soft2: "rgba(34, 211, 238, 0.24)",
    wash: "rgba(34, 211, 238, 0.10)",
    wash2: "rgba(34, 211, 238, 0.07)",
  },
];

export const brandByKey = (key: string) => BRAND_PRESETS.find((b) => b.key === key) ?? BRAND_PRESETS[0];

/** CSS custom properties to inject for a given brand preset. */
export function brandVars(key: string): React.CSSProperties {
  const b = brandByKey(key);
  return {
    "--accent": b.accent,
    "--accent-2": b.accent2,
    "--accent-3": b.accent,
    "--accent-glow": b.glow,
    "--accent-soft": b.soft,
    "--accent-soft-2": b.soft2,
    "--accent-wash": b.wash,
    "--accent-wash-2": b.wash2,
    "--accent-gradient": `linear-gradient(135deg, ${b.accent} 0%, ${b.accent2} 100%)`,
    "--accent-gradient-soft": `linear-gradient(135deg, ${b.soft2} 0%, ${b.soft} 100%)`,
    "--sh-accent": `0 8px 26px ${b.glow}`,
  } as React.CSSProperties;
}

// ============================================================
// Background — the ambient page backdrop is also configurable
// per tenant, alongside brand colour and logo. Every preset is
// pure CSS (no image assets) and tints itself with the tenant's
// accent colour via --accent-wash, so brand + background always
// stay in harmony whichever combination is chosen.
// ============================================================

export interface BackgroundPreset {
  key: string;
  label: string;
  desc: string;
  /** Base page colour sitting underneath the ambient layer. */
  base: string;
  /** CSS `background` value for the ambient layer. May use brand vars. */
  layer: string;
  /** Scaled-down, higher-contrast variant used for the setup thumbnails. */
  preview: string;
  /**
   * Optional tenant-uploaded/curated photo, rendered as a full-bleed layer
   * *underneath* `layer` (which then doubles as a legibility scrim for photo
   * presets — see `lotus-bloom` below for the pattern). Path only; wrapped in
   * `url(...)` by `backgroundVars()`. Omit for pure-gradient presets.
   */
  image?: string;
}

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  {
    key: "aurora",
    label: "Aurora",
    desc: "Cahaya lembut di sudut layar — default TheraHub.",
    base: "#070b12",
    layer: [
      "radial-gradient(900px 520px at 12% -8%, var(--accent-wash), transparent 60%)",
      "radial-gradient(760px 480px at 92% 4%, var(--accent-wash-2), transparent 62%)",
      "radial-gradient(1000px 600px at 60% 110%, rgba(240, 180, 41, 0.045), transparent 60%)",
    ].join(", "),
    preview: [
      "radial-gradient(70% 90% at 12% 0%, var(--accent-soft-2), transparent 65%)",
      "radial-gradient(60% 80% at 95% 8%, var(--accent-soft), transparent 65%)",
      "radial-gradient(70% 70% at 60% 110%, rgba(240, 180, 41, 0.10), transparent 62%)",
    ].join(", "),
  },
  {
    key: "mesh",
    label: "Mesh Gradient",
    desc: "Beberapa gradasi besar yang saling menimpa — terasa modern.",
    base: "#080c14",
    layer: [
      "radial-gradient(700px 700px at 8% 12%, var(--accent-wash), transparent 55%)",
      "radial-gradient(620px 620px at 88% 22%, rgba(167, 139, 250, 0.075), transparent 58%)",
      "radial-gradient(680px 560px at 72% 92%, var(--accent-wash-2), transparent 58%)",
      "radial-gradient(560px 520px at 26% 88%, rgba(56, 189, 248, 0.055), transparent 58%)",
    ].join(", "),
    preview: [
      "radial-gradient(55% 65% at 8% 12%, var(--accent-soft-2), transparent 60%)",
      "radial-gradient(50% 60% at 90% 20%, rgba(167, 139, 250, 0.22), transparent 62%)",
      "radial-gradient(55% 60% at 74% 94%, var(--accent-soft), transparent 60%)",
      "radial-gradient(50% 55% at 22% 90%, rgba(56, 189, 248, 0.18), transparent 62%)",
    ].join(", "),
  },
  {
    key: "serene",
    label: "Serene Spa",
    desc: "Gradasi tenang dari atas ke bawah, nuansa ruang relaksasi.",
    base: "#060a10",
    layer: [
      "radial-gradient(1400px 620px at 50% -14%, var(--accent-wash), transparent 64%)",
      "radial-gradient(1100px 520px at 50% 112%, rgba(240, 180, 41, 0.05), transparent 62%)",
      "linear-gradient(180deg, rgba(255, 255, 255, 0.018) 0%, transparent 26%, transparent 74%, rgba(0, 0, 0, 0.28) 100%)",
    ].join(", "),
    preview: [
      "radial-gradient(130% 75% at 50% -12%, var(--accent-soft-2), transparent 68%)",
      "radial-gradient(110% 60% at 50% 112%, rgba(240, 180, 41, 0.12), transparent 66%)",
      "linear-gradient(180deg, rgba(255, 255, 255, 0.05) 0%, transparent 40%, rgba(0, 0, 0, 0.35) 100%)",
    ].join(", "),
  },
  {
    key: "minimal",
    label: "Minimal",
    desc: "Nyaris polos — fokus penuh ke konten dan data.",
    base: "#070b12",
    layer: "radial-gradient(1200px 420px at 50% -18%, var(--accent-wash-2), transparent 68%)",
    preview: [
      "radial-gradient(110% 65% at 50% -22%, var(--accent-soft), transparent 70%)",
    ].join(", "),
  },
  {
    key: "grid",
    label: "Studio Grid",
    desc: "Garis grid halus — cocok untuk tampilan operasional padat data.",
    base: "#070b12",
    layer: [
      "radial-gradient(900px 500px at 16% -6%, var(--accent-wash), transparent 60%)",
      "repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.022) 0 1px, transparent 1px 64px)",
      "repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.022) 0 1px, transparent 1px 64px)",
    ].join(", "),
    preview: [
      "repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.10) 0 1px, transparent 1px 11px)",
      "repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.10) 0 1px, transparent 1px 11px)",
      "radial-gradient(85% 95% at 15% 0%, var(--accent-soft), transparent 62%)",
    ].join(", "),
  },
  {
    key: "midnight",
    label: "Midnight",
    desc: "Paling gelap dan pekat — nyaman untuk shift malam.",
    base: "#04060a",
    layer: [
      "radial-gradient(1000px 620px at 100% 0%, var(--accent-wash-2), transparent 58%)",
      "radial-gradient(800px 520px at 0% 100%, rgba(56, 189, 248, 0.04), transparent 60%)",
    ].join(", "),
    preview: [
      "radial-gradient(95% 95% at 100% 0%, var(--accent-soft), transparent 60%)",
      "radial-gradient(85% 85% at 0% 100%, rgba(56, 189, 248, 0.12), transparent 60%)",
    ].join(", "),
  },
  {
    key: "lotus-bloom",
    label: "Lotus Bloom",
    desc: "Foto lembut kelopak & bunga lotus — dipakai tema Lotus. Lapisan gelap tipis di atas foto menjaga teks tetap terbaca di kedua mode.",
    base: "#140b1c",
    // This `layer` is a legibility scrim, not an ambient wash like the other
    // presets — it sits (via backgroundVars' `--app-bg-layer`) *on top of*
    // the photo (`--app-bg-photo`) so text and cards stay readable over a
    // busy image. Deliberately not theme-conditional, same reasoning as the
    // outlet cover hero: one set of colours legible in both modes.
    layer: [
      "linear-gradient(180deg, rgba(20, 8, 28, 0.38) 0%, rgba(20, 8, 28, 0.62) 50%, rgba(20, 8, 28, 0.82) 100%)",
      "radial-gradient(1200px 700px at 50% 0%, rgba(20, 8, 28, 0.18), transparent 60%)",
    ].join(", "),
    preview: `linear-gradient(180deg, rgba(167, 139, 250, 0.30), rgba(88, 28, 135, 0.55)), url('/img/theme/lotus-bloom.jpg')`,
    image: "/img/theme/lotus-bloom.jpg",
  },
];

export const backgroundByKey = (key: string) =>
  BACKGROUND_PRESETS.find((b) => b.key === key) ?? BACKGROUND_PRESETS[0];

/** CSS custom properties for the ambient background layer. */
export function backgroundVars(key: string): React.CSSProperties {
  const b = backgroundByKey(key);
  return {
    "--app-bg-base": b.base,
    "--app-bg-layer": b.layer,
    "--app-bg-photo": b.image ? `url('${b.image}')` : "none",
  } as React.CSSProperties;
}

/** Brand accent + background variables merged — what the shells apply. */
export function themeVars(brandKey: string, bgKey: string): React.CSSProperties {
  return { ...brandVars(brandKey), ...backgroundVars(bgKey) };
}
