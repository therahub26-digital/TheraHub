import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------
// Read layer untuk dua tabel migrasi 0038 (lihat header SQL-nya untuk
// rasional penuh): customer_reviews (penilaian tamu per kunjungan) dan
// therapist_management_reviews (penilaian manajemen per terapis per
// bulan). Konvensi fallback sama dengan leaveRequests.ts: error (termasuk
// 42P01 pada database yang belum menjalankan 0038) diperlakukan sebagai
// nol baris — halaman menampilkan "belum ada penilaian", bukan crash.
// Pemicu mode demo tetap "tidak ada sesi" di halaman pemanggil (§6.2),
// bukan hasil kosong dari sini.
// ---------------------------------------------------------------------

export type CustomerReview = {
  id: string;
  bookingId: string;
  customerId: string;
  employeeId: string;
  outletId: string;
  visitDate: string;
  rating: number;
  comment: string | null;
};

type CustomerReviewRow = {
  id: string;
  booking_id: string;
  customer_id: string;
  employee_id: string;
  outlet_id: string;
  visit_date: string;
  rating: number;
  comment: string | null;
};

function mapCustomerReview(row: CustomerReviewRow): CustomerReview {
  return {
    id: row.id,
    bookingId: row.booking_id,
    customerId: row.customer_id,
    employeeId: row.employee_id,
    outletId: row.outlet_id,
    visitDate: row.visit_date,
    rating: row.rating,
    comment: row.comment,
  };
}

/** Penilaian milik customer yang login — untuk menandai kunjungan mana yang sudah dinilai di /customer/history. */
export async function getReviewsForCustomer(customerId: string): Promise<CustomerReview[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_reviews")
    .select("*")
    .eq("customer_id", customerId);
  if (error || !data) return [];
  return (data as CustomerReviewRow[]).map(mapCustomerReview);
}

/** Penilaian customer satu outlet dalam rentang tanggal kunjungan [fromDate, toDateExcl) — untuk rekap bulanan kinerja. */
export async function getCustomerReviewsForOutletInRange(outletId: string, fromDate: string, toDateExcl: string): Promise<CustomerReview[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_reviews")
    .select("*")
    .eq("outlet_id", outletId)
    .gte("visit_date", fromDate)
    .lt("visit_date", toDateExcl);
  if (error || !data) return [];
  return (data as CustomerReviewRow[]).map(mapCustomerReview);
}

export type ManagementReview = {
  employeeId: string;
  period: string;
  rating: number;
  note: string | null;
};

type ManagementReviewRow = {
  employee_id: string;
  period: string;
  rating: number;
  note: string | null;
};

/** Penilaian manajemen satu outlet untuk satu periode "YYYY-MM". Hanya terbaca manager/admin/owner (RLS 0038). */
export async function getManagementReviewsForOutlet(outletId: string, period: string): Promise<ManagementReview[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("therapist_management_reviews")
    .select("employee_id, period, rating, note")
    .eq("outlet_id", outletId)
    .eq("period", period);
  if (error || !data) return [];
  return (data as ManagementReviewRow[]).map((row) => ({
    employeeId: row.employee_id,
    period: row.period,
    rating: row.rating,
    note: row.note,
  }));
}
