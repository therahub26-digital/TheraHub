import Icon from "@/components/Icon";
import { PageHead, Card, Badge, Switch, Progress } from "@/components/ui";
import MockDataNotice from "@/components/MockDataNotice";
import { FEATURE_FLAGS } from "@/lib/mock";

export default function FlagsPage() {
  const groups = Array.from(new Set(FEATURE_FLAGS.map((f) => f.group)));

  return (
    <>
      <PageHead
        title="Platform Feature Flags"
        desc="Rollout bertahap tanpa fork code. Aktifkan fitur per tenant atau outlet sesuai kesiapan."
        actions={<button className="btn btn-primary btn-sm" disabled title="Belum tersedia — portal platform (multi-tenant) belum dibangun."><Icon name="plus" size={14} /> Buat Flag Baru</button>}
      />

      <MockDataNotice title="Data contoh — portal platform belum dibangun">
        Super Admin adalah level platform (provisioning tenant, paket langganan, feature flag) yang
        belum relevan selama TheraHub dipakai satu bisnis saja. Seluruh angka dan tabel di halaman
        ini contoh tampilan, dan tidak ada tombol di sini yang menulis ke database.
      </MockDataNotice>

      <div className="stack g5">
        {groups.map((g) => (
          <div key={g}>
            <h3 style={{ marginBottom: 10, fontSize: 14 }}>{g}</h3>
            <Card>
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Flag</th>
                      <th>Scope</th>
                      <th>Rollout</th>
                      <th>Tenant Enabled</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {FEATURE_FLAGS.filter((f) => f.group === g).map((f) => (
                      <tr key={f.key}>
                        <td>
                          <div className="strong" style={{ color: "var(--text-1)" }}>{f.label}</div>
                          <div className="tiny dim mono">{f.key}</div>
                          <div className="tiny dim" style={{ marginTop: 2, maxWidth: 380 }}>{f.description}</div>
                        </td>
                        <td><Badge tone={f.scope === "platform" ? "purple" : f.scope === "tenant" ? "info" : "accent"}>{f.scope}</Badge></td>
                        <td style={{ width: 140 }}>
                          <div className="row g2">
                            <div style={{ flex: 1 }}><Progress value={f.rollout} /></div>
                            <span className="tiny mono">{f.rollout}%</span>
                          </div>
                        </td>
                        <td className="muted small">{f.enabledTenants.length || "—"}</td>
                        <td><Switch on={f.rollout > 0} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        ))}
      </div>
    </>
  );
}
