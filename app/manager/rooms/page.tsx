import Icon from "@/components/Icon";
import { PageHead, Card, StatCard, Badge } from "@/components/ui";
import { getCurrentOutlet } from "@/lib/data/outlets";
import { getRoomsForOutlet } from "@/lib/data/rooms";
import { getActiveSessionsForOutlet } from "@/lib/data/sessions";
import { getOpenRoomAlerts } from "@/lib/data/alerts";
import RoomMaintenanceButton from "./RoomMaintenanceButton";

// ---------------------------------------------------------------------
// Was 100% lib/mock (PRIMARY_OUTLET, roomsOf, activeSessions) — flagged
// by the user, who noticed "Room Baru" did nothing when clicked. Turned
// out every action on this page was dead, and the room list/status shown
// here could silently disagree with the real `rooms` table other pages
// already read from (see /manager's "Status Ruangan" card).
//
// Migrated to the same real data sources /manager (Today Overview)
// already uses. "Maintenance" / "Aktifkan" is now a real write
// (lib/actions/rooms.ts, RLS-scoped to this manager's own outlet).
// "Room Baru" and "Edit" still need an actual form/modal — there is no
// modal component anywhere in this codebase to build one on top of yet
// — so they're disabled with a tooltip instead of looking clickable and
// doing nothing. See the TheraHub progress doc (Bug 8) for that
// follow-up.
// ---------------------------------------------------------------------

const TYPE_ICON: Record<string, string> = {
  Massage: "hand",
  Couple: "heart-handshake",
  "Reflexology Chair": "footprints",
  VIP: "gem",
  "Wet Room": "droplet",
};

export default async function RoomsPage() {
  const outlet = await getCurrentOutlet();
  const [rooms, sessions, alerts] = await Promise.all([
    getRoomsForOutlet(outlet.id),
    getActiveSessionsForOutlet(outlet.id),
    getOpenRoomAlerts(outlet.id),
  ]);
  const alertedRoomIds = new Set(alerts.map((a) => a.roomId));

  const active = rooms.filter((r) => r.status === "ACTIVE");
  const maintenance = rooms.filter((r) => r.status === "MAINTENANCE");
  const occupied = rooms.filter((r) => sessions.some((s) => s.roomName === r.name));

  return (
    <>
      <PageHead
        title="Rooms"
        desc={`${outlet.name} · Konfigurasi ruangan, kapasitas, layanan pendukung, dan status maintenance.`}
        actions={
          <button className="btn btn-primary btn-sm" disabled title="Belum tersedia — butuh form tambah room, belum dibangun.">
            <Icon name="plus" size={14} /> Room Baru
          </button>
        }
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
          const tone = r.status === "MAINTENANCE" ? "warning" : session ? "warning" : r.status === "INACTIVE" ? "neutral" : "success";
          const alerted = alertedRoomIds.has(r.id);
          return (
            <Card key={r.id} className="card-pad" hover style={alerted ? { borderColor: "var(--danger)" } : undefined}>
              <div className="between" style={{ marginBottom: 10, alignItems: "flex-start" }}>
                <div className="row g3">
                  <span
                    className="stat-icon"
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      ...(alerted
                        ? { background: "var(--danger-soft)", color: "var(--danger)", animation: "pulseDanger 1.1s ease-in-out infinite" }
                        : {}),
                    }}
                    title={alerted ? "Terapis minta bantuan!" : undefined}
                  >
                    <Icon name={alerted ? "hand" : (TYPE_ICON[r.type] ?? "door-open")} size={17} />
                  </span>
                  <div>
                    <div className="strong" style={{ color: "var(--text-1)", fontSize: 14.5 }}>{r.name}</div>
                    <div className="tiny dim">{alerted ? "Minta bantuan!" : `${r.code} · ${r.type}`}</div>
                  </div>
                </div>
                <Badge tone={alerted ? "danger" : (tone as "warning" | "accent" | "success" | "neutral")} dot>{alerted ? "Bantuan" : status}</Badge>
              </div>

              {session && (
                <div className="tiny" style={{ marginBottom: 8, color: "var(--warning)" }}>
                  {session.therapistName} · {session.customerName} · {session.packageName} · sisa {session.minutesRemaining}m
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
                <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} disabled title="Belum tersedia — butuh form edit room, belum dibangun.">
                  <Icon name="edit" size={13} /> Edit
                </button>
                <RoomMaintenanceButton roomId={r.id} roomStatus={r.status} disabled={r.status === "INACTIVE"} />
              </div>
            </Card>
          );
        })}
        {rooms.length === 0 && <div className="small dim">Belum ada room terdaftar di outlet ini.</div>}
      </div>
    </>
  );
}
