import Link from "next/link";
import Icon from "@/components/Icon";
import ThemeToggle from "@/components/ThemeToggle";
import { ROLES } from "@/lib/nav";
import { PLATFORM_KPI } from "@/lib/mock";
import { rp } from "@/lib/format";

export default function LandingPage() {
  return (
    <div className="landing">
      <div className="landing-bg" aria-hidden />

      <header className="landing-top">
        <div className="row g3">
          <span className="brand-mark" style={{ width: 40, height: 40, borderRadius: 12 }}>
            <Icon name="waves" size={21} strokeWidth={2.4} />
          </span>
          <div>
            <div className="brand-name" style={{ fontSize: 18 }}>TheraHub</div>
            <div className="tiny dim">Spa &amp; Massage Business Management</div>
          </div>
        </div>
        <div className="row g2">
          <Badge3 label="Demo Showcase" />
          <ThemeToggle />
        </div>
      </header>

      <main className="landing-hero anim-in">
        <span className="badge badge-accent badge-lg" style={{ marginBottom: 18 }}>
          <Icon name="sparkles" size={13} /> SaaS Multi-Tenant · Single/Multi-Outlet
        </span>
        <h1 className="landing-title">
          Dari Absensi, Booking, Treatment,
          <br />
          Kasir, Stok, sampai Payroll —
          <br />
          <span className="accent-text">Satu Sistem untuk Operasional Spa.</span>
        </h1>
        <p className="landing-sub">
          TheraHub mengelola setiap peran dalam bisnis spa Anda: dari provisioning
          platform, operasional harian outlet, hingga pengalaman booking pelanggan —
          lengkap dengan data demo realistis khas spa Indonesia.
        </p>

        <div className="landing-kpi-row">
          <MiniKpi icon="building-2" label="Tenant Aktif" value={String(PLATFORM_KPI.activeTenants)} />
          <MiniKpi icon="map-pin" label="Outlet" value={String(PLATFORM_KPI.totalOutlets)} />
          <MiniKpi icon="users" label="Terapis" value={String(PLATFORM_KPI.totalTherapists)} />
          <MiniKpi icon="circle-dollar" label="MRR Platform" value={rp(PLATFORM_KPI.mrr, { short: true })} />
        </div>
      </main>

      <section className="role-grid">
        <div className="role-grid-head">
          <h2>Pilih Peran untuk Masuk ke Demo</h2>
          <p className="muted small">
            Setiap peran memiliki cakupan akses dan tampilan yang berbeda, sesuai RBAC pada blueprint.
          </p>
        </div>

        <div className="grid grid-auto">
          {ROLES.map((r, i) => (
            <Link
              href={r.base}
              key={r.key}
              className={`role-card anim-in d${Math.min(i + 1, 6)}`}
              style={{ "--role-tone": `var(--rc-${r.tone})` } as React.CSSProperties}
            >
              <span className={`role-icon tone-${r.tone}`}>
                <Icon name={r.icon} size={22} />
              </span>
              <div className="role-card-body">
                <div className="row between">
                  <h3>{r.name}</h3>
                  <Icon name="arrow-right" size={16} className="role-arrow" />
                </div>
                <div className="tiny dim" style={{ marginBottom: 8 }}>
                  Scope: {r.scope}
                </div>
                <p className="small muted">{r.tagline}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <footer className="landing-foot">
        <div className="small dim">
          TheraHub — Reference implementation dari Blueprint Spa Business Management System V2.0.
          Seluruh data pada demo ini adalah mock data untuk keperluan showcase.
        </div>
      </footer>
    </div>
  );
}

function Badge3({ label }: { label: string }) {
  return (
    <span className="badge badge-neutral">
      <Icon name="circle-check" size={11} /> {label}
    </span>
  );
}

function MiniKpi({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="mini-kpi">
      <span className="mini-kpi-icon">
        <Icon name={icon} size={15} />
      </span>
      <div>
        <div className="mini-kpi-value">{value}</div>
        <div className="tiny dim">{label}</div>
      </div>
    </div>
  );
}
