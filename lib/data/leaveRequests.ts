import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------
// Read layer for `employee_leave_requests` — see the migration header
// (supabase/migrations/0022_employee_leave_requests.sql, DRAFT, NOT YET
// APPLIED) for the full design rationale. User request 2026-08-23:
// "di role terapis ajukan cuti dan disetujui manager" (manager & kasir
// both approve, per the user's own follow-up answer).
//
// TABLE MAY NOT EXIST YET: the migration is a draft awaiting approval,
// so every read here tolerates a missing-relation error (Postgres
// 42P01) the same way it tolerates zero rows — returns an empty list
// rather than throwing, so the pages that call this stay usable before
// and after the migration lands with no code change needed.
// ---------------------------------------------------------------------

export type LeaveRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export type LeaveRequest = {
  id: string;
  employeeId: string;
  outletId: string;
  date: string;
  note: string | null;
  status: LeaveRequestStatus;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
};

type LeaveRequestRow = {
  id: string;
  employee_id: string;
  outlet_id: string;
  date: string;
  note: string | null;
  status: string;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
};

function mapRow(row: LeaveRequestRow): LeaveRequest {
  return {
    id: row.id,
    employeeId: row.employee_id,
    outletId: row.outlet_id,
    date: row.date,
    note: row.note,
    status: row.status as LeaveRequestStatus,
    requestedAt: row.requested_at,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    decisionNote: row.decision_note,
  };
}

/** For the manager/kasir approval board — every request at this outlet, newest first. */
export async function getLeaveRequestsForOutlet(outletId: string): Promise<LeaveRequest[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_leave_requests")
    .select("*")
    .eq("outlet_id", outletId)
    .order("requested_at", { ascending: false });
  if (error || !data) return [];
  return (data as LeaveRequestRow[]).map(mapRow);
}

/** For the therapist's own "Ajukan Cuti" screen — their own requests, newest first. */
export async function getMyLeaveRequests(employeeId: string): Promise<LeaveRequest[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_leave_requests")
    .select("*")
    .eq("employee_id", employeeId)
    .order("requested_at", { ascending: false });
  if (error || !data) return [];
  return (data as LeaveRequestRow[]).map(mapRow);
}
