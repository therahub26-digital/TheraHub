"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Icon from "./Icon";
import { Avatar } from "./ui";
import ThemeToggle from "./ThemeToggle";
import { ROLES, roleByKey } from "@/lib/nav";
import { themeVars } from "@/lib/brand";
import { useBrandOverride } from "@/lib/brandOverride";
import { ACTIVE_TENANT } from "@/lib/mock";
import { createClient } from "@/lib/supabase/client";
import type { Role } from "@/lib/types";

export default function Shell({
  role,
  scopeLabel,
  scopeSub,
  brandKey,
  bgKey,
  notificationCount,
  children,
}: {
  role: Role;
  scopeLabel: string;
  scopeSub: string;
  /** Tenant brand accent preset key — omit to use the active demo tenant's brand. */
  brandKey?: string;
  /** Tenant background preset key — omit to use the active demo tenant's background. */
  bgKey?: string;
  /**
   * Real pending-item count for the header bell (e.g. extension requests
   * awaiting a kasir/manager decision). UPDATE 2026-08-23 — user caught
   * this on their own device: the bell's red dot used to be a hardcoded
   * <i> with no data behind it at all, so it showed on EVERY page
   * regardless of whether anything actually needed attention — including
   * while a real extension request was sitting unanswered on Session
   * Monitor, which looked identical to a page with nothing pending.
   * Omit (or 0) to show no dot; a layout that has nothing real to count
   * yet (admin/owner/super-admin today) simply doesn't pass this prop.
   */
  notificationCount?: number;
  children: React.ReactNode;
}) {
  const def = roleByKey(role);
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [switcher, setSwitcher] = useState(false);
  // UPDATE 2026-08-23 — user caught this from a real (non-demo) manager
  // login: the sidebar-foot "log out" icon was a leftover from before
  // this app had real auth (see lib/route-guard.ts's header — Bug 5) —
  // just <Link href="/">, which navigates to the landing page but never
  // calls supabase.auth.signOut(). The Supabase session cookie stayed
  // valid, so going back to /manager (or even just pressing back) let
  // the same account straight back in without re-entering a password.
  // Mirrors components/LogoutButton.tsx's real sign-out, added
  // 2026-08-22 for the customer portal for the exact same reason.
  const [loggingOut, startLogout] = useTransition();
  const handleLogout = () =>
    startLogout(async () => {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    });
  const { override } = useBrandOverride();
  const vars = themeVars(
    override.brandKey ?? brandKey ?? ACTIVE_TENANT.logoTone,
    override.bgKey ?? bgKey ?? ACTIVE_TENANT.bgTone
  );

  const sections = useMemo(() => {
    const out: { name: string | undefined; items: typeof def.nav }[] = [];
    def.nav.forEach((item) => {
      const last = out[out.length - 1];
      if (last && last.name === item.section) last.items.push(item);
      else out.push({ name: item.section, items: [item] });
    });
    return out;
  }, [def]);

  const active = def.nav
    .filter((n) => pathname === n.href || pathname.startsWith(n.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];

  return (
    <div className="app-shell" style={vars}>
      <div className="app-bg" aria-hidden />
      {open && <div className="scrim" onClick={() => setOpen(false)} />}

      <aside className={`sidebar ${open ? "open" : ""}`}>
        <Link href="/" className="sidebar-brand">
          <span className="brand-mark">
            <Icon name="waves" size={19} strokeWidth={2.4} />
          </span>
          <span>
            <span className="brand-name">TheraHub</span>
            <span className="brand-sub" style={{ display: "block" }}>
              Spa Management
            </span>
          </span>
        </Link>

        <div className="sidebar-scope">
          <div className="row g2" style={{ marginBottom: 3 }}>
            <Icon name={def.icon} size={13} style={{ color: "var(--accent)" }} />
            <span className="tiny bold" style={{ color: "var(--accent)", letterSpacing: "0.04em" }}>
              {def.name.toUpperCase()}
            </span>
          </div>
          <div className="small bold truncate" style={{ color: "var(--text-1)" }}>
            {scopeLabel}
          </div>
          <div className="tiny dim truncate">{scopeSub}</div>
        </div>

        <nav className="sidebar-nav">
          {sections.map((sec, si) => (
            <div key={si}>
              {sec.name && <div className="nav-section">{sec.name}</div>}
              {sec.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-item ${active?.href === item.href ? "active" : ""}`}
                  onClick={() => setOpen(false)}
                >
                  <Icon name={item.icon} size={16.5} />
                  <span className="truncate">{item.label}</span>
                  {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="user-chip">
            <Avatar name={def.persona.name} toneKey={def.tone} size={32} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="small bold truncate" style={{ color: "var(--text-1)" }}>
                {def.persona.name}
              </div>
              <div className="tiny dim truncate">{def.persona.sub}</div>
            </div>
            <button
              type="button"
              title="Keluar"
              className="btn btn-quiet btn-icon btn-sm"
              onClick={handleLogout}
              disabled={loggingOut}
            >
              <Icon name="log-out" size={15} />
            </button>
          </div>
        </div>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <button className="btn btn-quiet btn-icon sidebar-toggle" onClick={() => setOpen(true)} aria-label="Menu">
            <Icon name="menu" size={18} />
          </button>

          <h1 className="truncate">{active?.label ?? def.name}</h1>

          <div className="grow" />

          <div className="row g2">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setSwitcher((v) => !v)}
              style={{ position: "relative" }}
            >
              <Icon name="repeat" size={14} />
              <span className="nowrap">Ganti Role</span>
              <Icon name="chevron-down" size={13} />
            </button>
            <ThemeToggle />
            <button className="btn btn-quiet btn-icon" aria-label="Notifikasi" style={{ position: "relative" }}>
              <Icon name="bell" size={17} />
              {!!notificationCount && notificationCount > 0 && (
                <i
                  style={{
                    position: "absolute",
                    top: 7,
                    right: 8,
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "var(--danger)",
                    border: "1.5px solid var(--bg-deep)",
                  }}
                />
              )}
            </button>
          </div>
        </header>

        {switcher && (
          <div
            style={{
              position: "sticky",
              top: "var(--header-h)",
              zIndex: 49,
              padding: "10px var(--s-6)",
              background: "var(--glass-bg-strong)",
              backdropFilter: "blur(18px)",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div className="row g2 wrap">
              <span className="tiny uppercase dim" style={{ marginRight: 4 }}>
                Demo role
              </span>
              {ROLES.map((r) => (
                <Link
                  key={r.key}
                  href={r.base}
                  className={`chip ${r.key === role ? "on" : ""}`}
                  onClick={() => setSwitcher(false)}
                >
                  <Icon name={r.icon} size={13} />
                  {r.name}
                </Link>
              ))}
            </div>
          </div>
        )}

        <main className="page">{children}</main>
      </div>
    </div>
  );
}
