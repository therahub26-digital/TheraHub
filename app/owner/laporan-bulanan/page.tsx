import { redirect } from "next/navigation";

// 2026-10-23: Laporan Bulanan pindah ke /owner/laporan (Harian · Mingguan · Bulanan).
// Tautan/bookmark lama tetap jalan.
export default async function OldOwnerMonthlyReport({ searchParams }: { searchParams: Promise<{ period?: string; outlet?: string }> }) {
  const sp = await searchParams;
  const q = new URLSearchParams({ jenis: "bulanan" });
  if (sp.period) q.set("periode", sp.period);
  if (sp.outlet && sp.outlet !== "all") q.set("outlet", sp.outlet);
  redirect(`/owner/laporan?${q.toString()}`);
}
