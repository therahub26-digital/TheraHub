import { redirect } from "next/navigation";
import { ROLE_HOME } from "@/lib/route-guard";
import { createClient } from "@/lib/supabase/server";
import { monthLabel } from "@/lib/format";

type AppUserRow = { role: string; outlet_id: string | null };

export async function requireMonthlyReportRole(
  allowedRoles: string[],
  pathname: string
): Promise<AppUserRow> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) throw new Error(`Sesi laporan bulanan gagal diperiksa: ${authError.message}`);
  if (!user) redirect(`/login?next=${encodeURIComponent(pathname)}`);

  const { data, error } = await supabase
    .from("app_users")
    .select("role, outlet_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (error) throw new Error(`Role laporan bulanan gagal diperiksa: ${error.message}`);
  if (!data) redirect("/login");

  const actor = data as AppUserRow;
  if (!allowedRoles.includes(actor.role)) redirect(ROLE_HOME[actor.role] ?? "/login");
  return actor;
}

export function monthlyReportPeriodOptions(effectivePeriod: string, selectedPeriod: string) {
  const [year, month] = effectivePeriod.split("-").map(Number);
  const values = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - index, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  });
  if (!values.includes(effectivePeriod)) values.push(effectivePeriod);
  if (!values.includes(selectedPeriod)) values.push(selectedPeriod);
  return [...new Set(values)].sort((a, b) => b.localeCompare(a))
    .map((value) => ({ value, label: monthLabel(value) }));
}
