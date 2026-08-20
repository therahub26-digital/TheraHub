import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, StatCard, Badge, PersonCell } from "@/components/ui";
import { PRIMARY_OUTLET, CUSTOMERS } from "@/lib/mock";
import { rp, fmtDateShort } from "@/lib/format";

const SEGMENT_TONE: Record<string, "success" | "accent" | "info" | "neutral"> = {
  VIP: "accent", Active: "success", New: "info", Dormant: "neutral",
};

export default function CustomersPage() {
  const outlet = PRIMARY_OUTLET;
  const customers = [...CUSTOMERS].sort((a, b) => b.lifetimeSpend - a.lifetimeSpend);
  const vip = customers.filter((c) => c.segment === "VIP");
  const active = customers.filter((c) => c.segment === "Active");
  const dormant = customers.filter((c) => c.segment === "Dormant");
  const avgTicket = customers.reduce((s, c) => s + c.avgTicket, 0) / customers.length;

  return (
    <>
      <PageHead
        title="Customers"
        desc={`${outlet.name} · Database tamu, segmentasi, membership, dan riwayat kunjungan.`}
        actions={<button className="btn btn-primary btn-sm"><Icon name="plus" size={14} /> Tamu Baru</button>}
      />

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Total Customer" value={customers.length} icon="users" toneKey="teal" deltaLabel="Terdaftar di sistem" />
        <StatCard label="VIP" value={vip.length} icon="gem" toneKey="violet" deltaLabel="≥ 30 kunjungan" />
        <StatCard label="Aktif" value={active.length} icon="heart-handshake" toneKey="sky" deltaLabel="Kunjungan rutin" />
        <StatCard label="Dormant" value={dormant.length} icon="alert-triangle" toneKey="danger" deltaLabel="Perlu re-engagement" />
      </div>

      <Card style={{ marginBottom: 20 }}>
        <CardHead title="Customer Teratas" sub={`Rata-rata ticket ${rp(avgTicket, { short: true })}`} />
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Customer</th><th>Segment</th><th>Membership</th><th>Kunjungan</th>
                <th>Lifetime Spend</th><th>Terapis Favorit</th><th>Kunjungan Terakhir</th>
              </tr>
            </thead>
            <tbody>
              {customers.slice(0, 20).map((c) => (
                <tr key={c.id}>
                  <td><PersonCell name={c.name} sub={c.phone} toneKey={c.avatarTone} /></td>
                  <td><Badge tone={SEGMENT_TONE[c.segment]} dot>{c.segment}</Badge></td>
                  <td>{c.membership !== "None" ? <Badge tone="gold">{c.membership}</Badge> : <span className="tiny dim">—</span>}</td>
                  <td className="num small">{c.visitCount}×</td>
                  <td className="num small">{rp(c.lifetimeSpend, { short: true })}</td>
                  <td className="muted small">{c.favoriteTherapist}</td>
                  <td className="muted small">{fmtDateShort(c.lastVisit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <Card>
          <CardHead title="Customer Baru" sub="Segment New — 1–2 kunjungan" />
          <div className="card-body stack g2">
            {customers.filter((c) => c.segment === "New").slice(0, 6).map((c) => (
              <div key={c.id} className="row between small" style={{ padding: "6px 0" }}>
                <PersonCell name={c.name} sub={c.favoriteService} toneKey={c.avatarTone} size={28} />
                <span className="tiny dim">{fmtDateShort(c.firstVisit)}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHead title="Perlu Re-engagement" sub="Dormant 60+ hari" />
          <div className="card-body stack g2">
            {dormant.slice(0, 6).map((c) => (
              <div key={c.id} className="row between small" style={{ padding: "6px 0" }}>
                <PersonCell name={c.name} sub={`Terakhir ${fmtDateShort(c.lastVisit)}`} toneKey={c.avatarTone} size={28} />
                <button className="btn btn-ghost btn-sm"><Icon name="message-square" size={12} /> WA</button>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
