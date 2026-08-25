"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------
// Write layer for "Profil Terapis" (supabase/migrations/0026). See that
// migration's header for the full background and lib/data/therapistProfile.ts
// for the read side.
//
// Access model (user, 2026-08-25, final after an explicit correction —
// "halaman 'Profil Terapis' baru, terapis juga harus bisa edit"):
//   - Manager (outlet sendiri): edit semua terapis di outletnya.
//   - Admin/Owner (tenant): HANYA lihat — tombol simpan di UI mereka
//     memang tidak pernah dipanggil, tapi checkCanEdit() di bawah juga
//     menolak eksplisit kalau suatu saat ada jalur lain yang mencoba.
//   - Terapis sendiri: edit profilnya sendiri saja.
//
// RLS (employee_personal_data_write, 0026) sudah menegakkan ini di level
// baris untuk tabel data pribadi. Untuk photo_url (masih di tabel
// employees lama), RLS + trigger _guard_employee_self_update() (0026)
// yang menegakkannya. checkCanEdit() di sini HANYA untuk pesan error
// yang bisa dibaca user kalau tombol simpan sempat terpanggil padahal
// tidak seharusnya — sama seperti pola di lib/actions/employees.ts.
// ---------------------------------------------------------------------

export type ActionResult = { ok: true } | { ok: false; error: string };

export type CanEdit = { canEdit: false; reason: string } | { canEdit: true; isSelf: boolean };

/** Used by pages to decide whether to render the form as editable or read-only. */
export async function canEditTherapistProfile(employeeId: string): Promise<CanEdit> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { canEdit: false, reason: "Sesi tidak ditemukan — silakan login ulang." };

  const { data: appUser } = await supabase
    .from("app_users")
    .select("employee_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!appUser) return { canEdit: false, reason: "Akun ini tidak terhubung ke data karyawan manapun." };

  if (appUser.employee_id === employeeId) return { canEdit: true, isSelf: true };
  if (appUser.role === "manager") {
    // Manager di outlet yang sama — RLS (_is_manager_here) adalah
    // penegak sebenarnya; ini dicek ulang di sini hanya supaya UI tidak
    // menampilkan form "bisa edit" untuk manager outlet lain lalu gagal
    // membingungkan saat disimpan.
    const { data: target } = await supabase.from("employees").select("outlet_id").eq("id", employeeId).maybeSingle();
    const { data: mine } = await supabase.from("app_users").select("outlet_id").eq("auth_user_id", user.id).maybeSingle();
    if (target && mine && target.outlet_id === mine.outlet_id) return { canEdit: true, isSelf: false };
  }
  if (appUser.role === "admin" || appUser.role === "owner" || appUser.role === "super-admin") {
    return { canEdit: false, reason: "Admin/Owner hanya bisa melihat Profil Terapis — pengeditan dilakukan Manager outlet atau terapis yang bersangkutan." };
  }
  return { canEdit: false, reason: "Role kamu belum diizinkan mengedit profil ini." };
}

function writeError(error: { code?: string; message?: string } | null, what: string): string {
  if (error?.code === "42501") {
    return `Kamu tidak diizinkan mengubah ${what}.`;
  }
  if (error?.code === "42703" || error?.code === "42P01") {
    return `Kolom/tabel untuk ${what} belum ada di database — migrasi 0026 belum dijalankan.`;
  }
  const detail = error?.message ? ` (${error.message})` : "";
  return `Gagal menyimpan ${what} — coba lagi.${detail}`;
}

export type TherapistPersonalDataInput = {
  address: string;
  nik: string;
  birthPlace: string;
  birthDate: string;
  bankName: string;
  bankAccountNumber: string;
  bankAccountHolder: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
};

function revalidateProfile(employeeId: string) {
  revalidatePath(`/manager/therapists/${employeeId}/profile`);
  revalidatePath(`/admin/users/${employeeId}/profile`);
  revalidatePath("/therapist/profile");
}

export async function setTherapistPersonalData(employeeId: string, input: TherapistPersonalDataInput): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  if (input.nik && !/^\d{16}$/.test(input.nik.trim())) {
    return { ok: false, error: "NIK/KTP harus 16 digit angka." };
  }

  const { error } = await supabase
    .from("employee_personal_data")
    .upsert(
      {
        employee_id: employeeId,
        address: input.address.trim() || null,
        nik: input.nik.trim() || null,
        birth_place: input.birthPlace.trim() || null,
        birth_date: input.birthDate || null,
        bank_name: input.bankName.trim() || null,
        bank_account_number: input.bankAccountNumber.trim() || null,
        bank_account_holder: input.bankAccountHolder.trim() || null,
        emergency_contact_name: input.emergencyContactName.trim() || null,
        emergency_contact_phone: input.emergencyContactPhone.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "employee_id" }
    )
    .select("employee_id")
    .maybeSingle();

  if (error) return { ok: false, error: writeError(error, "profil pribadi") };

  revalidateProfile(employeeId);
  return { ok: true };
}

/** Profile-photo upload for the Profil Terapis page — same `therapist-photos` bucket/column as StaffEditor's ProfilePhotoUploader, just a second entry point (now also reachable by the therapist themselves, see migration 0026's self-photo RLS + trigger). */
export async function setTherapistProfilePhotoUrl(employeeId: string, url: string | null): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  const { data, error } = await supabase
    .from("employees")
    .update({ photo_url: url })
    .eq("id", employeeId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: writeError(error, "foto profil") };
  if (!data) return { ok: false, error: "Kamu tidak diizinkan mengubah foto profil terapis ini." };

  revalidateProfile(employeeId);
  revalidatePath("/manager/therapists");
  revalidatePath("/customer/book");
  revalidatePath("/customer/outlets");
  return { ok: true };
}
