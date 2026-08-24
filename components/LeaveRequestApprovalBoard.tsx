"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { Badge, PersonCell } from "@/components/ui";
import { approveLeaveRequest, rejectLeaveRequest } from "@/lib/actions/leaveRequests";
import { fmtDateLong, fmtDateTime } from "@/lib/format";
import type { LeaveRequestStatus, LeaveRequestType } from "@/lib/data/leaveRequests";

// ---------------------------------------------------------------------
// Manager/kasir side of the therapist leave-request workflow (user,
// 2026-08-23: "di role terapis ajukan cuti dan disetujui manager", then
// "manager & kasir bisa menyetujui" when asked who). Approving here
// calls approveLeaveRequest() (lib/actions/leaveRequests.ts), which both
// marks this request row APPROVED and writes the real OFF/LEAVE
// exception to employee_schedule_exceptions in the same action — so an
// approved request shows up in LeavePlanBoard/ScheduleCheckBoard above
// with no separate step.
//
// Only PENDING requests get action buttons; APPROVED/REJECTED ones are
// shown read-only underneath as a short recent-decisions log so staff
// can see what was already decided without a second page.
// ---------------------------------------------------------------------

export type RequestTherapist = { id: string; name: string; code: string; avatarTone: string; photoUrl: string | null };
export type LeaveRequestRow = {
  id: string;
  employeeId: string;
  date: string;
  type: LeaveRequestType;
  note: string | null;
  status: LeaveRequestStatus;
  requestedAt: string;
};

const TYPE_LABEL: Record<LeaveRequestType, string> = {
  LEAVE: "Cuti/Sakit",
  OFF: "Libur",
};

export default function LeaveRequestApprovalBoard({
  therapists,
  requests,
}: {
  therapists: RequestTherapist[];
  requests: LeaveRequestRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const therapistById = new Map(therapists.map((t) => [t.id, t]));
  const pending = requests.filter((r) => r.status === "PENDING");
  const decided = requests.filter((r) => r.status !== "PENDING").slice(0, 8);

  function decide(id: string, action: "approve" | "reject") {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const result = action === "approve" ? await approveLeaveRequest(id) : await rejectLeaveRequest(id);
      setBusyId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="stack g3">
      {error && (
        <div className="tiny" style={{ color: "var(--danger)" }}>
          <Icon name="alert-triangle" size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />
          {error}
        </div>
      )}

      {pending.length === 0 ? (
        <div className="small dim">Tidak ada pengajuan cuti yang menunggu keputusan.</div>
      ) : (
        <div className="stack g2">
          {pending.map((r) => {
            const t = therapistById.get(r.employeeId);
            return (
              <div key={r.id} className="row between g2 wrap" style={{ padding: "10px 12px", borderRadius: "var(--r-md)", background: "var(--bg-deep)", border: "1px solid var(--border)" }}>
                <div className="row g2" style={{ minWidth: 0 }}>
                  {t ? <PersonCell name={t.name} sub={t.code} toneKey={t.avatarTone} photoUrl={t.photoUrl ?? undefined} size={30} /> : <span className="small">Terapis tidak dikenal</span>}
                  <div>
                    <div className="row g1" style={{ alignItems: "center" }}>
                      <span className="tiny bold" style={{ color: "var(--text-1)" }}>{fmtDateLong(r.date)}</span>
                      <Badge tone={r.type === "OFF" ? "neutral" : "warning"}>{TYPE_LABEL[r.type]}</Badge>
                    </div>
                    <div className="tiny dim">{r.note || "Tanpa catatan"} · diajukan {fmtDateTime(r.requestedAt)}</div>
                  </div>
                </div>
                <div className="row g1">
                  <button className="btn btn-primary btn-sm" disabled={isPending && busyId === r.id} onClick={() => decide(r.id, "approve")}>
                    <Icon name="check" size={12} /> Setujui
                  </button>
                  <button className="btn btn-danger btn-sm" disabled={isPending && busyId === r.id} onClick={() => decide(r.id, "reject")}>
                    <Icon name="x" size={12} /> Tolak
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {decided.length > 0 && (
        <div>
          <div className="tiny dim" style={{ marginBottom: 6 }}>Keputusan terbaru</div>
          <div className="stack g1">
            {decided.map((r) => {
              const t = therapistById.get(r.employeeId);
              return (
                <div key={r.id} className="row between tiny" style={{ padding: "4px 0" }}>
                  <span className="dim">{t?.name ?? "—"} · {fmtDateLong(r.date)} · {TYPE_LABEL[r.type]}</span>
                  <Badge tone={r.status === "APPROVED" ? "success" : "neutral"}>{r.status === "APPROVED" ? "Disetujui" : "Ditolak"}</Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
