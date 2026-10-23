import { redirect } from "next/navigation";

// 2026-10-23: Laporan Bulanan pindah ke /manager/laporan (Harian · Mingguan · Bulanan).
export default async function OldManagerMonthlyReport({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const sp = await searchParams;
  const q = new URLSearchParams({ jenis: "bulanan" });
  if (sp.period) q.set("periode", sp.period);
  redirect(`/manager/laporan?${q.toString()}`);
}
