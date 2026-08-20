import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { EMPLOYEES as MOCK_EMPLOYEES } from "@/lib/mock/people";
import { getOutlets } from "@/lib/data/outlets";
import type { Employee } from "@/lib/types";

// ---------------------------------------------------------------------
// Dual-mode data-access layer for the "employees" module — same pattern
// as lib/data/outlets.ts (see that file for the full rationale):
//   - Live Supabase session with real rows -> use those (RLS-scoped).
//   - No session / empty tenant (demo "Ganti Role" viewer) -> fall back
//     to lib/mock/people.ts so the existing demo/showcase experience is
//     untouched.
// This is a temporary bridge, not a permanent architecture — see the
// TODO in lib/data/outlets.ts about splitting demo/live mode explicitly
// once real route-level auth gating lands (Phase 9).
// ---------------------------------------------------------------------

type EmployeeRow = {
  id: string;
  tenant_id: string;
  outlet_id: string;
  code: string;
  name: string;
  job_role: string;
  grade: string | null;
  phone: string | null;
  email: string | null;
  join_date: string;
  status: string;
  contract_type: string;
  base_salary: number | string;
  fixed_allowance: number | string;
  avatar_tone: string;
  is_therapist: boolean;
  skills: string[] | null;
  therapist_grade: string | null;
  max_sessions_per_day: number | null;
  presence: string | null;
  featured: boolean;
  featured_badge: string | null;
  bio: string | null;
  photo_url: string | null;
};

function mapEmployee(row: EmployeeRow): Employee {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    outletId: row.outlet_id,
    code: row.code,
    name: row.name,
    jobRole: row.job_role as Employee["jobRole"],
    grade: row.grade ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    joinDate: row.join_date,
    status: row.status as Employee["status"],
    contractType: row.contract_type as Employee["contractType"],
    baseSalary: Number(row.base_salary),
    fixedAllowance: Number(row.fixed_allowance),
    avatarTone: row.avatar_tone,
    isTherapist: row.is_therapist,
    skills: row.skills ?? [],
    therapistGrade: (row.therapist_grade as Employee["therapistGrade"]) ?? undefined,
    maxSessionsPerDay: row.max_sessions_per_day ?? undefined,
    presence: (row.presence as Employee["presence"]) ?? undefined,
    featured: row.featured,
    featuredBadge: row.featured_badge ?? undefined,
    bio: row.bio ?? undefined,
    photoUrl: row.photo_url ?? undefined,
  };
}

async function fetchLiveEmployees(): Promise<Employee[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("employees").select("*").order("code");
  if (error || !data || data.length === 0) return null;
  return (data as EmployeeRow[]).map(mapEmployee);
}

const loadEmployeesData = cache(async () => {
  const live = await fetchLiveEmployees();
  if (live) return { employees: live, live: true };
  return { employees: MOCK_EMPLOYEES, live: false };
});

export async function getEmployees(): Promise<Employee[]> {
  return (await loadEmployeesData()).employees;
}

export async function getEmployeeById(id: string): Promise<Employee | undefined> {
  return (await loadEmployeesData()).employees.find((e) => e.id === id);
}

export async function getTherapists(): Promise<Employee[]> {
  return (await loadEmployeesData()).employees.filter((e) => e.isTherapist);
}

export async function getTherapistsForOutlet(outletId: string): Promise<Employee[]> {
  return (await loadEmployeesData()).employees.filter((e) => e.isTherapist && e.outletId === outletId);
}

export async function isLiveEmployeesData(): Promise<boolean> {
  return (await loadEmployeesData()).live;
}

/** Same display convention as lib/mock/org.ts's `outletName` — strips the "Amethyst — " brand prefix. */
export async function outletNameMap(): Promise<Map<string, string>> {
  const outlets = await getOutlets();
  return new Map(outlets.map((o) => [o.id, o.name.replace("Amethyst — ", "")]));
}
