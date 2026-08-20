import Icon from "@/components/Icon";
import { PageHead, Card, StatCard, Badge } from "@/components/ui";
import { PRIMARY_OUTLET, roomsOf, activeSessions } from "@/lib/mock";

const TYPE_ICON: Record<string, string> = {
  Massage: "hand",
  Couple: "heart-handshake",
  "Reflexology Chair": "footprints",
  VIP: "gem",
  "Wet Room": "droplet",
};

export default function RoomsPage() {
  const outlet = PRIMARY_OUTLET;
  const rooms = roomsOf(outlet.id);
  const sessions = activeSessions(outlet.id);
  const active = rooms.filter((r) => r.status === "ACTIVE");
  const maintenance = rooms.filter((r) => r.status === "MAINTENANCE");
  const occupied = rooms.filter((r) => sessions.some((s) => s.roomName === r.name));

  return (
    <>
      <PageHead
        title="Rooms"
        desc={`${outlet.name} · Konfigurasi ruangan, kapasitas, layanan pendukung, dan status maintenance.`}
        actions={<button className="btn btn-primary btn-sm"><Icon name="plus" size={14} /> Room Baru</button>}
      />

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Total Room" value={rooms.length} icon="door-open" toneKey="teal" deltaLabel="Terdaftar di outlet ini" />
        <StatCard label="Tersedia" value={active.length - occupied.length} icon="check-circle" toneKey="sky" deltaLabel="Siap dipakai" />
        <StatCard label="Terpakai" value={occupied.length} icon="timer" toneKey="gold" deltaLabel="Sedang ada sesi" />
        <StatCard label="Maintenance" value={maintenance.length} icon="wrench" toneKey="danger" deltaLabel="Tidak dapat dibooking" />
      </div>

      <div className="grid grid-3">
        {rooms.map((r) => {
          const session = sessions.find((s) => s.roomName === r.name);
          const status = r.status === "MAINTENANCE" ? "Maintenance" : session ? "Terpakai" : r.status === "INACTIVE" ? "Nonaktif" : "Tersedia";
          const tone = r.status === "MAINTENANCE" ? "warning" : session ? "accent" : r.status === "INACTIVE" ? "neutral" : "success";
          return (
            <Card key={r.id} className="card-pad" hover>
              <div className="between" style={{ marginBottom: 10, alignItems: "flex-start" }}>
                <div className="row g3">
                  <span className="stat-icon" style={{ width: 38, height: 38, borderRadius: 10 }}>
                    <Icon name={TYPE_ICON[r.type] ?? "door-open"} size={17} />
                  </span>
                  <div>
                    <div className="strong" style={{ color: "var(--text-1)", fontSize: 14.5 }}>{r.name}</div>
                    <div className="tiny dim">{r.code} · {r.type}</div>
                  </div>
                </div>
                <Badge tone={tone as "warning" | "accent" | "success" | "neutral"} dot>{status}</Badge>
              </div>

              {session && (
                <div className="tiny" style={{ marginBottom: 8, color: "var(--accent)" }}>
                  {session.customerName} · {session.packageName} · sisa {session.minutesRemaining}m
                </div>
              )}

              <div className="row between tiny dim" style={{ marginBottom: 8 }}>
                <span>Kapasitas {r.capacity} orang</span>
                <span>Buffer {r.cleanupBuffer}m</span>
              </div>

              <div className="row g1 wrap" style={{ marginBottom: 12 }}>
                {r.supportedServices.map((s) => (
                  <span key={s} className="tiny dim" style={{ padding: "3px 8px", borderRadius: "var(--r-full)", background: "var(--bg-deep)", border: "1px solid var(--border)" }}>
                    {s}
                  </span>
                ))}
              </div>

              <div className="row g2">
                <button className="btn btn-ghost btn-sm" style={{ flex: 1 }}><Icon name="edit" size={13} /> Edit</button>
                <button className="btn btn-ghost btn-sm" style={{ flex: 1 }}>
                  <Icon name={r.status === "MAINTENANCE" ? "check" : "wrench"} size={13} />
                  {r.status === "MAINTENANCE" ? "Aktifkan" : "Maintenance"}
                </button>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
