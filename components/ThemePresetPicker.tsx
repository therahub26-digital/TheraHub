"use client";

import Icon from "./Icon";
import { useTheme } from "@/lib/theme";
import { useBrandOverride } from "@/lib/brandOverride";
import { brandByKey } from "@/lib/brand";

/**
 * Curated appearance + brand-colour bundles an Admin can apply in one
 * click. Unlike the rest of this page (static mock forms), this control
 * is genuinely live: it drives the same ThemeProvider / BrandOverride
 * mechanism the sun/moon toggle uses, so picking a preset re-paints the
 * whole app immediately, for this browser, and persists across reload —
 * a real way to preview "what would our app look like as X" before
 * committing to it as the tenant default.
 */
const PRESETS = [
  {
    key: "signature",
    label: "Zen Signature",
    desc: "Tema default TheraHub — gelap, premium, netral untuk kerja operasional harian.",
    icon: "moon" as const,
    theme: "dark" as const,
    brandKey: "teal",
    bgKey: "aurora",
    bgImage: undefined as string | undefined,
  },
  {
    key: "lotus",
    label: "Lotus",
    desc: "Terang & lembut dengan aksen ungu, latar foto kelopak lotus — nuansa spa yang ramah dan playful.",
    icon: "flower" as const,
    theme: "light" as const,
    brandKey: "violet",
    bgKey: "lotus-bloom",
    bgImage: "/img/theme/lotus-bloom.jpg",
  },
];

function PresetSwatch({
  brandKey,
  appTheme,
  bgImage,
}: {
  brandKey: string;
  appTheme: "dark" | "light";
  /** When set, shows this photo behind the swatch instead of a plain colour wash — mirrors the actual photo-backed preset. */
  bgImage?: string;
}) {
  const b = brandByKey(brandKey);
  const isLight = appTheme === "light";
  return (
    <div
      aria-hidden
      style={{
        width: "100%",
        height: 46,
        borderRadius: "var(--r-sm)",
        overflow: "hidden",
        position: "relative",
        background: isLight ? "#f3f5f8" : "#0a0e16",
        border: "1px solid var(--border)",
      }}
    >
      {bgImage ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `linear-gradient(180deg, rgba(20,8,28,0.32), rgba(20,8,28,0.62)), url('${bgImage}')`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      ) : (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(85% 120% at 15% 0%, ${b.accent}33, transparent 65%)`,
          }}
        />
      )}
      <div
        style={{
          position: "absolute",
          left: 8,
          top: 8,
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: `linear-gradient(135deg, ${b.accent}, ${b.accent2})`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 34,
          top: 10,
          width: 30,
          height: 6,
          borderRadius: 3,
          background: isLight ? "rgba(10,14,22,0.18)" : "rgba(255,255,255,0.18)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 8,
          bottom: 8,
          height: 12,
          padding: "0 8px",
          borderRadius: "var(--r-full)",
          display: "flex",
          alignItems: "center",
          fontSize: 8,
          fontWeight: 700,
          color: "#fff",
          background: `linear-gradient(135deg, ${b.accent}, ${b.accent2})`,
        }}
      >
        Booking
      </div>
    </div>
  );
}

export default function ThemePresetPicker() {
  const { theme, setTheme } = useTheme();
  const { override, setOverride, clearOverride } = useBrandOverride();
  const activeBrandKey = override.brandKey ?? "teal";

  return (
    <div className="field">
      <label>Tema Siap Pakai</label>
      <div className="grid grid-2" style={{ gap: 8, marginTop: 2 }}>
        {PRESETS.map((p) => {
          const isActive = theme === p.theme && activeBrandKey === p.brandKey;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => {
                setTheme(p.theme);
                if (p.key === "signature") clearOverride();
                else setOverride(p.brandKey, p.bgKey);
              }}
              className="stack g2"
              style={{
                textAlign: "left",
                padding: 10,
                borderRadius: "var(--r-md)",
                border: `1.5px solid ${isActive ? "var(--accent)" : "var(--border-2)"}`,
                background: isActive ? "var(--accent-soft)" : "var(--bg-deep)",
                cursor: "pointer",
              }}
            >
              <PresetSwatch brandKey={p.brandKey} appTheme={p.theme} bgImage={p.bgImage} />
              <div className="row g2" style={{ marginTop: 2 }}>
                <span className="stat-icon" style={{ width: 24, height: 24, borderRadius: 7 }}>
                  <Icon name={p.icon} size={12} />
                </span>
                <span className="small bold" style={{ color: isActive ? "var(--accent)" : "var(--text-1)" }}>
                  {p.label}
                </span>
                {isActive && <Icon name="check" size={13} style={{ color: "var(--accent)", marginLeft: "auto" }} />}
              </div>
              <span className="tiny dim" style={{ lineHeight: 1.5 }}>{p.desc}</span>
            </button>
          );
        })}
      </div>
      <span className="hint">
        Klik untuk pratinjau langsung di browser Anda — seluruh aplikasi (semua portal) ikut berubah seketika. Ini
        pratinjau pribadi Anda, belum jadi default semua pengguna; untuk menjadikannya default tenant, samakan
        pilihan Warna Brand &amp; Background di bawah lalu klik &quot;Simpan Perubahan&quot;.
      </span>
    </div>
  );
}
