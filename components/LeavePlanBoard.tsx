"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { Badge, PersonCell } from "@/components/ui";
import { setScheduleException, clearScheduleException } from "@/lib/actions/scheduleExceptions";
import { fmtDateLong } from "@/lib/format";

// ---------------------------------------------------------------------
// "Rencana Libur/Cuti ke Depan" — user (2026-08-23): "cek jadwal
// terapis, tambahkan keterangan rencana libur/cuti (sinkron ke data
// manager outlet, buat kalau belum ada)". ScheduleCheckBoard (the
// existing per-day OFF/LIBUR toggle) is locked to TODAY by design — a
// daily routine, not a planning tool. This is the planning tool: staff
// can mark a therapist OFF/LEAVE for any future date ahead of time, and
// see everything already planned for the outlet in one list.
//
// Writes through the exact same setScheduleException/clearScheduleException
// actions and the exact same employee_schedule_exceptions table
// ScheduleCheckBoard uses — "sinkron ke data manager outlet" is already
// true by construction: manager and kasir read/write the identical
// table (schedule_exceptions_write RLS covers both), so a plan entered
// here is immediately visible on the OTHER role's page with no separate
// sync step. There's no new data store; this is just the missing UI to
// look further ahead than "today".
// ---------------------------------------------------------------------

export type PlanTherapist = { id: string; name: string; code: string; avatarTone: string; photoUrl: string | null };
export type PlanRow = { id: string; employeeId: string; date: string; type: "OFF" | "LEAVE"; note: string | null };

export default function LeavePlanBoard({
  outletId,
  minDate,
  therapists,
  rows,
}: {
  outletId: string;
  minDate: string;
  therapists: PlanTherapist[];
  rows: PlanRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [employeeId, setEmployeeId] = useState(therapists[0]?.id ?? "");
  const [date, setDate] = useState(minDate);
  const [type, setType] = useState<"OFF" | "LEAVE">("LEAVE");
  const [note, setNote] = useState("");

  const therapistById = new Map(therapists.map((t) => [t.id, t]));

  function submit() {
    if (!employeeId || !date) return;
    setError(null);
    startTransition(async () => {
      const result = await setScheduleException({ employeeId, outletId, date, type, note: note.trim() || undefined });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNote("");
      router.refresh();
    });
  }

  function remove(row: PlanRow) {
    setError(null);
    setBusyId(row.id);
    startTransition(async () => {
      const result = await clearScheduleException(row.employeeId, row.date);
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

      <div className="row g2 wrap" style={{ alignItems: "flex-end" }}>
        <label className="stack g1">
          <span className="tiny dim">Terapis</span>
          <select className="select" value={employeeId} disabled={isPending} onChange={(e) => setEmployeeId(e.target.value)}>
            {therapists.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
        <label className="stack g1">
          <span className="tiny dim">Tanggal</span>
          <input className="input" type="date" min={minDate} value={date} disabled={isPending} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="stack g1">
          <span className="tiny dim">Jenis</span>
          <select className="select" value={type} disabled={isPending} onChange={(e) => setType(e.target.value as "OFF" | "LEAVE")}>
            <option value="LEAVE">Cuti/Sakit</option>
            <option value="OFF">Libur</option>
          </select>
        </label>
        <label className="stack g1" style={{ flex: 1, minWidth: 160 }}>
          <span className="tiny dim">Catatan (opsional)</span>
          <input className="input" value={note} disabled={isPending} onChange={(e) => setNote(e.target.value)} placeholder="mis. cuti keluarga" />
        </label>
        <button className="btn btn-primary btn-sm" disabled={isPending || !employeeId || !date} onClick={submit}>
          <Icon name="calendar-plus" size={13} /> {isPending && busyId === null ? "Menyimpan…" : "Tambah Rencana"}
        </button>
      </div>

      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Tanggal</th><th>Terapis</th><th>Jenis</th><th>Catatan</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const t = therapistById.get(r.employeeId);
              return (
                <tr key={r.id}>
                  <td className="mono small nowrap">{fmtDateLong(r.date)}</td>
                  <td>{t ? <PersonCell name={t.name} sub={t.code} toneKey={t.avatarTone} photoUrl={t.photoUrl ?? undefined} size={24} /> : <span className="tiny dim">—</span>}</td>
                  <td><Badge tone={r.type === "OFF" ? "neutral" : "warning"}>{r.type === "OFF" ? "Libur" : "Cuti/Sakit"}</Badge></td>
                  <td className="muted small">{r.note || "—"}</td>
                  <td>
                    <button className="btn btn-ghost btn-sm" disabled={isPending && busyId === r.id} onClick={() => remove(r)}>
                      <Icon name="x" size={12} /> Hapus
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="dim small" style={{ textAlign: "center", padding: "20px 0" }}>Belum ada rencana libur/cuti ke depan.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
