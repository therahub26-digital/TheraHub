"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { updateEmployeeSalary } from "@/lib/actions/employees";
import { rp } from "@/lib/format";

// ---------------------------------------------------------------------
// Inline gaji-pokok / tunjangan editor for one employee row.
//
// Click-to-edit rather than a separate page: this is one number changed
// occasionally, not a multi-field form, and the payroll table right next
// door already shows what depends on it.
// ---------------------------------------------------------------------

export function EmployeeSalaryEditor({
  employeeId,
  baseSalary,
  fixedAllowance,
}: {
  employeeId: string;
  baseSalary: number;
  fixedAllowance: number;
}) {
  const [editing, setEditing] = useState(false);
  const [base, setBase] = useState(String(baseSalary));
  const [allowance, setAllowance] = useState(String(fixedAllowance));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!editing) {
    const unset = baseSalary === 0 && fixedAllowance === 0;
    return (
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => { setBase(String(baseSalary)); setAllowance(String(fixedAllowance)); setEditing(true); }}
        style={{ justifyContent: "flex-start" }}
      >
        {unset ? (
          <span className="tiny dim">Belum diatur</span>
        ) : (
          <span className="small">
            {rp(baseSalary)}
            {fixedAllowance > 0 && <span className="tiny dim"> + {rp(fixedAllowance)} tunjangan</span>}
          </span>
        )}
        <Icon name="edit" size={12} style={{ marginLeft: 6, opacity: 0.6 }} />
      </button>
    );
  }

  return (
    <div className="stack g2" style={{ padding: "10px 12px", borderRadius: "var(--r-md)", background: "var(--bg-deep)", border: "1px solid var(--border)", minWidth: 220 }}>
      <label className="tiny dim">Gaji pokok / bulan</label>
      <input className="input" type="number" min={0} value={base} disabled={isPending}
        onChange={(e) => setBase(e.target.value)} />
      <label className="tiny dim">Tunjangan tetap / bulan</label>
      <input className="input" type="number" min={0} value={allowance} disabled={isPending}
        onChange={(e) => setAllowance(e.target.value)} />
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
              const r = await updateEmployeeSalary({
                employeeId,
                baseSalary: Number(base),
                fixedAllowance: Number(allowance),
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
