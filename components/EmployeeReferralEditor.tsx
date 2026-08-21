"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { updateEmployeeReferral } from "@/lib/actions/employees";
import { rp } from "@/lib/format";

// ---------------------------------------------------------------------
// Inline "direkrut oleh" + fee referral editor for one employee row.
//
// Real case: Zahra was recruited by Lusi and pays her Rp5.000 per
// treatment. This is exactly the same click-to-edit pattern as
// EmployeeSalaryEditor — one relationship + one fee rule, changed
// rarely, edited right where the row already lives.
//
// "Belum diatur" (no recruiter set) is a distinct state from "recruiter
// set, fee editing in progress" — the empty state must never read as a
// fee of Rp0. See lib/actions/employees.ts's updateEmployeeReferral().
// ---------------------------------------------------------------------

export type ReferralCandidate = { id: string; name: string };

export function EmployeeReferralEditor({
  employeeId,
  candidates,
  referredByEmployeeId,
  referralFeeType,
  referralFeeValue,
}: {
  employeeId: string;
  candidates: ReferralCandidate[];
  referredByEmployeeId?: string;
  referralFeeType?: "fixed" | "percent";
  referralFeeValue?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [recruiter, setRecruiter] = useState(referredByEmployeeId ?? "");
  const [feeType, setFeeType] = useState<"fixed" | "percent">(referralFeeType ?? "fixed");
  const [feeValue, setFeeValue] = useState(String(referralFeeValue ?? ""));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const recruiterName = referredByEmployeeId
    ? candidates.find((c) => c.id === referredByEmployeeId)?.name ?? "?"
    : null;

  if (!editing) {
    return (
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => {
          setRecruiter(referredByEmployeeId ?? "");
          setFeeType(referralFeeType ?? "fixed");
          setFeeValue(String(referralFeeValue ?? ""));
          setError(null);
          setEditing(true);
        }}
        style={{ justifyContent: "flex-start" }}
      >
        {!recruiterName ? (
          <span className="tiny dim">Belum diatur</span>
        ) : (
          <span className="small">
            {recruiterName}
            {referralFeeType && referralFeeValue !== undefined && (
              <span className="tiny dim">
                {" "}
                — {referralFeeType === "percent" ? `${referralFeeValue}%` : rp(referralFeeValue)}/sesi
              </span>
            )}
          </span>
        )}
        <Icon name="edit" size={12} style={{ marginLeft: 6, opacity: 0.6 }} />
      </button>
    );
  }

  return (
    <div className="stack g2" style={{ padding: "10px 12px", borderRadius: "var(--r-md)", background: "var(--bg-deep)", border: "1px solid var(--border)", minWidth: 240 }}>
      <label className="tiny dim">Direkrut oleh</label>
      <select className="input" value={recruiter} disabled={isPending} onChange={(e) => setRecruiter(e.target.value)}>
        <option value="">— Tidak ada —</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>

      {recruiter && (
        <>
          <label className="tiny dim">Tipe fee referral</label>
          <select className="input" value={feeType} disabled={isPending} onChange={(e) => setFeeType(e.target.value as "fixed" | "percent")}>
            <option value="fixed">Rupiah / sesi</option>
            <option value="percent">Persen dari komisi</option>
          </select>
          <label className="tiny dim">Nilai fee referral</label>
          <input className="input" type="number" min={0} value={feeValue} disabled={isPending}
            onChange={(e) => setFeeValue(e.target.value)} />
        </>
      )}

      {error && (
        <div className="tiny" style={{ color: "var(--danger)" }}>
          <Icon name="alert-triangle" size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />
          {error}
        </div>
      )}

      <div className="row g2">
        <button
          className="btn btn-primary btn-sm"
          disabled={isPending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const r = await updateEmployeeReferral({
                employeeId,
                referredByEmployeeId: recruiter || null,
                referralFeeType: recruiter ? feeType : null,
                referralFeeValue: recruiter ? Number(feeValue) : null,
              });
              if (r.ok) setEditing(false);
              else setError(r.error);
            });
          }}
        >
          <Icon name="check" size={12} /> {isPending ? "Menyimpan…" : "Simpan"}
        </button>
        <button className="btn btn-ghost btn-sm" disabled={isPending} onClick={() => setEditing(false)}>Batal</button>
      </div>
    </div>
  );
}
