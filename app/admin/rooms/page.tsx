import Icon from "@/components/Icon";
import { PageHead, Card, Badge } from "@/components/ui";
import { getOutlets, getRoomsForOutlet } from "@/lib/data/outlets";
import { NewRoomButton, EditRoomButton } from "@/components/RoomEditor";

export default async function AdminRoomsPage() {
  const OUTLETS = await getOutlets();
  const roomsByOutlet = await Promise.all(OUTLETS.map((o) => getRoomsForOutlet(o.id)));

  return (
    <>
      <PageHead
        title="Rooms"
        desc="Room master per outlet — nama, tipe, kapasitas, dan status."
      />

      {/* One "Room Baru" per outlet section rather than one global button:
          a room cannot exist without an outlet, and this admin page lists
          every outlet in the tenant, so a single top-level button would
          have needed an outlet picker inside the form to answer a question
          the section heading already answers. */}

      <div className="stack g6">
        {OUTLETS.map((o, oi) => {
          const rooms = roomsByOutlet[oi];
          return (
            <div key={o.id}>
              <div className="between" style={{ marginBottom: 10 }}>
                <h3 style={{ fontSize: 14.5 }}>{o.name}</h3>
                <div className="row g2">
                  <span className="tiny dim">{rooms.length} room</span>
                  <NewRoomButton outletId={o.id} outletName={o.name} />
                </div>
              </div>
              <div className="grid grid-4">
                {rooms.map((r) => (
                  <Card key={r.id} className="card-pad" hover>
                    <div className="between" style={{ marginBottom: 8 }}>
                      <span className="stat-icon" style={{ width: 30, height: 30, borderRadius: 9 }}>
                        <Icon name="door-open" size={15} />
                      </span>
                      <Badge tone={r.status === "ACTIVE" ? "success" : r.status === "MAINTENANCE" ? "warning" : "neutral"}>
                        {r.status}
                      </Badge>
                    </div>
                    <div className="strong" style={{ color: "var(--text-1)", marginBottom: 2 }}>{r.name}</div>
                    <div className="tiny dim" style={{ marginBottom: 8 }}>{r.type} · kapasitas {r.capacity}</div>
                    <div className="pill-row" style={{ marginBottom: 8 }}>
                      {r.supportedServices.slice(0, 2).map((s) => (
                        <span key={s} className="chip" style={{ height: 22, fontSize: 10.5, padding: "0 8px" }}>{s}</span>
                      ))}
                      {r.supportedServices.length > 2 && (
                        <span className="chip" style={{ height: 22, fontSize: 10.5, padding: "0 8px" }}>+{r.supportedServices.length - 2}</span>
                      )}
                    </div>
                    <EditRoomButton room={r} compact />
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
