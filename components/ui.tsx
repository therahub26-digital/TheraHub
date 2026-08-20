import type { ReactNode, CSSProperties } from "react";
import Icon from "./Icon";
import { initials, tone } from "@/lib/format";
import { BRAND_PRESETS, BACKGROUND_PRESETS } from "@/lib/brand";
import { MEDIA_SPECS, specLine } from "@/lib/media";

/* ------------------------------------------------------------------ Card */
export function Card({
  children,
  className = "",
  style,
  hover,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  hover?: boolean;
}) {
  return (
    <div className={`card ${hover ? "card-hover" : ""} ${className}`} style={style}>
      {children}
    </div>
  );
}

export function CardHead({
  title,
  sub,
  icon,
  action,
}: {
  title: string;
  sub?: string;
  icon?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card-head">
      <div className="row g3" style={{ minWidth: 0 }}>
        {icon && (
          <span className="stat-icon" style={{ width: 30, height: 30, borderRadius: 9 }}>
            <Icon name={icon} size={15} />
          </span>
        )}
        <div style={{ minWidth: 0 }}>
          <h3 className="truncate">{title}</h3>
          {sub && <div className="sub truncate">{sub}</div>}
        </div>
      </div>
      {action}
    </div>
  );
}

/* -------------------------------------------------------------- StatCard */
const STAT_TONES: Record<string, { glow: string; bg: string; fg: string }> = {
  teal: { glow: "rgba(16,185,129,0.13)", bg: "rgba(16,185,129,0.13)", fg: "#10b981" },
  gold: { glow: "rgba(240,180,41,0.13)", bg: "rgba(240,180,41,0.13)", fg: "#f0b429" },
  sky: { glow: "rgba(56,189,248,0.13)", bg: "rgba(56,189,248,0.13)", fg: "#38bdf8" },
  violet: { glow: "rgba(167,139,250,0.13)", bg: "rgba(167,139,250,0.13)", fg: "#a78bfa" },
  rose: { glow: "rgba(244,114,182,0.13)", bg: "rgba(244,114,182,0.13)", fg: "#f472b6" },
  amber: { glow: "rgba(245,158,11,0.13)", bg: "rgba(245,158,11,0.13)", fg: "#f59e0b" },
  danger: { glow: "rgba(239,68,68,0.13)", bg: "rgba(239,68,68,0.13)", fg: "#ef4444" },
};

export function StatCard({
  label,
  value,
  unit,
  icon,
  toneKey = "teal",
  delta,
  deltaLabel,
  foot,
  className = "",
}: {
  label: string;
  value: string | number;
  unit?: string;
  icon: string;
  toneKey?: keyof typeof STAT_TONES | string;
  delta?: number;
  deltaLabel?: string;
  foot?: ReactNode;
  className?: string;
}) {
  const t = STAT_TONES[toneKey] ?? STAT_TONES.teal;
  return (
    <div
      className={`stat ${className}`}
      style={
        {
          "--stat-glow": t.glow,
          "--stat-icon-bg": t.bg,
          "--stat-icon-fg": t.fg,
        } as CSSProperties
      }
    >
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        <span className="stat-icon">
          <Icon name={icon} size={16} />
        </span>
      </div>
      <div className="stat-value">
        {value}
        {unit && <small>{unit}</small>}
      </div>
      <div className="stat-foot">
        {delta !== undefined && (
          <span className={`delta ${delta > 0 ? "up" : delta < 0 ? "down" : "flat"}`}>
            <Icon name={delta > 0 ? "trending-up" : delta < 0 ? "trending-down" : "minus"} size={11} />
            {delta > 0 ? "+" : ""}
            {delta}%
          </span>
        )}
        {(deltaLabel || foot) && <span className="dim tiny">{deltaLabel ?? foot}</span>}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- Badge */
export type BadgeTone =
  | "neutral" | "success" | "warning" | "danger" | "info" | "accent" | "gold" | "purple";

export function Badge({
  children,
  tone: t = "neutral",
  dot,
  icon,
  lg,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
  icon?: string;
  lg?: boolean;
}) {
  return (
    <span className={`badge badge-${t} ${lg ? "badge-lg" : ""}`}>
      {dot && <i className="dot" />}
      {icon && <Icon name={icon} size={11} />}
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, BadgeTone> = {
  // booking
  DRAFT: "neutral", BOOKED: "info", CONFIRMED: "info", ARRIVED: "purple",
  CHECKED_IN: "purple", IN_SESSION: "accent", COMPLETED: "success", PAID: "success",
  CANCELLED: "neutral", NO_SHOW: "danger", RESCHEDULED: "warning",
  // session
  NOT_STARTED: "neutral", ACTIVE: "accent", ENDING_SOON: "warning", VOID: "danger",
  // payment
  UNPAID: "warning", PARTIALLY_PAID: "warning", PARTIALLY_REFUNDED: "warning", REFUNDED: "danger",
  // generic workflow
  PENDING: "warning", APPROVED: "success", INCLUDED_IN_PAYROLL: "info", REJECTED: "danger",
  ADJUSTED: "warning", REVERSED: "danger", SUBMITTED: "info", CALCULATED: "info",
  REVIEWED: "info", PUBLISHED: "accent", POSTED: "success",
  // attendance
  SCHEDULED: "neutral", CHECKED_OUT: "success", LATE: "warning", ABSENT: "danger",
  SUSPICIOUS: "danger", VERIFIED: "success", VALID: "success", OUTSIDE: "danger",
  LOW_ACCURACY: "warning",
  // tenant / entity
  TRIAL: "info", GRACE: "warning", SUSPENDED: "danger", CHURNED: "neutral",
  SETUP: "warning", INACTIVE: "neutral", MAINTENANCE: "warning",
  ORDERED: "info", PARTIAL: "warning", RECEIVED: "success", IN_TRANSIT: "info",
  OPEN: "accent", CLOSED: "neutral", ELIGIBLE_FULL: "success", PRORATA: "info",
  EXPIRED: "neutral", ACTIVE_PROMO: "success",
};

export function StatusBadge({ status, lg }: { status: string; lg?: boolean }) {
  const t = STATUS_TONE[status] ?? "neutral";
  return (
    <Badge tone={t} dot lg={lg}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

/* ---------------------------------------------------------------- Avatar */
export function Avatar({
  name,
  toneKey = "teal",
  size = 34,
  rect,
  status,
  photoUrl,
}: {
  name: string;
  toneKey?: string;
  size?: number;
  rect?: boolean;
  status?: "online" | "busy" | "off";
  /** Real staff photo (e.g. therapist headshot) — when present, renders instead of the initials-on-color-tone fallback. */
  photoUrl?: string;
}) {
  return (
    <span
      className={`avatar ${rect ? "avatar-rect" : ""}`}
      style={{
        width: size,
        height: size,
        background: photoUrl ? undefined : tone(toneKey),
        fontSize: Math.round(size * 0.38),
        overflow: "hidden",
      }}
      title={name}
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatar photos come from a per-tenant Supabase-fed path, not a static/optimizable import set
        <img
          src={photoUrl}
          alt={name}
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 15%" }}
        />
      ) : (
        initials(name)
      )}
      {status && <i className={`avatar-status ${status}`} />}
    </span>
  );
}

export function PersonCell({
  name,
  sub,
  toneKey,
  size = 32,
  status,
  photoUrl,
}: {
  name: string;
  sub?: string;
  toneKey?: string;
  size?: number;
  status?: "online" | "busy" | "off";
  photoUrl?: string;
}) {
  return (
    <div className="row g3" style={{ minWidth: 0 }}>
      <Avatar name={name} toneKey={toneKey} size={size} status={status} photoUrl={photoUrl} />
      <div style={{ minWidth: 0 }}>
        <div className="strong truncate" style={{ color: "var(--text-1)", fontWeight: 600 }}>
          {name}
        </div>
        {sub && <div className="tiny dim truncate">{sub}</div>}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- Misc */
export function Progress({ value, tone: t }: { value: number; tone?: "gold" | "warn" }) {
  return (
    <div className={`progress ${t ?? ""}`}>
      <i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function EmptyState({
  icon = "search",
  title,
  desc,
  action,
}: {
  icon?: string;
  title: string;
  desc?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={22} />
      </span>
      <div className="bold" style={{ color: "var(--text-2)" }}>
        {title}
      </div>
      {desc && <div className="small" style={{ maxWidth: 380 }}>{desc}</div>}
      {action}
    </div>
  );
}

export function PageHead({
  title,
  desc,
  actions,
}: {
  title: string;
  desc?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {desc && <p>{desc}</p>}
      </div>
      {actions && <div className="row g2 wrap">{actions}</div>}
    </div>
  );
}

export function KV({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl>
      {items.map(([k, v], i) => (
        <div className="kv" key={i}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function Switch({ on }: { on: boolean }) {
  return <span className={`switch ${on ? "on" : ""}`} />;
}

export function Checkbox({ on }: { on: boolean }) {
  return (
    <span className={`checkbox ${on ? "on" : ""}`}>
      <Icon name="check" size={12} strokeWidth={3} />
    </span>
  );
}

export function SectionTitle({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="between" style={{ marginBottom: "var(--s-3)" }}>
      <h2 style={{ fontSize: 15.5 }}>{children}</h2>
      {action}
    </div>
  );
}

export function InfoNote({
  tone: t = "accent",
  icon = "info",
  title,
  children,
}: {
  tone?: "accent" | "warning" | "danger" | "info";
  icon?: string;
  title?: string;
  children: ReactNode;
}) {
  const colors: Record<string, [string, string]> = {
    accent: ["rgba(16,185,129,0.09)", "var(--accent)"],
    warning: ["rgba(245,158,11,0.09)", "var(--warning)"],
    danger: ["rgba(239,68,68,0.09)", "var(--danger)"],
    info: ["rgba(56,189,248,0.09)", "var(--info)"],
  };
  const [bg, fg] = colors[t];
  return (
    <div
      className="row g3"
      style={{
        alignItems: "flex-start",
        background: bg,
        border: `1px solid ${fg}33`,
        borderRadius: "var(--r-md)",
        padding: "12px 14px",
      }}
    >
      <span style={{ color: fg, flexShrink: 0, marginTop: 1 }}>
        <Icon name={icon} size={16} />
      </span>
      <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>
        {title && (
          <div className="bold" style={{ color: fg, marginBottom: 2 }}>
            {title}
          </div>
        )}
        <div className="muted">{children}</div>
      </div>
    </div>
  );
}

/**
 * Brand identity picker — used at tenant setup (Admin > Business Profile,
 * Super Admin provisioning). Lets a tenant choose accent colour, logo, and
 * the ambient background that the whole product is painted with.
 */
export function BrandPicker({
  selected = "teal",
  logoInitial = "Z",
  background = "aurora",
}: {
  selected?: string;
  logoInitial?: string;
  background?: string;
}) {
  return (
    <div className="stack g4">
      <div className="field">
        <label>Warna Brand</label>
        <div className="row g2 wrap" style={{ marginTop: 2 }}>
          {BRAND_PRESETS.map((b) => (
            <div
              key={b.key}
              title={b.label}
              className="row g2"
              style={{
                padding: "7px 11px 7px 7px",
                borderRadius: "var(--r-full)",
                border: `1.5px solid ${b.key === selected ? b.accent : "var(--border-2)"}`,
                background: b.key === selected ? `${b.accent}1c` : "var(--bg-deep)",
                cursor: "pointer",
              }}
            >
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: `linear-gradient(135deg, ${b.accent}, ${b.accent2})`,
                  border: "1px solid rgba(255,255,255,0.25)",
                  flexShrink: 0,
                }}
              />
              <span className="small" style={{ color: b.key === selected ? b.accent : "var(--text-3)", fontWeight: 600 }}>
                {b.label}
              </span>
              {b.key === selected && <Icon name="check" size={13} style={{ color: b.accent }} />}
            </div>
          ))}
        </div>
        <span className="hint">Warna ini dipakai di seluruh sidebar, tombol, dan grafik outlet Anda.</span>
      </div>

      <div className="field">
        <label>Logo Bisnis</label>
        <div className="row g3">
          <span
            className="avatar avatar-rect"
            style={{
              width: 56,
              height: 56,
              fontSize: 20,
              background: `linear-gradient(135deg, ${BRAND_PRESETS.find((b) => b.key === selected)?.accent}, ${BRAND_PRESETS.find((b) => b.key === selected)?.accent2})`,
            }}
          >
            {logoInitial}
          </span>
          <div className="stack g2">
            <button className="btn btn-ghost btn-sm">
              <Icon name="upload" size={13} /> Unggah Logo
            </button>
            <span className="tiny dim">PNG/SVG, disarankan rasio 1:1, maks 2 MB.</span>
          </div>
        </div>
      </div>

      <div className="field">
        <label>Background Aplikasi</label>
        <div className="grid grid-3" style={{ gap: 8, marginTop: 2 }}>
          {BACKGROUND_PRESETS.map((bg) => {
            const on = bg.key === background;
            return (
              <div
                key={bg.key}
                title={bg.desc}
                style={{
                  padding: 5,
                  borderRadius: "var(--r-md)",
                  border: `1.5px solid ${on ? "var(--accent)" : "var(--border-2)"}`,
                  background: on ? "var(--accent-soft)" : "var(--bg-deep)",
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    display: "block",
                    height: 44,
                    borderRadius: "var(--r-sm)",
                    border: "1px solid var(--border)",
                    backgroundColor: bg.base,
                    backgroundImage: bg.preview,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    backgroundRepeat: "no-repeat",
                  }}
                />
                <span
                  className="tiny truncate"
                  style={{
                    display: "block",
                    textAlign: "center",
                    marginTop: 5,
                    fontWeight: 600,
                    color: on ? "var(--accent)" : "var(--text-3)",
                  }}
                >
                  {bg.label}
                </span>
              </div>
            );
          })}
        </div>
        <span className="hint">
          Background otomatis menyesuaikan warna brand di atas, sehingga selalu serasi. Pilihan &quot;Lotus
          Bloom&quot; di atas memakai foto, bukan gradient — background aplikasi memang bisa berupa foto, bukan
          cuma warna.
        </span>
      </div>

      <div className="field">
        <label>Background Foto Kustom (Opsional)</label>
        <button
          className="stack g2"
          style={{
            width: "100%",
            aspectRatio: `${MEDIA_SPECS.appBackground.width} / ${MEDIA_SPECS.appBackground.height}`,
            maxHeight: 120,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "var(--r-md)",
            border: "1.5px dashed var(--border-3)",
            background: "transparent",
            color: "var(--text-3)",
          }}
        >
          <span className="stat-icon" style={{ width: 32, height: 32, borderRadius: 10 }}>
            <Icon name="camera" size={15} />
          </span>
          <span className="tiny bold" style={{ color: "var(--text-2)" }}>Unggah foto latar sendiri</span>
          <span className="tiny dim">{specLine("appBackground")}</span>
        </button>
        <span className="hint">
          Alternatif dari preset di atas — unggah foto sendiri (misalnya suasana outlet Anda) sebagai latar
          seluruh aplikasi. {MEDIA_SPECS.appBackground.note}
        </span>
      </div>
    </div>
  );
}

export function Meter({
  label,
  value,
  max,
  unit = "",
  toneKey,
}: {
  label: string;
  value: number;
  max: number;
  unit?: string;
  toneKey?: "gold" | "warn";
}) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="stack g2">
      <div className="between">
        <span className="small muted">{label}</span>
        <span className="small bold" style={{ color: "var(--text-1)" }}>
          {value}
          {unit} <span className="dim">/ {max}{unit}</span>
        </span>
      </div>
      <Progress value={pct} tone={toneKey ?? (pct > 88 ? "warn" : undefined)} />
    </div>
  );
}
