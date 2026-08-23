"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "./Icon";
import ThemeToggle from "./ThemeToggle";
import { ROLES, roleByKey } from "@/lib/nav";
import { themeVars } from "@/lib/brand";
import { useBrandOverride } from "@/lib/brandOverride";
import { ACTIVE_TENANT } from "@/lib/mock";

/**
 * Dedicated tablet-first shell for the Kasir portal.
 *
 * User request 2026-08-23: "kasir sebagian besar akan menggunakan tab bukan
 * komputer" — kasir was reusing the desktop admin Shell (sidebar + topbar),
 * which only ever collapses into an off-canvas drawer below 1024px and
 * never grows touch targets. That's a poor fit for a kasir standing at a
 * counter with a real tablet in hand all shift.
 *
 * This is NOT MobileShell (components/MobileShell.tsx) reused — MobileShell
 * renders inside a decorative phone-frame mockup (.device-stage/.device)
 * that only goes full-bleed below max-width:1080px, built for the
 * therapist/customer *demo preview*. Kasir is a real production surface on
 * a real tablet browser at any width, so .kasir-shell (app/ui.css) is
 * ALWAYS full-viewport — no frame/notch/fake status bar to hide.
 *
 * The bottom tab bar + "Lainnya" overflow sheet pattern is borrowed from
 * MobileShell (same proven UX for >5 screens), but the primary tab items
 * are a hand-picked priority list, not a mechanical first-4-of-nav slice —
 * see PRIMARY_HREFS below for why.
 */

// Hand-picked instead of `def.nav.slice(0, 4)`: /kasir/payment and
// /kasir/closing are still 100% mock/presentational (no live data, no
// working actions — see app/kasir/payment/page.tsx, app/kasir/closing/
// page.tsx) as of 2026-08-23, so surfacing them in the primary tab bar
// would put two dead-end screens in the four most-reachable slots. These
// four are the genuinely live, high-frequency screens a kasir opens all
// shift long; everything else (including payment/closing once they're
// real) lives in "Lainnya" until this list is revisited.
const PRIMARY_HREFS = ["/kasir", "/kasir/checkin", "/kasir/sessions", "/kasir/pos"];

export default function KasirShell({
  scopeLabel,
  scopeSub,
  brandKey,
  bgKey,
  notificationCount,
  children,
}: {
  scopeLabel: string;
  scopeSub: string;
  brandKey?: string;
  bgKey?: string;
  notificationCount?: number;
  children: React.ReactNode;
}) {
  const def = roleByKey("kasir");
  const pathname = usePathname();
  const [switcher, setSwitcher] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const { override } = useBrandOverride();
  const vars = themeVars(
    override.brandKey ?? brandKey ?? ACTIVE_TENANT.logoTone,
    override.bgKey ?? bgKey ?? ACTIVE_TENANT.bgTone
  );

  const active = def.nav
    .filter((n) => pathname === n.href || pathname.startsWith(n.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];

  const tabItems = PRIMARY_HREFS.map((href) => def.nav.find((n) => n.href === href)).filter(
    (n): n is (typeof def.nav)[number] => !!n
  );
  const overflowItems = def.nav.filter((n) => !PRIMARY_HREFS.includes(n.href));
  const overflowActive = overflowItems.some((n) => n.href === active?.href);

  return (
    <div className="kasir-shell" style={vars}>
      <div className="app-bg" aria-hidden />

      <header className="kasir-topbar">
        <Link href="/" className="row g2" style={{ flexShrink: 0 }}>
          <span className="brand-mark" style={{ width: 30, height: 30, borderRadius: 9 }}>
            <Icon name="waves" size={15} strokeWidth={2.4} />
          </span>
        </Link>

        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="small bold truncate" style={{ color: "var(--text-1)" }}>
            {scopeLabel}
          </div>
          <div className="tiny dim truncate">{scopeSub}</div>
        </div>

        <button
          className="btn btn-ghost btn-sm kasir-icon-btn"
          onClick={() => setSwitcher((v) => !v)}
          style={{ position: "relative", width: "auto" }}
          aria-label="Ganti Role"
        >
          <Icon name="repeat" size={14} />
        </button>
        <ThemeToggle className="kasir-icon-btn" />
        <button className="btn btn-quiet btn-icon kasir-icon-btn" aria-label="Notifikasi" style={{ position: "relative" }}>
          <Icon name="bell" size={18} />
          {!!notificationCount && notificationCount > 0 && <i className="kasir-notif-dot" />}
        </button>
      </header>

      {switcher && (
        <div className="kasir-role-switch">
          <div className="row g2 wrap">
            <span className="tiny uppercase dim" style={{ marginRight: 4 }}>
              Demo role
            </span>
            {ROLES.map((r) => (
              <Link
                key={r.key}
                href={r.base}
                className={`chip ${r.key === "kasir" ? "on" : ""}`}
                onClick={() => setSwitcher(false)}
              >
                <Icon name={r.icon} size={13} />
                {r.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      <main className="kasir-body page">{children}</main>

      {moreOpen && (
        <div className="kasir-sheet-scrim" onClick={() => setMoreOpen(false)}>
          <div className="kasir-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="row between" style={{ marginBottom: 4 }}>
              <span className="small bold" style={{ color: "var(--text-1)" }}>
                Lainnya
              </span>
              <button className="btn btn-quiet btn-icon btn-sm kasir-icon-btn" onClick={() => setMoreOpen(false)}>
                <Icon name="x" size={16} />
              </button>
            </div>
            {overflowItems.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setMoreOpen(false)}
                className="m-list-link kasir-sheet-item"
              >
                <span className="stat-icon" style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0 }}>
                  <Icon name={n.icon} size={17} />
                </span>
                <span className="small" style={{ color: active?.href === n.href ? "var(--accent)" : "var(--text-1)" }}>
                  {n.label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <nav className="kasir-tabs">
        {tabItems.map((n) => (
          <Link key={n.href} href={n.href} className={`kasir-tab ${active?.href === n.href ? "active" : ""}`}>
            <Icon name={n.icon} size={20} />
            <span className="kasir-tab-label">{n.label.split(" ")[0]}</span>
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className={`kasir-tab ${overflowActive || moreOpen ? "active" : ""}`}
          style={{ background: "none", border: "none", cursor: "pointer" }}
        >
          <Icon name="grid" size={20} />
          <span className="kasir-tab-label">Lainnya</span>
        </button>
      </nav>
    </div>
  );
}
