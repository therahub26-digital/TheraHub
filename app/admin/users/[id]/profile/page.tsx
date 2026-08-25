import { notFound } from "next/navigation";
import { PageHead } from "@/components/ui";
import { getEmployeeById } from "@/lib/data/employees";
import { getTherapistPersonalData } from "@/lib/data/therapistProfile";
import { canEditTherapistProfile } from "@/lib/actions/therapistProfile";
import TherapistProfileView from "@/components/TherapistProfileView";

// ---------------------------------------------------------------------
// "Profil Terapis" — Admin/Owner entry point (2026-08-25), linked from
// the "Profil" button on /admin/users per therapist row. Admin/Owner is
// deliberately VIEW-ONLY here (user's decision) — canEditTherapistProfile()
// returns canEdit:false for this role and TherapistProfileView renders
// plain text instead of inputs. See migration 0026's header for why
// this is enforced at the RLS layer too (employee_personal_data_write
// has no admin/owner clause at all), not just this page's rendering.
// ---------------------------------------------------------------------

export default async function AdminTherapistProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const employee = await getEmployeeById(id);
  if (!employee || !employee.isTherapist) notFound();

  const [personalData, access] = await Promise.all([
    getTherapistPersonalData(id),
    canEditTherapistProfile(id),
  ]);

  return (
    <>
      <PageHead title="Profil Terapis" desc={`Data pribadi ${employee.name} — tampilan lihat-saja untuk Admin/Owner.`} />
      <TherapistProfileView
        employeeId={id}
        name={employee.name}
        code={employee.code}
        phone={employee.phone}
        photoUrl={employee.photoUrl}
        initial={personalData}
        canEdit={access.canEdit}
        editNote={access.canEdit ? undefined : access.reason}
      />
    </>
  );
}
