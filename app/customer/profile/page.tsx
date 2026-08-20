import Link from "next/link";
import Icon from "@/components/Icon";
import { Switch } from "@/components/ui";
import MobileShell from "@/components/MobileShell";
import { ME_CUSTOMER, PRIMARY_OUTLET } from "@/lib/mock";
import { fmtDateShort } from "@/lib/format";

export default function ProfilePage() {
  const me = ME_CUSTOMER;

  return (
    <MobileShell role="customer" title="Profil" subtitle={me.phone} avatarName={me.name} avatarTone={me.avatarTone}>
      <div className="stack g4">
        <div className="m-card" style={{ textAlign: "center" }}>
          <span className="avatar" style={{ width: 64, height: 64, margin: "0 auto 10px", fontSize: 22, background: "var(--accent-gradient)" }}>
            {me.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
          </span>
          <div className="m-title">{me.name}</div>
          <div className="tiny dim">Member sejak {fmtDateShort(me.firstVisit)}</div>
        </div>

        <div className="m-card m-card-tight">
          <div className="m-section">Informasi Kontak</div>
          <div className="stack g2">
            <div className="m-row">
              <Icon name="phone" size={15} style={{ color: "var(--text-3)" }} />
              <span className="small" style={{ color: "var(--text-1)" }}>{me.phone}</span>
            </div>
            <div className="m-row">
              <Icon name="message-square" size={15} style={{ color: "var(--text-3)" }} />
              <span className="small truncate" style={{ color: "var(--text-1)" }}>{me.email}</span>
            </div>
            <div className="m-row">
              <Icon name="map-pin" size={15} style={{ color: "var(--text-3)" }} />
              <span className="small" style={{ color: "var(--text-1)" }}>{PRIMARY_OUTLET.name}</span>
            </div>
          </div>
        </div>

        {me.notes && (
          <div className="m-card m-card-tight">
            <div className="m-section">Preferensi &amp; Catatan</div>
            <div className="small muted" style={{ lineHeight: 1.6 }}>{me.notes}</div>
          </div>
        )}

        <div className="m-card m-card-tight">
          <div className="m-section">Pengaturan</div>
          <div className="stack g1">
            {[
              { label: "Notifikasi Push", on: true },
              { label: "Promo via WhatsApp", on: me.marketingConsent },
              { label: "Reminder Booking", on: true },
              { label: "Newsletter Email", on: false },
            ].map((s) => (
              <div key={s.label} className="m-row">
                <span className="small" style={{ color: "var(--text-1)", flex: 1 }}>{s.label}</span>
                <Switch on={s.on} />
              </div>
            ))}
          </div>
        </div>

        <div className="stack g2">
          <Link href="/customer/history" className="m-list-link">
            <Icon name="history" size={16} style={{ color: "var(--text-3)" }} />
            <span className="small" style={{ color: "var(--text-1)", flex: 1 }}>Riwayat Booking</span>
            <Icon name="chevron-right" size={15} style={{ color: "var(--text-4)" }} />
          </Link>
          <Link href="/customer/membership" className="m-list-link">
            <Icon name="gem" size={16} style={{ color: "var(--text-3)" }} />
            <span className="small" style={{ color: "var(--text-1)", flex: 1 }}>Membership Saya</span>
            <Icon name="chevron-right" size={15} style={{ color: "var(--text-4)" }} />
          </Link>
        </div>

        <Link href="/" className="m-btn m-btn-ghost">
          <Icon name="log-out" size={15} /> Keluar
        </Link>
      </div>
    </MobileShell>
  );
}
