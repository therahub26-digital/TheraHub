import Icon from "@/components/Icon";
import { PageHead, Card, PersonCell, Badge, StatusBadge } from "@/components/ui";
import { getEmployees, outletNameMap } from "@/lib/data/employees";
import { EmployeeSalaryEditor } from "@/components/EmployeeSalaryEditor";
import { EmployeeReferralEditor } from "@/components/EmployeeReferralEditor";

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
              <input className="input" placeholder="Cari nama atau email…" disabled title="Belum tersedia — kotak pencarian di halaman ini belum menyaring tabel." style={{ width: 220 }} />
            </div>
            <button className="btn btn-primary btn-sm" disabled title="Belum tersedia — penambahan karyawan dilakukan Manager Outlet di menu Therapists & Staff."><Icon name="plus" size={14} /> Tambah User</button>
          </>
        }
      />

      <div className="row g2 wrap" style={{ marginBottom: 16 }} title="Angkanya benar, tapi chip ini hanya penghitung — menekannya belum menyaring tabel.">
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
              <tr><th>User</th><th>Role</th><th>Outlet Scope</th><th>Gaji Tetap</th><th>Referral</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {EMPLOYEES.map((e) => (
                <tr key={e.id}>
                  <td><PersonCell name={e.name} sub={e.code} toneKey={e.avatarTone} photoUrl={e.photoUrl} /></td>
                  <td><Badge tone={ROLE_TONE[e.jobRole] ?? "neutral"}>{e.jobRole}</Badge></td>
                  <td className="muted">{outletNameById.get(e.outletId) ?? e.outletId}</td>
                  {/*
                    Gaji pokok / tunjangan tetap — sebelumnya tidak ada
                    jalur untuk mengisinya sama sekali, jadi payroll modul
                    komponen FIXED/ALLOWANCE selalu menampilkan Rp0 untuk
                    admin, manager, dan kasir walau outletnya sudah
                    mengaktifkan komponen itu. Diedit langsung di sini,
                    per karyawan, karena nominalnya memang berbeda per
                    orang (lihat lib/actions/employees.ts).
                  */}
                  <td>
                    <EmployeeSalaryEditor
                      employeeId={e.id}
                      baseSalary={e.baseSalary}
                      fixedAllowance={e.fixedAllowance}
                    />
                  </td>
                  {/*
                    Fee referral (real case: Zahra dipotong 5rb/sesi untuk
                    Lusi yang merekrutnya) hanya berlaku antar terapis —
                    fee dihitung dari commission_entries terapis yang
                    direferensikan saat runPayroll() jalan (lib/actions/
                    payroll.ts), jadi kandidat perekrut dibatasi ke terapis
                    aktif di outlet yang sama. Karyawan non-terapis tidak
                    punya commission_entries untuk dihitung darinya.
                  */}
                  <td>
                    {e.jobRole === "Terapis" ? (
                      <EmployeeReferralEditor
                        employeeId={e.id}
                        candidates={therapists
                          .filter((t) => t.id !== e.id && t.outletId === e.outletId)
                          .map((t) => ({ id: t.id, name: t.name }))}
                        referredByEmployeeId={e.referredByEmployeeId}
                        referralFeeType={e.referralFeeType}
                        referralFeeValue={e.referralFeeValue}
                      />
                    ) : (
                      <span className="tiny dim">—</span>
                    )}
                  </td>
                  <td><StatusBadge status={e.status} /></td>
                  <td>
                    <div className="row g1">
                      <button className="btn btn-quiet btn-icon btn-sm" disabled title="Belum tersedia — fiturnya belum dibangun."><Icon name="more" size={14} /></button>
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
