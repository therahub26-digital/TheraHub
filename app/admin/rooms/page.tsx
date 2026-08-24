import Icon from "@/components/Icon";
import { PageHead, Card, Badge } from "@/components/ui";
import { getOutlets, getRoomsForOutlet } from "@/lib/data/outlets";

export default async function AdminRoomsPage() {
  const OUTLETS = await getOutlets();
  const roomsByOutlet = await Promise.all(OUTLETS.map((o) => getRoomsForOutlet(o.id)));

  return (
    <>
      <PageHead
        title="Rooms"
        desc="Room master per outlet — nama, tipe, kapasitas, dan status."
        actions={<button className="btn btn-primary btn-sm" disabled title="Belum tersedia — untuk menandai room maintenance gunakan portal Manager → Rooms; menambah/mengubah master room dilakukan langsung di database."><Icon name="plus" size={14} /> Tambah Room</button>}
      />

      <div className="stack g6">
        {OUTLETS.map((o, oi) => {
          const rooms = roomsByOutlet[oi];
          return (
            <div key={o.id}>
              <div className="between" style={{ marginBottom: 10 }}>
                <h3 style={{ fontSize: 14.5 }}>{o.name}</h3>
                <span className="tiny dim">{rooms.length} room</span>
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
                    <div className="pill-row">
                      {r.supportedServices.slice(0, 2).map((s) => (
                        <span key={s} className="chip" style={{ height: 22, fontSize: 10.5, padding: "0 8px" }}>{s}</span>
                      ))}
                      {r.supportedServices.length > 2 && (
                        <span className="chip" style={{ height: 22, fontSize: 10.5, padding: "0 8px" }}>+{r.supportedServices.length - 2}</span>
                      )}
                    </div>
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
