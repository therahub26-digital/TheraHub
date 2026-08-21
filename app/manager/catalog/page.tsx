import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, StatCard, Badge, StatusBadge, Progress } from "@/components/ui";
import { getCurrentOutlet } from "@/lib/data/outlets";
import { getCategories, getServiceTypes, getPackagesForOutlet, getExtensionsForOutlet, getAddonsForOutlet } from "@/lib/data/catalog";
import { rp, minutesToHm } from "@/lib/format";
import { formatCommissionRule, commissionAmount } from "@/lib/commission";
import { PackagePricingEditor, ExtensionPricingEditor } from "@/components/CommissionEditor";

export default async function CatalogPage() {
  const outlet = await getCurrentOutlet();
  const [CATEGORIES, SERVICE_TYPES, rawPackages, extensions, addons] = await Promise.all([
    getCategories(),
    getServiceTypes(),
    getPackagesForOutlet(outlet.id),
    getExtensionsForOutlet(outlet.id),
    getAddonsForOutlet(outlet.id),
  ]);
  const packages = [...rawPackages].sort((a, b) => b.popularity - a.popularity);
  const active = packages.filter((p) => p.status === "ACTIVE");

  return (
    <>
      <PageHead
        title="Catalog"
        desc={`${outlet.name} · Kategori, jenis layanan, paket harga, extension, dan add-on.`}
        actions={<button className="btn btn-primary btn-sm"><Icon name="plus" size={14} /> Paket Baru</button>}
      />

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Kategori" value={CATEGORIES.length} icon="layers" toneKey="teal" deltaLabel={`${SERVICE_TYPES.length} jenis layanan`} />
        <StatCard label="Paket Aktif" value={active.length} icon="book-open" toneKey="sky" deltaLabel={`${packages.length - active.length} nonaktif`} />
        <StatCard label="Extension" value={extensions.filter((e) => e.active).length} icon="timer" toneKey="gold" deltaLabel="Opsi perpanjangan" />
        <StatCard label="Add-on" value={addons.filter((a) => a.active).length} icon="sparkles" toneKey="violet" deltaLabel="Layanan tambahan" />
      </div>

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        {CATEGORIES.map((c) => {
          const types = SERVICE_TYPES.filter((t) => t.categoryId === c.id);
          const pkgCount = packages.filter((p) => types.some((t) => t.id === p.serviceTypeId)).length;
          return (
            <Card key={c.id} className="card-pad">
              <div className="row g3" style={{ marginBottom: 8 }}>
                <span className="stat-icon" style={{ width: 34, height: 34, borderRadius: 10 }}>
                  <Icon name={c.icon} size={16} />
                </span>
                <div>
                  <div className="strong" style={{ color: "var(--text-1)" }}>{c.name}</div>
                  <div className="tiny dim">{pkgCount} paket</div>
                </div>
              </div>
              <div className="tiny dim">{c.description}</div>
            </Card>
          );
        })}
      </div>

      <Card style={{ marginBottom: 20 }}>
        <CardHead title="Daftar Paket" sub={`${packages.length} paket · diurutkan berdasarkan popularitas`} />
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Paket</th><th>Durasi</th><th>Harga List</th><th>Member</th><th>Weekend</th>
                <th>Room</th><th>Komisi</th><th>Popularitas</th><th>Status</th><th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {packages.map((p) => (
                <tr key={p.id}>
                  <td className="strong" style={{ color: "var(--text-1)" }}>{p.name}</td>
                  <td className="mono small">{minutesToHm(p.durationMin)}</td>
                  <td className="num small">{rp(p.listPrice)}</td>
                  <td className="num small muted">{rp(p.memberPrice)}</td>
                  <td className="num small muted">{rp(p.weekendPrice)}</td>
                  <td className="muted small">{p.roomType}</td>
                  <td className="small muted">
                    {p.commissionValue > 0 ? (
                      <>
                        <span className="strong" style={{ color: "var(--text-1)" }}>
                          {formatCommissionRule({ type: p.commissionType, value: p.commissionValue })}
                        </span>
                        {p.commissionType === "percent" && (
                          <span className="tiny dim"> = {rp(commissionAmount({ type: p.commissionType, value: p.commissionValue }, p.listPrice))}</span>
                        )}
                      </>
                    ) : (
                      <span className="tiny" style={{ color: "var(--warning, #d08b28)" }}>Belum diatur</span>
                    )}
                  </td>
                  <td style={{ minWidth: 90 }}>
                    <div className="row g2">
                      <div style={{ flex: 1, minWidth: 50 }}><Progress value={p.popularity} /></div>
                      <span className="tiny dim">{p.popularity}%</span>
                    </div>
                  </td>
                  <td><StatusBadge status={p.status} /></td>
                  <td>
                    <PackagePricingEditor
                      packageId={p.id}
                      name={p.name}
                      listPrice={p.listPrice}
                      commissionType={p.commissionType}
                      commissionValue={p.commissionValue}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <Card>
          <CardHead title="Extension Options" sub="Perpanjangan durasi sesi" />
          <div className="card-body stack g2">
            {extensions.map((e) => (
              <div key={e.id} className="row between small" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <div>
                  <div className="strong" style={{ color: "var(--text-1)" }}>{e.name}</div>
                  <div className="tiny dim">
                    {e.commission > 0
                      ? `Komisi ${formatCommissionRule({ type: e.commissionType, value: e.commission })}${
                          e.commissionType === "percent"
                            ? ` = ${rp(commissionAmount({ type: e.commissionType, value: e.commission }, e.price))}`
                            : ""
                        }`
                      : "Komisi belum diatur"}
                  </div>
                </div>
                <div className="row g3">
                  <span className="strong" style={{ color: "var(--text-1)" }}>{rp(e.price)}</span>
                  <Badge tone={e.active ? "success" : "neutral"} dot>{e.active ? "Aktif" : "Nonaktif"}</Badge>
                  <ExtensionPricingEditor
                    extensionId={e.id}
                    name={e.name}
                    price={e.price}
                    commissionType={e.commissionType}
                    commission={e.commission}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHead title="Add-on Layanan" sub="Layanan tambahan opsional" />
          <div className="card-body stack g2">
            {addons.map((a) => (
              <div key={a.id} className="row between small" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <div>
                  <div className="strong" style={{ color: "var(--text-1)" }}>{a.name}</div>
                  <div className="tiny dim">
                    {a.commission > 0
                      ? `Komisi ${formatCommissionRule({ type: a.commissionType, value: a.commission })}`
                      : "Komisi belum diatur"}
                    {a.durationMin > 0 ? ` · +${a.durationMin}m` : ""}
                  </div>
                </div>
                <div className="row g3">
                  <span className="strong" style={{ color: "var(--text-1)" }}>{rp(a.price)}</span>
                  <Badge tone={a.active ? "success" : "neutral"} dot>{a.active ? "Aktif" : "Nonaktif"}</Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
