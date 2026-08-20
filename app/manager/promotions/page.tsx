import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, StatCard, Badge, StatusBadge } from "@/components/ui";
import { PRIMARY_OUTLET, promotionsOf } from "@/lib/mock";
import { fmtDateShort, num } from "@/lib/format";

const TYPE_ICON: Record<string, string> = {
  Promo: "percent", Voucher: "ticket", "Prepaid Package": "wallet", Membership: "gem", Loyalty: "star",
};
const TYPE_TONE: Record<string, "success" | "info" | "gold" | "purple" | "warning"> = {
  Promo: "success", Voucher: "info", "Prepaid Package": "gold", Membership: "purple", Loyalty: "warning",
};

export default function PromotionsPage() {
  const outlet = PRIMARY_OUTLET;
  const promos = promotionsOf(outlet.id);
  const active = promos.filter((p) => p.status === "ACTIVE");
  const scheduled = promos.filter((p) => p.status === "SCHEDULED");
  const totalUsage = promos.reduce((s, p) => s + p.usageCount, 0);

  return (
    <>
      <PageHead
        title="Promo & Membership"
        desc={`${outlet.name} · Voucher, diskon, prepaid package, membership, dan loyalty point.`}
        actions={<button className="btn btn-primary btn-sm"><Icon name="plus" size={14} /> Promo Baru</button>}
      />

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Promo Aktif" value={active.length} icon="percent" toneKey="teal" deltaLabel={`${scheduled.length} terjadwal`} />
        <StatCard label="Total Redeem" value={num(totalUsage)} icon="ticket" toneKey="sky" deltaLabel="Sepanjang masa berlaku" />
        <StatCard label="Membership Aktif" value={promos.filter((p) => p.type === "Membership").length} icon="gem" toneKey="violet" deltaLabel="Gold & Platinum" />
        <StatCard label="Prepaid Package" value={promos.filter((p) => p.type === "Prepaid Package").length} icon="wallet" toneKey="gold" deltaLabel="Paket sesi di muka" />
      </div>

      <Card>
        <CardHead title="Daftar Promo & Membership" sub={`${promos.length} program di outlet ini`} />
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
                  <td className="muted small">{p.value}</td>
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
