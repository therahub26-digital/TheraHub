import Icon from "@/components/Icon";
import { Badge, Progress } from "@/components/ui";
import MobileShell from "@/components/MobileShell";
import { getCurrentCustomer } from "@/lib/data/customers";
import { getOutlets } from "@/lib/data/outlets";
import { getPromotionsForOutlet } from "@/lib/data/promotions";
import { ME_CUSTOMER, PROMOTIONS as MOCK_PROMOTIONS, PRIMARY_OUTLET } from "@/lib/mock";
import { rp } from "@/lib/format";

const TIERS = [
  { key: "None", label: "Reguler", min: 0 },
  { key: "Silver", label: "Silver", min: 6 },
  { key: "Gold", label: "Gold", min: 15 },
  { key: "Platinum", label: "Platinum", min: 30 },
];

// ---------------------------------------------------------------------
// UPDATE 2026-08-22 — migrated off ME_CUSTOMER/PROMOTIONS/PRIMARY_OUTLET
// mock fixtures (same dual-mode convention as the rest of /customer/*,
// see app/customer/page.tsx's header). Prepaid Package/Membership promos
// are gathered across EVERY outlet in the tenant (not just one) since a
// real customer isn't tied to a single outlet — the mock version's
// PRIMARY_OUTLET scoping doesn't have a real equivalent.
// ---------------------------------------------------------------------

export default async function MembershipPage() {
  const customer = await getCurrentCustomer();
  const live = customer !== null;
  const me = customer ?? ME_CUSTOMER;

  const currentIdx = TIERS.findIndex((t) => t.key === me.membership);
  const nextTier = TIERS[currentIdx + 1];
  const progress = nextTier ? Math.min(100, (me.visitCount / nextTier.min) * 100) : 100;

  let packages;
  if (live) {
    const outlets = await getOutlets();
    const perOutlet = await Promise.all(outlets.map((o) => getPromotionsForOutlet(o.id)));
    packages = perOutlet.flat().filter((p) => (p.type === "Prepaid Package" || p.type === "Membership") && p.status === "ACTIVE");
  } else {
    packages = MOCK_PROMOTIONS.filter((p) => p.outletId === PRIMARY_OUTLET.id && (p.type === "Prepaid Package" || p.type === "Membership") && p.status === "ACTIVE");
  }

  return (
    <MobileShell role="customer" title="Membership" subtitle="Prepaid package, tier, dan loyalty point" avatarName={me.name} avatarTone={me.avatarTone}>
      <div className="stack g4">
        <div className="m-card" style={{ textAlign: "center", background: "var(--accent-gradient)", border: "none" }}>
          <Icon name="gem" size={28} style={{ color: "#04140f", marginBottom: 8 }} />
          <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: "#04140f" }}>
            {me.membership !== "None" ? me.membership : "Reguler"}
          </div>
          <div className="tiny" style={{ color: "rgba(4,20,15,0.7)" }}>{me.visitCount} kunjungan sepanjang masa</div>
        </div>

        {nextTier && (
          <div className="m-card m-card-tight">
            <div className="row between tiny" style={{ marginBottom: 8 }}>
              <span className="muted">Menuju {nextTier.label}</span>
              <span style={{ color: "var(--text-1)" }}>{me.visitCount} / {nextTier.min} kunjungan</span>
            </div>
            <Progress value={progress} />
            <div className="tiny dim" style={{ marginTop: 8 }}>
              {Math.max(0, nextTier.min - me.visitCount)} kunjungan lagi untuk naik ke tier {nextTier.label}.
            </div>
          </div>
        )}

        <div className="row g2">
          <div className="m-stat">
            <div className="m-stat-value">{rp(me.prepaidBalance, { short: true })}</div>
            <div className="tiny dim">Saldo Prepaid</div>
          </div>
          <div className="m-stat">
            <div className="m-stat-value">{me.loyaltyPoints.toLocaleString("id-ID")}</div>
            <div className="tiny dim">Poin Loyalti</div>
          </div>
        </div>

        <div>
          <div className="m-section">Prepaid Package &amp; Membership</div>
          {packages.length === 0 ? (
            <div className="small dim" style={{ textAlign: "center", padding: "12px 0" }}>Belum ada paket prepaid/membership aktif.</div>
          ) : (
            <div className="stack g2">
              {packages.map((p) => (
                <div key={p.id} className="m-card m-card-tight">
                  <div className="row between" style={{ marginBottom: 4 }}>
                    <span className="small bold" style={{ color: "var(--text-1)" }}>{p.name}</span>
                    <Badge tone={p.type === "Membership" ? "purple" : "gold"}>{p.type}</Badge>
                  </div>
                  <div className="tiny dim" style={{ marginBottom: 10 }}>{p.value}</div>
                  <button className="m-btn m-btn-ghost" style={{ height: 36, fontSize: 12.5 }} disabled title="Pembelian online belum tersedia — hubungi outlet">
                    Beli di Outlet
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="row g2" style={{ alignItems: "flex-start", padding: "12px 14px", borderRadius: "var(--r-md)", background: "var(--info-soft)", border: "1px solid rgba(56,189,248,0.25)" }}>
          <Icon name="info" size={15} style={{ color: "var(--info)", flexShrink: 0, marginTop: 1 }} />
          <div className="tiny muted" style={{ lineHeight: 1.6 }}>
            Rp10.000 belanja = 1 poin loyalti. Tukarkan poin untuk diskon atau layanan gratis di menu Profil.
          </div>
        </div>
      </div>
    </MobileShell>
  );
}
