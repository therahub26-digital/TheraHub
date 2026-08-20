import Icon from "@/components/Icon";
import { PageHead, Card, PersonCell, Badge, StatusBadge } from "@/components/ui";
import { getEmployees, outletNameMap } from "@/lib/data/employees";

const ROLE_TONE: Record<string, "purple" | "gold" | "info" | "accent" | "neutral"> = {
  Manager: "gold", Kasir: "info", Terapis: "accent", "Office Boy": "neutral",
  "Admin Umum": "purple", Supervisor: "purple",
};

export default async function UsersPage() {
  const EMPLOYEES = await getEmployees();
  const outletNameById = await outletNameMap();
  const nonTherapist = EMPLOYEES.filter((e) => e.jobRole !== "Terapis");
  const therapists = EMPLOYEES.filter((e) => e.jobRole === "Terapis");

  return (
    <>
      <PageHead
        title="Users & Assignment"
        desc="Manajemen user, role assignment, dan outlet scope untuk seluruh karyawan tenant."
        actions={
          <>
            <div className="search-box">
              <Icon name="search" size={15} />
              <input className="input" placeholder="Cari nama atau email…" style={{ width: 220 }} />
            </div>
            <button className="btn btn-primary btn-sm"><Icon name="plus" size={14} /> Tambah User</button>
          </>
        }
      />

      <div className="row g2 wrap" style={{ marginBottom: 16 }}>
        <span className="chip on">Semua ({EMPLOYEES.length})</span>
        <span className="chip">Manager ({EMPLOYEES.filter((e) => e.jobRole === "Manager").length})</span>
        <span className="chip">Kasir ({EMPLOYEES.filter((e) => e.jobRole === "Kasir").length})</span>
        <span className="chip">Terapis ({therapists.length})</span>
        <span className="chip">Lainnya ({nonTherapist.length - EMPLOYEES.filter((e) => e.jobRole === "Manager" || e.jobRole === "Kasir").length})</span>
      </div>

      <Card>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr><th>User</th><th>Role</th><th>Outlet Scope</th><th>Kontak</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {EMPLOYEES.map((e) => (
                <tr key={e.id}>
                  <td><PersonCell name={e.name} sub={e.code} toneKey={e.avatarTone} photoUrl={e.photoUrl} /></td>
                  <td><Badge tone={ROLE_TONE[e.jobRole] ?? "neutral"}>{e.jobRole}</Badge></td>
                  <td className="muted">{outletNameById.get(e.outletId) ?? e.outletId}</td>
                  <td className="small muted">{e.phone}</td>
                  <td><StatusBadge status={e.status} /></td>
                  <td>
                    <div className="row g1">
                      <button className="btn btn-quiet btn-icon btn-sm"><Icon name="edit" size={14} /></button>
                      <button className="btn btn-quiet btn-icon btn-sm"><Icon name="more" size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
