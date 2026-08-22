import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, StatCard, Badge, StatusBadge } from "@/components/ui";
import { PromotionEditor, NewPromotionForm } from "@/components/PromotionEditor";
import { getCurrentOutlet } from "@/lib/data/outlets";
import { getEffectiveToday } from "@/lib/data/bookings";
import { getPromotionsForOutlet, isLivePromotionsData } from "@/lib/data/promotions";
import { fmtDateShort, num } from "@/lib/format";

const TYPE_ICON: Record<string, string> = {
  Promo: "percent", Voucher: "ticket", "Prepaid Package": "wallet", Membership: "gem", Loyalty: "star",
};
const TYPE_TONE: Record<string, "success" | "info" | "gold" | "purple" | "warning"> = {
  Promo: "success", Voucher: "info", "Prepaid Package": "gold", Membership: "purple", Loyalty: "warning",
};

export default async function PromotionsPage() {
  const outlet = await getCurrentOutlet();
  const [promos, live, today] = await Promise.all([getPromotionsForOutlet(outlet.id), isLivePromotionsData(), getEffectiveToday()]);
  const active = promos.filter((p) => p.status === "ACTIVE");
  const scheduled = promos.filter((p) => p.status === "SCHEDULED");
  const totalUsage = promos.reduce((s, p) => s + p.usageCount, 0);

  return (
    <>
      <PageHead
        title="Promo & Membership"
        desc={`${outlet.name} · Voucher, diskon, prepaid package, membership, dan loyalty point.`}
      />

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Promo Aktif" value={active.length} icon="percent" toneKey="teal" deltaLabel={`${scheduled.length} terjadwal`} />
        <StatCard label="Total Redeem" value={num(totalUsage)} icon="ticket" toneKey="sky" deltaLabel="Sepanjang masa berlaku" />
        <StatCard label="Membership Aktif" value={promos.filter((p) => p.type === "Membership").length} icon="gem" toneKey="violet" deltaLabel="Gold & Platinum" />
        <StatCard label="Prepaid Package" value={promos.filter((p) => p.type === "Prepaid Package").length} icon="wallet" toneKey="gold" deltaLabel="Paket sesi di muka" />
      </div>

      <Card>
        <CardHead
          title="Daftar Promo & Membership"
          sub={`${promos.length} program di outlet ini`}
          action={
            live ? (
              <NewPromotionForm outletId={outlet.id} today={today} />
            ) : (
              <button className="btn btn-primary btn-sm" disabled title="Buat promo baru butuh sesi login sungguhan (bukan viewer demo).">
                <Icon name="plus" size={14} /> Promo Baru
              </button>
            )
          }
        />
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Nama</th><th>Tipe</th><th>Kode</th><th>Value</th><th>Periode</th><th>Usage</th><th>Status</th></tr>
            </thead>
            <tbody>
              {promos.map((p) => (
                <tr key={p.id}>
                  <td className="row g2 strong" style={{ color: "var(--text-1)" }}>
                    <Icon name={TYPE_ICON[p.type] ?? "ticket"} size={13} style={{ color: "var(--accent)", flexShrink: 0 }} />
                    {p.name}
                  </td>
                  <td><Badge tone={TYPE_TONE[p.type]}>{p.type}</Badge></td>
                  <td className="mono small muted">{p.code ?? "—"}</td>
                  {/*
                    Nilai diskon TIDAK lagi hardcode di kode — bisa diatur
                    manager di sini sejak promo referral ditanyakan
                    ("bisa diseting rupiahnya kan? gak fix 30rb?", user
                    2026-08-21). Hanya untuk data live: editor menulis ke
                    baris `promotions` sungguhan (lib/actions/
                    promotions.ts), yang tidak ada artinya untuk id
                    fiktif dari mode demo "Ganti Role".
                  */}
                  <td>
                    {live ? (
                      <PromotionEditor
                        promotionId={p.id}
                        value={p.value}
                        discountAmount={p.discountAmount}
                        maxUsage={p.maxUsage}
                        validTo={p.validTo}
                        status={p.status}
                      />
                    ) : (
                      <span className="muted small">{p.value}</span>
                    )}
                  </td>
                  <td className="muted small nowrap">{fmtDateShort(p.validFrom)} – {fmtDateShort(p.validTo)}</td>
                  <td className="num small">
                    {p.usageCount}{p.maxUsage ? ` / ${p.maxUsage}` : ""}
                  </td>
                  <td><StatusBadge status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
