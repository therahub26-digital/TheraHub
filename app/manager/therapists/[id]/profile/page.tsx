import { notFound } from "next/navigation";
import { PageHead } from "@/components/ui";
import { getEmployeeById } from "@/lib/data/employees";
import { getTherapistPersonalData } from "@/lib/data/therapistProfile";
import { canEditTherapistProfile } from "@/lib/actions/therapistProfile";
import TherapistProfileView from "@/components/TherapistProfileView";

// ---------------------------------------------------------------------
// "Profil Terapis" — Manager entry point (2026-08-25). User: "buatkan
// profil terapis berisi foto profil dan data pribadi terapis ... untuk
// kepentingan manager. manager bisa cek profil masing2 therapist."
// Linked from the "Profil" button on /manager/therapists per row (see
// that page + components/StaffEditor.tsx for the existing roster UI
// this sits next to). canEditTherapistProfile() re-checks the RLS
// outlet-scope so a manager can't be shown an editable form for another
// outlet's therapist — see supabase/migrations/0026 for the real gate.
// ---------------------------------------------------------------------

export default async function ManagerTherapistProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const employee = await getEmployeeById(id);
  if (!employee || !employee.isTherapist) notFound();

  const [personalData, access] = await Promise.all([
    getTherapistPersonalData(id),
    canEditTherapistProfile(id),
  ]);

  return (
    <>
      <PageHead title="Profil Terapis" desc={`Data pribadi ${employee.name} — untuk keperluan internal, hanya terlihat oleh Manager, Admin/Owner, dan terapis yang bersangkutan.`} />
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
