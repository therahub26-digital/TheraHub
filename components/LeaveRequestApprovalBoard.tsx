"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { Badge, PersonCell } from "@/components/ui";
import { approveLeaveRequest, rejectLeaveRequest } from "@/lib/actions/leaveRequests";
import { fmtDateLong, fmtDateTime } from "@/lib/format";
import type { LeaveRequestStatus, LeaveRequestType } from "@/lib/data/leaveRequests";

// ---------------------------------------------------------------------
// Manager/kasir side of the therapist keterangan workflow.
//
// SEJAK 0037 INI PAPAN PEMBERITAHUAN, BUKAN PAPAN PERSETUJUAN (Adjie
// 2026-10-15: "tidak usah minta ijin, hanya pemberitahuan dan tercatat
// saja, takutnya si manager terlewatkan"). Keterangan terapis tercatat
// otomatis oleh trigger database begitu dikirim — Cuti/Sakit & Libur
// sekaligus menulis exception jadwal (tidak bekerja hari itu, muncul di
// LeavePlanBoard/ScheduleCheckBoard tanpa langkah apa pun), Ijin Masuk
// Siang hanya tercatat. Daftar di bawah adalah catatannya, supaya tidak
// terlewat; yang perlu "dibatalkan" dikerjakan manager lewat Roster
// (set Tersedia) seperti biasa.
//
// Tombol Setujui/Tolak dipertahankan HANYA untuk baris PENDING warisan
// alur ACC lama (pra-0037, atau database yang belum menjalankan
// migrasinya) — baris baru tidak pernah PENDING.
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
  // Disetujui ≠ libur: terapis LATE tetap bekerja (tidak menulis
  // schedule exception — lihat approveLeaveRequest), hanya datang siang
  // dengan ijin; yang ditekan adalah alert absensinya hari itu.
  LATE: "Ijin Masuk Siang",
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
        <div className="small dim">
          Keterangan terapis tercatat otomatis — tidak ada yang menunggu persetujuan. Daftar terbaru di bawah.
        </div>
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
          <div className="tiny dim" style={{ marginBottom: 6 }}>Keterangan terbaru</div>
          <div className="stack g1">
            {decided.map((r) => {
              const t = therapistById.get(r.employeeId);
              return (
                <div key={r.id} className="row between tiny" style={{ padding: "4px 0" }}>
                  <span className="dim">{t?.name ?? "—"} · {fmtDateLong(r.date)} · {TYPE_LABEL[r.type]}{r.note ? ` · ${r.note}` : ""}</span>
                  <Badge tone={r.status === "APPROVED" ? "success" : "neutral"}>{r.status === "APPROVED" ? "Tercatat" : "Ditolak"}</Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
