import Link from "next/link";
import Icon from "@/components/Icon";
import { Switch } from "@/components/ui";
import MarketingConsentToggle from "@/components/MarketingConsentToggle";
import MobileShell from "@/components/MobileShell";
import LogoutButton from "@/components/LogoutButton";
import { getCurrentCustomer } from "@/lib/data/customers";
import { getBookingsForCustomer } from "@/lib/data/bookings";
import { getOutlets } from "@/lib/data/outlets";
import { ME_CUSTOMER, PRIMARY_OUTLET } from "@/lib/mock";
import { fmtDateShort } from "@/lib/format";
import { getTenantTheme } from "@/lib/data/tenant";

// ---------------------------------------------------------------------
// UPDATE 2026-08-22 — migrated off ME_CUSTOMER/PRIMARY_OUTLET mock
// fixtures (same dual-mode convention as the rest of /customer/*, see
// app/customer/page.tsx's header). "Home outlet" shown here is resolved
// the same way as the home page: most recent booking's outlet, else the
// tenant's first outlet.
//
// UPDATE 2026-08-24 — "Promo via WhatsApp" is now genuinely operable.
// It was left read-only because the shared <Switch> had no onChange;
// that has since been fixed (components/ui.tsx), so the one setting here
// with a real column (customers.marketing_consent, already writable by
// the customer under customers_update_self RLS) is wired through
// components/MarketingConsentToggle.tsx.
//
// The other three stay read-only, and that is still the right call: they
// have no columns AND no delivery channel behind them. Letting a guest
// switch off a push notification the app cannot send would be a promise
// about behaviour that does not exist.
// ---------------------------------------------------------------------

export default async function ProfilePage() {
  const theme = await getTenantTheme();
  const customer = await getCurrentCustomer();
  const live = customer !== null;
  const me = customer ?? ME_CUSTOMER;

  let outletName = PRIMARY_OUTLET.name;
  if (live) {
    const bookings = await getBookingsForCustomer(me.id);
    const mostRecent = [...bookings].sort((a, b) => b.date.localeCompare(a.date))[0];
    const outlets = await getOutlets();
    const outlet = mostRecent ? outlets.find((o) => o.id === mostRecent.outletId) : outlets[0];
    outletName = outlet?.name ?? "";
  }

  return (
    <MobileShell role="customer" brandKey={theme.brandKey} bgKey={theme.bgKey} title="Profil" subtitle={me.phone} avatarName={me.name} avatarTone={me.avatarTone}>
      <div className="stack g4">
        <div className="m-card" style={{ textAlign: "center" }}>
          <span className="avatar" style={{ width: 64, height: 64, margin: "0 auto 10px", fontSize: 22, background: "var(--accent-gradient)" }}>
            {me.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
          </span>
          <div className="m-title">{me.name}</div>
          <div className="tiny dim">{me.firstVisit ? `Member sejak ${fmtDateShort(me.firstVisit)}` : "Member baru"}</div>
        </div>

        <div className="m-card m-card-tight">
          <div className="m-section">Informasi Kontak</div>
          <div className="stack g2">
            <div className="m-row">
              <Icon name="phone" size={15} style={{ color: "var(--text-3)" }} />
              <span className="small" style={{ color: "var(--text-1)" }}>{me.phone || "—"}</span>
            </div>
            <div className="m-row">
              <Icon name="message-square" size={15} style={{ color: "var(--text-3)" }} />
              <span className="small truncate" style={{ color: "var(--text-1)" }}>{me.email || "—"}</span>
            </div>
            {outletName && (
              <div className="m-row">
                <Icon name="map-pin" size={15} style={{ color: "var(--text-3)" }} />
                <span className="small" style={{ color: "var(--text-1)" }}>{outletName}</span>
              </div>
            )}
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
            <div className="m-row">
              <span className="small" style={{ color: "var(--text-1)", flex: 1 }}>Promo via WhatsApp</span>
              {live ? (
                <MarketingConsentToggle initial={me.marketingConsent} />
              ) : (
                /* Demo viewer has no customer row to write to — showing an
                   operable switch here would save nothing. */
                <Switch on={me.marketingConsent} label="Promo via WhatsApp" title="Masuk sebagai tamu untuk mengubah preferensi ini." />
              )}
            </div>
            {[
              { label: "Notifikasi Push", on: true },
              { label: "Reminder Booking", on: true },
              { label: "Newsletter Email", on: false },
            ].map((s) => (
              <div key={s.label} className="m-row">
                <span className="small" style={{ color: "var(--text-1)", flex: 1 }}>{s.label}</span>
                <Switch on={s.on} label={s.label} title="Belum tersedia — pengingat & newsletter otomatis belum dikirim aplikasi ini." />
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

        <LogoutButton />
      </div>
    </MobileShell>
  );
}
