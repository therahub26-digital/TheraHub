import Icon from "@/components/Icon";
import { PageHead, InfoNote } from "@/components/ui";
import { getEmployees, outletNameMap, isLiveEmployeesData } from "@/lib/data/employees";
import { getOutlets } from "@/lib/data/outlets";
import { getCurrentTenant } from "@/lib/data/tenant";
import { EmployeeSalaryEditor } from "@/components/EmployeeSalaryEditor";
import { EmployeeReferralEditor } from "@/components/EmployeeReferralEditor";
import { NewUserForm } from "@/components/UserEditor";
import UsersTable from "@/components/UsersTable";

const ROLE_TONE: Record<string, "purple" | "gold" | "info" | "accent" | "neutral"> = {
  Manager: "gold", Kasir: "info", Terapis: "accent", "Office Boy": "neutral",
  "Admin Umum": "purple", Supervisor: "purple",
};

export default async function UsersPage() {
  const [EMPLOYEES, outletNameById, outlets, tenant, live] = await Promise.all([
    getEmployees(),
    outletNameMap(),
    getOutlets(),
    getCurrentTenant(),
    isLiveEmployeesData(),
  ]);
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

  // "Tambah User" needs a real signed-in session (creates a real Supabase
  // Auth login) — a demo/"Ganti Role" viewer has no tenant to attach the
  // new user to, so it stays disabled there instead of silently failing.
  const canCreate = live && !!tenant?.id && outlets.length > 0;

  return (
    <>
      <PageHead
        title="Users & Assignment"
        desc="Manajemen user, role assignment, dan outlet scope untuk seluruh karyawan tenant."
        actions={
          canCreate ? (
            <NewUserForm outlets={outlets.map((o) => ({ id: o.id, name: o.name }))} tenantId={tenant!.id} />
          ) : (
            <button className="btn btn-primary btn-sm" disabled title="Perlu sesi login asli untuk membuat user baru — tidak tersedia di mode contoh/demo."><Icon name="plus" size={14} /> Tambah User</button>
          )
        }
      />

      {!live && (
        <div style={{ marginBottom: 16 }}>
          <InfoNote tone="warning" icon="alert-triangle" title="Sedang melihat data contoh">
            Daftar user di bawah ini data contoh, bukan karyawan outlet Anda — login dengan akun asli untuk mengelola user sungguhan.
          </InfoNote>
        </div>
      )}

      <UsersTable rows={rows} roleTone={ROLE_TONE} />
    </>
  );
}
