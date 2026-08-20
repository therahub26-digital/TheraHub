import Icon from "@/components/Icon";
import { PageHead, Card, Badge } from "@/components/ui";
import { INTEGRATIONS } from "@/lib/mock";
import { fmtDateTime } from "@/lib/format";

export default function IntegrationsPage() {
  return (
    <>
      <PageHead title="Integrations" desc="Koneksi ke penyedia pihak ketiga: notifikasi, pembayaran, maps, dan print bridge." />

      <div className="grid grid-2">
        {INTEGRATIONS.map((it) => (
          <Card key={it.key} className="card-pad" hover>
            <div className="row between" style={{ alignItems: "flex-start" }}>
              <div className="row g3">
                <span className="stat-icon" style={{ width: 40, height: 40, borderRadius: 12 }}>
                  <Icon
                    name={
                      it.key === "wa" ? "message-square" : it.key === "payment" ? "credit-card" :
                      it.key === "maps" ? "map-pin" : it.key === "print" ? "printer" :
                      it.key === "accounting" ? "file-text" : "fingerprint"
                    }
                    size={19}
                  />
                </span>
                <div>
                  <div className="strong" style={{ color: "var(--text-1)" }}>{it.name}</div>
                  <div className="tiny dim">{it.provider}</div>
                </div>
              </div>
              <Badge tone={it.status === "Connected" ? "success" : "neutral"} dot>{it.status}</Badge>
            </div>
            <p className="small muted" style={{ margin: "12px 0" }}>{it.desc}</p>
            <div className="row between" style={{ paddingTop: 12, borderTop: "1px solid var(--border)" }}>
              <span className="tiny dim">
                {it.lastSync !== "—" ? `Sinkron terakhir ${fmtDateTime(it.lastSync)}` : "Belum terhubung"}
              </span>
              <button className={`btn btn-sm ${it.status === "Connected" ? "btn-ghost" : "btn-primary"}`}>
                {it.status === "Connected" ? "Kelola" : "Hubungkan"}
              </button>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
