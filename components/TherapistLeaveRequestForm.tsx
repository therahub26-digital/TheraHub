"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { Badge } from "@/components/ui";
import { requestLeave } from "@/lib/actions/leaveRequests";
import { fmtDateLong } from "@/lib/format";
import type { LeaveRequestStatus } from "@/lib/data/leaveRequests";

// ---------------------------------------------------------------------
// Therapist's own "Ajukan Cuti" — user (2026-08-23): "di role terapis
// ajukan cuti dan disetujui manager", placed inside the Absensi screen
// per the same message's follow-up ("tombol notifikasi di role therapis
// ganti dengan absensi dan didalamnya juga ada pengajuan libur/cuti").
// Submits via requestLeave() (lib/actions/leaveRequests.ts) — lands as
// PENDING, invisible to scheduling until a manager/kasir approves it on
// /manager or /kasir's "Cek Jadwal Terapis" page (LeaveRequestApprovalBoard).
// ---------------------------------------------------------------------

export type MyLeaveRequest = { id: string; date: string; note: string | null; status: LeaveRequestStatus };

const STATUS_LABEL: Record<LeaveRequestStatus, string> = {
  PENDING: "Menunggu",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
};
const STATUS_TONE: Record<LeaveRequestStatus, "warning" | "success" | "danger"> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
};

export default function TherapistLeaveRequestForm({ minDate, requests }: { minDate: string; requests: MyLeaveRequest[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [date, setDate] = useState(minDate);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function submit() {
    if (!date) return;
    setError(null);
    setSent(false);
    startTransition(async () => {
      const result = await requestLeave(date, note.trim() || undefined);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNote("");
      setSent(true);
      router.refresh();
    });
  }

  return (
    <div className="m-card m-card-tight">
      <div className="m-section">Ajukan Cuti / Libur</div>
      <div className="stack g2" style={{ marginBottom: 12 }}>
        <label className="stack g1">
          <span className="tiny dim">Tanggal</span>
          <input className="input" type="date" min={minDate} value={date} disabled={isPending} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="stack g1">
          <span className="tiny dim">Alasan (opsional)</span>
          <input className="input" value={note} disabled={isPending} onChange={(e) => setNote(e.target.value)} placeholder="mis. sakit, acara keluarga" />
        </label>
        <button className="m-btn m-btn-primary" disabled={isPending || !date} onClick={submit}>
          <Icon name="calendar-plus" size={15} /> {isPending ? "Mengirim…" : "Kirim Pengajuan"}
        </button>
        {sent && !error && <div className="tiny" style={{ color: "var(--success, #2e9e5b)" }}>Pengajuan terkirim, menunggu persetujuan manager/kasir.</div>}
        {error && (
          <div className="tiny" style={{ color: "var(--danger)" }}>
            <Icon name="alert-triangle" size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />
            {error}
          </div>
        )}
      </div>

      {requests.length > 0 && (
        <div className="stack g2">
          <div className="tiny dim">Riwayat pengajuan</div>
          {requests.slice(0, 6).map((r) => (
            <div key={r.id} className="row between tiny">
              <span className="dim">{fmtDateLong(r.date)}{r.note ? ` · ${r.note}` : ""}</span>
              <Badge tone={STATUS_TONE[r.status]} dot>{STATUS_LABEL[r.status]}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
