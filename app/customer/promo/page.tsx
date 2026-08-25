import Icon from "@/components/Icon";
import { Badge } from "@/components/ui";
import MobileShell from "@/components/MobileShell";
import { getCurrentCustomer } from "@/lib/data/customers";
import { getOutlets } from "@/lib/data/outlets";
import { getPromotionsForOutlet } from "@/lib/data/promotions";
import { ME_CUSTOMER, PROMOTIONS as MOCK_PROMOTIONS, PRIMARY_OUTLET } from "@/lib/mock";
import { fmtDateShort } from "@/lib/format";
import { getTenantTheme } from "@/lib/data/tenant";

// ---------------------------------------------------------------------
// Added 2026-08-23 — replaces "Riwayat" in the bottom nav (see
// lib/nav.ts) per user request. Booking history itself isn't deleted —
// it's still reachable from /customer/profile's "Riwayat Booking" link
// (app/customer/profile/page.tsx) and cancel-booking still lives there —
// only the bottom-nav slot moved, because the user wanted Promo to be
// the more prominent one.
//
// Shows "Promo"/"Voucher"/"Loyalty" type promotions only — "Prepaid
// Package"/"Membership" already have their own dedicated display on
// /customer/membership (see that page's header for why it needed its
// own tenant-wide gather instead of a single outlet), no need to
// duplicate those here.
// ---------------------------------------------------------------------

const GENERAL_TYPES = ["Promo", "Voucher", "Loyalty"] as const;

export default async function PromoPage() {
  const theme = await getTenantTheme();
  const customer = await getCurrentCustomer();
  const live = customer !== null;
  const me = customer ?? ME_CUSTOMER;

  let promos;
  if (live) {
    const outlets = await getOutlets();
    const perOutlet = await Promise.all(outlets.map((o) => getPromotionsForOutlet(o.id)));
    promos = perOutlet.flat().filter((p) => (GENERAL_TYPES as readonly string[]).includes(p.type) && p.status === "ACTIVE");
  } else {
    promos = MOCK_PROMOTIONS.filter(
      (p) => p.outletId === PRIMARY_OUTLET.id && (GENERAL_TYPES as readonly string[]).includes(p.type) && p.status === "ACTIVE"
    );
  }

  return (
    <MobileShell role="customer" brandKey={theme.brandKey} bgKey={theme.bgKey} title="Promo" subtitle="Voucher dan penawaran aktif" avatarName={me.name} avatarTone={me.avatarTone}>
      <div className="stack g4">
        {promos.length === 0 ? (
          <div className="m-card" style={{ textAlign: "center", padding: "28px 16px" }}>
            <Icon name="ticket" size={26} style={{ color: "var(--text-4)", marginBottom: 8 }} />
            <div className="small dim">Belum ada promo aktif saat ini.</div>
          </div>
        ) : (
          <div className="stack g2">
            {promos.map((p) => (
              <div key={p.id} className="m-card m-card-tight">
                <div className="row between" style={{ marginBottom: 4, alignItems: "flex-start" }}>
                  <span className="small bold" style={{ color: "var(--text-1)" }}>{p.name}</span>
                  <Badge tone={p.type === "Voucher" ? "gold" : p.type === "Loyalty" ? "purple" : "accent"}>{p.type}</Badge>
                </div>
                <div className="tiny dim" style={{ marginBottom: 8, lineHeight: 1.55 }}>{p.value}</div>
                <div className="row g2 wrap" style={{ alignItems: "center" }}>
                  {p.code && (
                    <span
                      className="tiny bold"
                      style={{
                        padding: "3px 8px", borderRadius: 6, background: "var(--accent-soft)", color: "var(--accent)",
                        letterSpacing: "0.04em", fontFamily: "monospace",
                      }}
                    >
                      {p.code}
                    </span>
                  )}
                  {p.newCustomersOnly && <Badge tone="info">Khusus Customer Baru</Badge>}
                </div>
                <div className="tiny dim" style={{ marginTop: 8 }}>
                  Berlaku sampai {fmtDateShort(p.validTo)}
                  {p.maxUsage != null && ` · Sisa kuota ${Math.max(0, p.maxUsage - p.usageCount)}`}
                </div>
              </div>
            ))}
          </div>
        )}

        <div
          className="row g2"
          style={{ alignItems: "flex-start", padding: "12px 14px", borderRadius: "var(--r-md)", background: "var(--info-soft)", border: "1px solid rgba(56,189,248,0.25)" }}
        >
          <Icon name="info" size={15} style={{ color: "var(--info)", flexShrink: 0, marginTop: 1 }} />
          <div className="tiny muted" style={{ lineHeight: 1.6 }}>
            Tunjukkan kode promo saat pembayaran di outlet. Cari paket prepaid atau membership? Cek menu Membership.
          </div>
        </div>
      </div>
    </MobileShell>
  );
}
