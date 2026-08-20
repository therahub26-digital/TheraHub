"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "./Icon";
import { Avatar } from "./ui";
import ThemeToggle from "./ThemeToggle";
import { ROLES, roleByKey } from "@/lib/nav";
import { themeVars } from "@/lib/brand";
import { useBrandOverride } from "@/lib/brandOverride";
import { ACTIVE_TENANT } from "@/lib/mock";
import type { Role } from "@/lib/types";

/**
 * Mobile-first shell for the Terapis/Karyawan app and the Customer PWA.
 * Rendered inside a device frame on wide screens so the demo reads as
 * "this is the phone app"; becomes a plain full-bleed mobile layout on
 * actual phones.
 */
export default function MobileShell({
  role,
  title,
  subtitle,
  brandKey,
  bgKey,
  children,
  headerRight,
  showBack,
  avatarName,
  avatarTone,
}: {
  role: Role;
  title: string;
  subtitle?: string;
  brandKey?: string;
  bgKey?: string;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
  showBack?: boolean;
  /** Override the header avatar identity — defaults to the role's demo persona. */
  avatarName?: string;
  avatarTone?: string;
}) {
  const def = roleByKey(role);
  const pathname = usePathname();
  const [switcher, setSwitcher] = useState(false);
  const { override } = useBrandOverride();
  const vars = themeVars(
    override.brandKey ?? brandKey ?? ACTIVE_TENANT.logoTone,
    override.bgKey ?? bgKey ?? ACTIVE_TENANT.bgTone
  );

  const active = def.nav
    .filter((n) => pathname === n.href || pathname.startsWith(n.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];

  return (
    <div className="device-stage" style={vars}>
      <div className="app-bg" aria-hidden />
      {/* Context rail — desktop only, explains what you're looking at */}
      <aside className="device-context">
        <Link href="/" className="row g3" style={{ marginBottom: 26 }}>
          <span className="brand-mark" style={{ width: 34, height: 34, borderRadius: 10 }}>
            <Icon name="waves" size={17} strokeWidth={2.4} />
          </span>
          <span>
            <span className="brand-name" style={{ fontSize: 15 }}>TheraHub</span>
            <span className="brand-sub" style={{ display: "block" }}>Spa Management</span>
          </span>
        </Link>

        <span className="badge badge-accent badge-lg" style={{ marginBottom: 14 }}>
          <Icon name={role === "customer" ? "smartphone" : "hand-heart"} size={13} />
          {role === "customer" ? "Customer PWA" : "Mobile App"}
        </span>

        <h2 style={{ fontSize: 20, marginBottom: 8 }}>{def.name}</h2>
        <p className="small muted" style={{ lineHeight: 1.7, marginBottom: 20 }}>{def.tagline}</p>

        <div className="stack g3" style={{ marginBottom: 24 }}>
          <div className="row g2 small muted">
            <Icon name="check" size={14} style={{ color: "var(--accent)", flexShrink: 0 }} />
            <span>Scope: {def.scope}</span>
          </div>
          {role === "therapist" ? (
            <>
              <div className="row g2 small muted">
                <Icon name="check" size={14} style={{ color: "var(--accent)", flexShrink: 0 }} />
                <span>Absensi GPS dengan geofence &amp; deteksi mock location</span>
              </div>
              <div className="row g2 small muted">
                <Icon name="check" size={14} style={{ color: "var(--accent)", flexShrink: 0 }} />
                <span>Disarankan Android wrapper/native untuk anti-fraud</span>
              </div>
            </>
          ) : (
            <>
              <div className="row g2 small muted">
                <Icon name="check" size={14} style={{ color: "var(--accent)", flexShrink: 0 }} />
                <span>Booking lewat link/QR tanpa wajib install</span>
              </div>
              <div className="row g2 small muted">
                <Icon name="check" size={14} style={{ color: "var(--accent)", flexShrink: 0 }} />
                <span>Responsive PWA — bekerja di semua perangkat</span>
              </div>
            </>
          )}
        </div>

        <div className="stack g2" style={{ marginBottom: 20 }}>
          <div className="tiny uppercase dim">Layar Aplikasi</div>
          {def.nav.map((n) => (
            <Link key={n.href} href={n.href} className={`nav-item ${active?.href === n.href ? "active" : ""}`} style={{ padding: "7px 10px" }}>
              <Icon name={n.icon} size={15} />
              <span className="truncate">{n.label}</span>
              {n.badge ? <span className="nav-badge">{n.badge}</span> : null}
            </Link>
          ))}
        </div>

        <div className="grow" />

        <div className="row g2" style={{ marginBottom: 8 }}>
          <button className="btn btn-ghost btn-sm btn-block" onClick={() => setSwitcher((v) => !v)}>
            <Icon name="repeat" size={14} /> Ganti Role
          </button>
          <ThemeToggle className="btn-ghost" />
        </div>
        {switcher && (
          <div className="stack g2" style={{ marginBottom: 8 }}>
            {ROLES.map((r) => (
              <Link key={r.key} href={r.base} className={`chip ${r.key === role ? "on" : ""}`} style={{ justifyContent: "flex-start" }}>
                <Icon name={r.icon} size={13} /> {r.name}
              </Link>
            ))}
          </div>
        )}
        <Link href="/" className="btn btn-quiet btn-sm btn-block">
          <Icon name="arrow-left" size={14} /> Kembali ke Pemilih Peran
        </Link>
      </aside>

      {/* The phone */}
      <div className="device-wrap">
        <div className="device">
          <div className="device-notch" />
          <div className="device-status">
            <span className="tiny bold">09:41</span>
            <div className="row g2">
              <ThemeToggle size={12} className="btn-icon" style={{ width: 20, height: 20 }} />
              <Icon name="wifi" size={11} />
              <Icon name="gauge" size={11} />
            </div>
          </div>

          <header className="device-header">
            {showBack ? (
              <Link href={def.base} className="btn btn-quiet btn-icon btn-sm"><Icon name="arrow-left" size={17} /></Link>
            ) : (
              <Avatar name={avatarName ?? def.persona.name} toneKey={avatarTone ?? def.tone} size={30} />
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="small bold truncate" style={{ color: "var(--text-1)" }}>{title}</div>
              {subtitle && <div className="tiny dim truncate">{subtitle}</div>}
            </div>
            {headerRight}
          </header>

          <main className="device-body">{children}</main>

          <nav className="device-tabs">
            {def.nav.slice(0, 5).map((n) => (
              <Link key={n.href} href={n.href} className={`device-tab ${active?.href === n.href ? "active" : ""}`}>
                <span style={{ position: "relative" }}>
                  <Icon name={n.icon} size={19} />
                  {n.badge ? <i className="device-tab-dot" /> : null}
                </span>
                <span className="device-tab-label">{n.label.split(" ")[0]}</span>
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}
