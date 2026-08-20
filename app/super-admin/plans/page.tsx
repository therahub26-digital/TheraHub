import Icon from "@/components/Icon";
import { PageHead, Card, Badge } from "@/components/ui";
import { PLANS, MODULE_LIST, TENANTS } from "@/lib/mock";
import { rp } from "@/lib/format";

export default function PlansPage() {
  return (
    <>
      <PageHead
        title="Plans & Module Entitlements"
        desc="Kelola paket, harga, dan modul yang tersedia per plan. Module entitlement adalah kontrak kemampuan tenant."
        actions={<button className="btn btn-primary btn-sm"><Icon name="plus" size={14} /> Tambah Plan</button>}
      />

      <div className="grid grid-4" style={{ marginBottom: 24, alignItems: "stretch" }}>
        {PLANS.map((p) => (
          <Card key={p.key} className="card-pad" hover>
            <div className="between" style={{ marginBottom: 4 }}>
              <h3>{p.name}</h3>
              <Badge tone="accent">{TENANTS.filter((t) => t.plan === p.key).length} tenant</Badge>
            </div>
            <div className="tiny dim" style={{ marginBottom: 14 }}>{p.target}</div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, color: "var(--text-1)", marginBottom: 2 }}>
              {rp(p.pricePerOutlet, { short: true })}
            </div>
            <div className="tiny dim" style={{ marginBottom: 16 }}>per outlet / bulan</div>

            <div className="stack g2" style={{ marginBottom: 16 }}>
              <div className="row between tiny dim"><span>Max outlet</span><span className="bold" style={{ color: "var(--text-2)" }}>{p.maxOutlets}</span></div>
              <div className="row between tiny dim"><span>Max user</span><span className="bold" style={{ color: "var(--text-2)" }}>{p.maxUsers}</span></div>
              <div className="row between tiny dim"><span>Max terapis</span><span className="bold" style={{ color: "var(--text-2)" }}>{p.maxTherapists}</span></div>
            </div>

            <div className="stack g2">
              {p.features.map((f) => (
                <div key={f} className="row g2 small">
                  <Icon name="check" size={13} style={{ color: "var(--accent)", flexShrink: 0 }} />
                  <span className="muted">{f}</span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="card-head">
          <div>
            <h3>Matriks Modul per Plan</h3>
            <div className="sub">Module entitlement menentukan apa yang boleh digunakan tenant, bukan isi operasionalnya.</div>
          </div>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Modul</th>
                <th>Owner Konfigurasi</th>
                {PLANS.map((p) => <th key={p.key} className="center">{p.name.split(" ")[0]}</th>)}
              </tr>
            </thead>
            <tbody>
              {MODULE_LIST.map((m) => (
                <tr key={m.key}>
                  <td>
                    <div className="strong" style={{ color: "var(--text-1)" }}>{m.label}</div>
                    <div className="tiny dim">{m.desc}</div>
                  </td>
                  <td className="muted small">{m.owner}</td>
                  {PLANS.map((p) => (
                    <td key={p.key} className="center">
                      {p.modules.includes(m.key) ? (
                        <Icon name="check-circle" size={16} style={{ color: "var(--success)" }} />
                      ) : (
                        <Icon name="minus" size={14} style={{ color: "var(--text-4)" }} />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
