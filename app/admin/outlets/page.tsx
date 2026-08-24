import Link from "next/link";
import Icon from "@/components/Icon";
import { PageHead, Card, Badge, StatCard } from "@/components/ui";
import { getOutlets, formatDepositLabel } from "@/lib/data/outlets";
import OutletEditor from "@/components/OutletEditor";

export default async function OutletsPage() {
  const OUTLETS = await getOutlets();
  return (
    <>
      <PageHead
        title="Outlets"
        desc="Kelola lokasi fisik operasional. Single/multi sesuai entitlement plan."
        actions={<button className="btn btn-primary btn-sm" disabled title="Belum tersedia — membuat outlet baru juga perlu menetapkan kode outlet, prefix struk, koordinat geofence, dan manager penanggung jawab. Untuk sekarang outlet baru dibuat admin teknis; mengubah outlet yang sudah ada sudah bisa lewat tombol edit di kartunya."><Icon name="plus" size={14} /> Tambah Outlet</button>}
      />

      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <StatCard label="Total Outlet" value={OUTLETS.length} icon="map-pin" toneKey="teal" foot="Maks. 8 sesuai plan Business" />
        <StatCard label="Total Room" value={OUTLETS.reduce((s, o) => s + o.roomCount, 0)} icon="door-open" toneKey="sky" />
        <StatCard label="Total Terapis" value={OUTLETS.reduce((s, o) => s + o.therapistCount, 0)} icon="sparkles" toneKey="rose" />
      </div>

      <div className="grid grid-3" style={{ alignItems: "start" }}>
        {OUTLETS.map((o) => (
          <Card key={o.id} hover>
            <div className="card-pad" style={{ paddingBottom: 12 }}>
              <div className="between" style={{ marginBottom: 8 }}>
                <Badge tone="success" dot>{o.status}</Badge>
                <OutletEditor outlet={o} />
              </div>
              <h3 style={{ marginBottom: 3 }}>{o.name}</h3>
              <div className="small muted" style={{ marginBottom: 2 }}>{o.address}</div>
              <div className="tiny dim">{o.city} · {o.phone}</div>
            </div>
            <div className="divider" />
            <div className="card-pad stack g3">
              <div className="row between small">
                <span className="muted row g2"><Icon name="clock" size={13} /> Jam Operasional</span>
                <span style={{ color: "var(--text-1)" }}>{o.openHours.split("· ")[1]}</span>
              </div>
              <div className="row between small">
                <span className="muted row g2"><Icon name="door-open" size={13} /> Room</span>
                <span style={{ color: "var(--text-1)" }}>{o.roomCount}</span>
              </div>
              <div className="row between small">
                <span className="muted row g2"><Icon name="sparkles" size={13} /> Terapis</span>
                <span style={{ color: "var(--text-1)" }}>{o.therapistCount}</span>
              </div>
              <div className="row between small">
                <span className="muted row g2"><Icon name="user" size={13} /> Manager</span>
                <span style={{ color: "var(--text-1)" }}>{o.managerName}</span>
              </div>
              <div className="row between small">
                <span className="muted row g2"><Icon name="radar" size={13} /> Geofence</span>
                <span style={{ color: "var(--text-1)" }}>{o.geofenceRadius} m</span>
              </div>
              <div className="row between small">
                <span className="muted row g2"><Icon name="hand-coins" size={13} /> Deposit Booking</span>
                {o.deposit.enabled ? (
                  <span style={{ color: "var(--accent)", fontWeight: 600 }}>{formatDepositLabel(o.deposit)}</span>
                ) : (
                  <span className="dim">Nonaktif</span>
                )}
              </div>
              <div className="row between small">
                <span className="muted row g2"><Icon name="megaphone" size={13} /> Profil Outlet</span>
                {o.profile.published ? (
                  <Badge tone="success" dot>Terpublikasi</Badge>
                ) : (
                  <Badge tone="neutral">Draft</Badge>
                )}
              </div>
            </div>
            <div className="divider" />
            <div className="card-pad" style={{ paddingTop: 12 }}>
              <Link href={`/admin/outlets/${o.id}/profile`} className="btn btn-ghost btn-sm btn-block">
                <Icon name="camera" size={14} /> Kelola Profil Outlet
              </Link>
            </div>
          </Card>
        ))}

        <button
          className="card card-hover"
          style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 10, minHeight: 260, border: "1.5px dashed var(--border-3)", background: "transparent",
          }}
         disabled title="Belum tersedia — membuat outlet baru juga perlu menetapkan kode outlet, prefix struk, koordinat geofence, dan manager penanggung jawab. Untuk sekarang outlet baru dibuat admin teknis; mengubah outlet yang sudah ada sudah bisa lewat tombol edit di kartunya.">
          <span className="stat-icon" style={{ width: 44, height: 44, borderRadius: 14 }}>
            <Icon name="plus" size={20} />
          </span>
          <span className="small bold" style={{ color: "var(--text-2)" }}>Tambah Outlet Baru</span>
          <span className="tiny dim">5 slot tersisa dari plan Business</span>
        </button>
      </div>
    </>
  );
}
