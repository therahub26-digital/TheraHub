"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { Badge, PersonCell } from "@/components/ui";
import { setScheduleException, clearScheduleException } from "@/lib/actions/scheduleExceptions";
import { cancelBookingStaff, reassignBookingTherapist } from "@/lib/actions/bookings";
import { fmtTime, fmtDateShort } from "@/lib/format";

// ---------------------------------------------------------------------
// Client half of the daily off/leave check (see ScheduleCheckPage.tsx
// for the data/rationale). Two things happen here:
//   1. Per-therapist OFF/LEAVE/AVAILABLE toggle — writes straight to
//      employee_schedule_exceptions via setScheduleException/
//      clearScheduleException.
//   2. For any therapist marked OFF/LEAVE, their active bookings TODAY
//      are listed with Reassign (pick another active therapist at this
//      outlet) or Cancel actions — reassignBookingTherapist/
//      cancelBookingStaff, both in lib/actions/bookings.ts.
// router.refresh() after every write, same convention as
// CancelBookingButton.tsx — this page has no client-side cache of its
// own, it always re-renders from the server's fresh read.
// ---------------------------------------------------------------------

export type BoardTherapist = {
  id: string;
  name: string;
  code: string;
  grade: string | null;
  photoUrl: string | null;
  avatarTone: string;
};

export type BoardException = { employeeId: string; type: "OFF" | "LEAVE"; note: string | null };

// Upcoming (future) exceptions, used only to surface approved leave dates
// in the roster table below -- same shape as LeavePlanBoard's rows, kept
// separate from BoardException (today-only) because a therapist can be
// "Tersedia" today but still have LEAVE approved for a date next week.
export type BoardUpcoming = { employeeId: string; date: string; type: "OFF" | "LEAVE" };

export type BoardBooking = {
  id: string;
  code: string;
  customerName: string;
  therapistId: string;
  scheduledStart: string;
  scheduledEnd: string;
  packageName: string;
  status: string;
};

const STATUS_OPTIONS: { value: "AVAILABLE" | "OFF" | "LEAVE"; label: string }[] = [
  { value: "AVAILABLE", label: "Tersedia" },
  { value: "OFF", label: "Libur" },
  { value: "LEAVE", label: "Cuti/Sakit" },
];

export default function ScheduleCheckBoard({
  outletId,
  date,
  therapists,
  exceptions,
  upcoming = [],
  bookings,
}: {
  outletId: string;
  date: string;
  therapists: BoardTherapist[];
  exceptions: BoardException[];
  upcoming?: BoardUpcoming[];
  bookings: BoardBooking[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reassigning, setReassigning] = useState<string | null>(null); // bookingId being reassigned

  const exceptionByEmployee = new Map(exceptions.map((e) => [e.employeeId, e]));
  // "tanggal cuti yang sudah disetujui dimasukan ke tabel ... antara
  // status hari ini dan booking terdampak" (user review, 2026-08-23):
  // approved LEAVE dates for each therapist, today's + any upcoming ones
  // from Rencana Libur/Cuti ke Depan, so the roster doesn't require
  // scrolling to a separate card to see when someone is off next.
  const leaveDatesByEmployee = new Map<string, string[]>();
  for (const e of exceptions) {
    if (e.type !== "LEAVE") continue;
    leaveDatesByEmployee.set(e.employeeId, [date]);
  }
  for (const u of upcoming) {
    if (u.type !== "LEAVE") continue;
    const arr = leaveDatesByEmployee.get(u.employeeId) ?? [];
    arr.push(u.date);
    leaveDatesByEmployee.set(u.employeeId, arr);
  }
  for (const arr of leaveDatesByEmployee.values()) arr.sort();

  function setStatus(employeeId: string, status: "AVAILABLE" | "OFF" | "LEAVE") {
    setError(null);
    setBusyId(employeeId);
    startTransition(async () => {
      const result =
        status === "AVAILABLE"
          ? await clearScheduleException(employeeId, date)
          : await setScheduleException({ employeeId, outletId, date, type: status });
      setBusyId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function doCancel(bookingId: string) {
    setError(null);
    setBusyId(bookingId);
    startTransition(async () => {
      const result = await cancelBookingStaff(bookingId);
      setBusyId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function doReassign(bookingId: string, newTherapistId: string) {
    setError(null);
    setBusyId(bookingId);
    startTransition(async () => {
      const result = await reassignBookingTherapist(bookingId, newTherapistId);
      setBusyId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setReassigning(null);
      router.refresh();
    });
  }

  return (
    <div className="stack g4">
      {error && (
        <div className="tiny" style={{ color: "var(--danger)" }}>
          <Icon name="alert-triangle" size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />
          {error}
        </div>
      )}

      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 170 }}>Terapis</th>
              <th style={{ width: 280 }}>Status Hari Ini</th>
              <th style={{ width: 140 }}>Tanggal Cuti</th>
              <th>Booking Terdampak</th>
            </tr>
          </thead>
          <tbody>
            {therapists.map((t) => {
              const exc = exceptionByEmployee.get(t.id);
              const status: "AVAILABLE" | "OFF" | "LEAVE" = exc?.type ?? "AVAILABLE";
              const affected = exc ? bookings.filter((b) => b.therapistId === t.id) : [];
              const otherTherapists = therapists.filter((o) => o.id !== t.id && !exceptionByEmployee.has(o.id));

              return (
                <tr key={t.id}>
                  <td style={{ width: 170 }}><PersonCell name={t.name} sub={t.code} toneKey={t.avatarTone} photoUrl={t.photoUrl ?? undefined} /></td>
                  <td>
                    <div className="row g1 wrap">
                      {STATUS_OPTIONS.map((o) => (
                        <button
                          key={o.value}
                          type="button"
                          className={`chip ${status === o.value ? "on" : ""}`}
                          disabled={isPending && busyId === t.id}
                          onClick={() => setStatus(t.id, o.value)}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td>
                    {(() => {
                      const leaveDates = leaveDatesByEmployee.get(t.id) ?? [];
                      return leaveDates.length === 0 ? (
                        <span className="tiny dim">—</span>
                      ) : (
                        <span className="tiny">{leaveDates.map((d) => fmtDateShort(d)).join(", ")}</span>
                      );
                    })()}
                  </td>
                  <td>
                    {status === "AVAILABLE" ? (
                      <span className="tiny dim">—</span>
                    ) : affected.length === 0 ? (
                      <span className="tiny dim">Tidak ada booking hari ini.</span>
                    ) : (
                      <div className="stack g2">
                        {affected.map((b) => (
                          <div key={b.id} className="row between g2 wrap" style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                            <div style={{ minWidth: 0 }}>
                              <div className="tiny bold truncate" style={{ color: "var(--text-1)" }}>
                                {b.customerName} · {fmtTime(b.scheduledStart)}–{fmtTime(b.scheduledEnd)}
                              </div>
                              <div className="tiny dim truncate">{b.packageName} · <Badge tone="warning">{b.status}</Badge></div>
                            </div>
                            {reassigning === b.id ? (
                              <div className="row g1 wrap" style={{ alignItems: "center" }}>
                                {otherTherapists.length === 0 ? (
                                  <span className="tiny dim">Tidak ada terapis lain yang tersedia.</span>
                                ) : (
                                  <select
                                    className="select"
                                    style={{ height: 30, fontSize: 12 }}
                                    disabled={isPending && busyId === b.id}
                                    defaultValue=""
                                    onChange={(e) => {
                                      if (e.target.value) doReassign(b.id, e.target.value);
                                    }}
                                  >
                                    <option value="" disabled>Pilih terapis…</option>
                                    {otherTherapists.map((o) => (
                                      <option key={o.id} value={o.id}>{o.name}</option>
                                    ))}
                                  </select>
                                )}
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReassigning(null)} disabled={isPending && busyId === b.id}>
                                  Batal
                                </button>
                              </div>
                            ) : (
                              <div className="row g1">
                                <button type="button" className="btn btn-ghost btn-sm" disabled={isPending && busyId === b.id} onClick={() => setReassigning(b.id)}>
                                  <Icon name="repeat" size={12} /> Ganti Terapis
                                </button>
                                <button type="button" className="btn btn-danger btn-sm" disabled={isPending && busyId === b.id} onClick={() => doCancel(b.id)}>
                                  <Icon name="x" size={12} /> Batalkan
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
