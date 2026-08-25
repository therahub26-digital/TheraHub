import MobileShell from "@/components/MobileShell";
import { getSignedInTherapist } from "@/lib/data/commissions";
import { getEmployeeById } from "@/lib/data/employees";
import { getTherapistPersonalData } from "@/lib/data/therapistProfile";
import { canEditTherapistProfile } from "@/lib/actions/therapistProfile";
import TherapistProfileView from "@/components/TherapistProfileView";
import { ME_THERAPIST } from "@/lib/mock";

// ---------------------------------------------------------------------
// "Profil Terapis" — self-service entry point in the therapist portal
// (2026-08-25). Added after the user's explicit correction: "halaman
// 'Profil Terapis' baru, terapis juga harus bisa edit" — not just a
// Manager-facing admin screen, the therapist edits their own copy of
// the same data here. New nav item added in lib/nav.ts (therapist role,
// "Profil Saya").
//
// The demo "Ganti Role" viewer (no real session) shows the same page in
// read-only mode against ME_THERAPIST — there is no real employee row
// behind that persona to write to, so canEdit is forced false rather
// than calling canEditTherapistProfile() with a fake id.
// ---------------------------------------------------------------------

export default async function TherapistProfilePage() {
  const signedIn = await getSignedInTherapist();

  if (signedIn) {
    const [employee, personalData, access] = await Promise.all([
      getEmployeeById(signedIn.id),
      getTherapistPersonalData(signedIn.id),
      canEditTherapistProfile(signedIn.id),
    ]);
    const name = employee?.name ?? signedIn.name;
    const code = employee?.code ?? "";
    const phone = employee?.phone ?? "";

    return (
      <MobileShell role="therapist" title="Profil Saya" avatarName={name} avatarUrl={employee?.photoUrl ?? signedIn.photoUrl} avatarTone={employee?.avatarTone} showBack>
        <div style={{ padding: 14 }}>
          <TherapistProfileView
            employeeId={signedIn.id}
            name={name}
            code={code}
            phone={phone}
            photoUrl={employee?.photoUrl ?? signedIn.photoUrl}
            initial={personalData}
            canEdit={access.canEdit}
            editNote={access.canEdit ? undefined : access.reason}
          />
        </div>
      </MobileShell>
    );
  }

  // ---- Demo "Ganti Role" viewer: read-only, mock persona ----------
  const me = ME_THERAPIST;
  return (
    <MobileShell role="therapist" title="Profil Saya" avatarName={me.name} avatarUrl={me.photoUrl} avatarTone={me.avatarTone} showBack>
      <div style={{ padding: 14 }}>
        <TherapistProfileView
          employeeId={me.id}
          name={me.name}
          code={me.code}
          phone={me.phone}
          photoUrl={me.photoUrl}
          initial={{
            employeeId: me.id, address: "", nik: "", birthPlace: "", birthDate: "",
            bankName: "", bankAccountNumber: "", bankAccountHolder: "",
            emergencyContactName: "", emergencyContactPhone: "",
          }}
          canEdit={false}
          editNote="Mode demo (Ganti Role) — login sebagai terapis sungguhan untuk mengedit profil."
        />
      </div>
    </MobileShell>
  );
}
