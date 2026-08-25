import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------
// Read layer for "Profil Terapis" (supabase/migrations/0026) — profile
// photo (employees.photo_url, already existed) + personal data (new
// employee_personal_data table: address, NIK/KTP, tempat & tanggal
// lahir, rekening bank, kontak darurat).
//
// User (2026-08-25): "buatkan profil terapis ... untuk kepentingan
// manager. manager bisa cek profil masing2 therapist" — kemudian
// dikoreksi: "terapis juga harus bisa edit" profilnya sendiri, jadi
// bukan cuma tampilan Manager. Lihat header migrasi 0026 untuk
// penjelasan lengkap kenapa data ini di tabel terpisah (bukan kolom
// baru langsung di `employees`) dan model akses Manager-edit-semua /
// Admin-Owner-lihat-saja / Terapis-edit-sendiri.
//
// Tidak ada mode mock/demo di sini (beda dari lib/data/employees.ts) —
// halaman "Profil Terapis" hanya masuk akal untuk employee row yang
// benar-benar ada, jadi pemanggilnya (halaman-halaman di bawah) yang
// menangani kasus "belum ada sesi live" dengan pesan biasa, bukan
// fallback ke persona demo.
// ---------------------------------------------------------------------

export type TherapistPersonalData = {
  employeeId: string;
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

type PersonalDataRow = {
  employee_id: string;
  address: string | null;
  nik: string | null;
  birth_place: string | null;
  birth_date: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_holder: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
};

function mapRow(row: PersonalDataRow): TherapistPersonalData {
  return {
    employeeId: row.employee_id,
    address: row.address ?? "",
    nik: row.nik ?? "",
    birthPlace: row.birth_place ?? "",
    birthDate: row.birth_date ?? "",
    bankName: row.bank_name ?? "",
    bankAccountNumber: row.bank_account_number ?? "",
    bankAccountHolder: row.bank_account_holder ?? "",
    emergencyContactName: row.emergency_contact_name ?? "",
    emergencyContactPhone: row.emergency_contact_phone ?? "",
  };
}

function emptyProfile(employeeId: string): TherapistPersonalData {
  return {
    employeeId,
    address: "",
    nik: "",
    birthPlace: "",
    birthDate: "",
    bankName: "",
    bankAccountNumber: "",
    bankAccountHolder: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
  };
}

/**
 * Returns the personal-data row for one therapist, or an all-blank
 * profile (same shape) when they haven't filled anything in yet — every
 * therapist gets a row lazily via upsert on first save, not on account
 * creation, so "no row yet" is the normal state for a brand-new hire.
 *
 * NOTE on authorization: RLS (employee_personal_data_read, 0026) always
 * applies, so an unauthorized caller simply gets no row back — same
 * shape as "nothing filled in yet". That is indistinguishable from here,
 * which is fine: the actual gate against leaking data IS the RLS policy,
 * not this function. Page-level authorization (deciding whether to even
 * render this page/form for the current viewer, and whether to show it
 * as editable) is a separate, coarser check — see
 * lib/actions/therapistProfile.ts's canEditTherapistProfile().
 */
export async function getTherapistPersonalData(employeeId: string): Promise<TherapistPersonalData> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("employee_personal_data")
    .select("*")
    .eq("employee_id", employeeId)
    .maybeSingle();

  if (!data) return emptyProfile(employeeId);
  return mapRow(data as PersonalDataRow);
}
