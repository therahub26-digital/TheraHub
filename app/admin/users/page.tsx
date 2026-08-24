import Icon from "@/components/Icon";
import { PageHead } from "@/components/ui";
import { getEmployees, outletNameMap } from "@/lib/data/employees";
import { EmployeeSalaryEditor } from "@/components/EmployeeSalaryEditor";
import { EmployeeReferralEditor } from "@/components/EmployeeReferralEditor";
import UsersTable from "@/components/UsersTable";

const ROLE_TONE: Record<string, "purple" | "gold" | "info" | "accent" | "neutral"> = {
  Manager: "gold", Kasir: "info", Terapis: "accent", "Office Boy": "neutral",
  "Admin Umum": "purple", Supervisor: "purple",
};

export default async function UsersPage() {
  const EMPLOYEES = await getEmployees();
  const outletNameById = await outletNameMap();
  const nonTherapist = EMPLOYEES.filter((e) => e.jobRole !== "Terapis");
  const therapists = EMPLOYEES.filter((e) => e.jobRole === "Terapis");

  // Server-rendered per-row cells (salary/referral editors are themselves
  // client components) are pre-built here and handed to UsersTable as
  // plain ReactNode props — a client component can't receive a render
  // function from a server component, but it can receive JSX built here.
  const rows = EMPLOYEES.map((e) => ({
    employee: e,
    outletName: outletNameById.get(e.outletId) ?? e.outletId,
    salary: <EmployeeSalaryEditor employeeId={e.id} baseSalary={e.baseSalary} fixedAllowance={e.fixedAllowance} />,
    referral:
      e.jobRole === "Terapis" ? (
        <EmployeeReferralEditor
          employeeId={e.id}
          candidates={therapists.filter((t) => t.id !== e.id && t.outletId === e.outletId).map((t) => ({ id: t.id, name: t.name }))}
          referredByEmployeeId={e.referredByEmployeeId}
          referralFeeType={e.referralFeeType}
          referralFeeValue={e.referralFeeValue}
        />
      ) : (
        <span className="tiny dim">—</span>
      ),
  }));

  return (
    <>
      <PageHead
        title="Users & Assignment"
        desc="Manajemen user, role assignment, dan outlet scope untuk seluruh karyawan tenant."
        actions={
          <button className="btn btn-primary btn-sm" disabled title="Belum tersedia — penambahan karyawan dilakukan Manager Outlet di menu Therapists & Staff."><Icon name="plus" size={14} /> Tambah User</button>
        }
      />

      <div className="row g2 wrap" style={{ marginBottom: 16 }} title="Angkanya benar, tapi chip ini hanya penghitung — menekannya belum menyaring tabel.">
        <span className="chip on">Semua ({EMPLOYEES.length})</span>
        <span className="chip">Manager ({EMPLOYEES.filter((e) => e.jobRole === "Manager").length})</span>
        <span className="chip">Kasir ({EMPLOYEES.filter((e) => e.jobRole === "Kasir").length})</span>
        <span className="chip">Terapis ({therapists.length})</span>
        <span className="chip">Lainnya ({nonTherapist.length - EMPLOYEES.filter((e) => e.jobRole === "Manager" || e.jobRole === "Kasir").length})</span>
      </div>

      <UsersTable rows={rows} roleTone={ROLE_TONE} />
    </>
  );
}
