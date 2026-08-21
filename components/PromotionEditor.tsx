"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { updatePromotion } from "@/lib/actions/promotions";
import { rp } from "@/lib/format";

// ---------------------------------------------------------------------
// Inline click-to-edit for an existing promo row — same pattern as
// EmployeeSalaryEditor/EmployeeReferralEditor. Built specifically so the
// referral voucher's Rp30.000 isn't hardcoded forever (user, 2026-08-21:
// "bisa diseting rupiahnya kan? gak fix 30rb?").
//
// Edits the promo IN PLACE — creating a new promo type/code from scratch
// is a bigger form, deliberately out of scope here (see this file's
// sibling, lib/actions/promotions.ts, for the full reasoning).
// ---------------------------------------------------------------------

const STATUSES = ["ACTIVE", "SCHEDULED", "EXPIRED"] as const;

export function PromotionEditor({
  promotionId,
  value,
  discountAmount,
  maxUsage,
  validTo,
  status,
}: {
  promotionId: string;
  value: string;
  discountAmount?: number;
  maxUsage: number | null;
  validTo: string;
  status: "ACTIVE" | "SCHEDULED" | "EXPIRED";
}) {
  const [editing, setEditing] = useState(false);
  const [valueText, setValueText] = useState(value);
  const [discount, setDiscount] = useState(discountAmount !== undefined ? String(discountAmount) : "");
  const [quota, setQuota] = useState(maxUsage !== null ? String(maxUsage) : "");
  const [validToDate, setValidToDate] = useState(validTo);
  const [statusValue, setStatusValue] = useState<typeof STATUSES[number]>(status);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!editing) {
    return (
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => {
          setValueText(value);
          setDiscount(discountAmount !== undefined ? String(discountAmount) : "");
          setQuota(maxUsage !== null ? String(maxUsage) : "");
          setValidToDate(validTo);
          setStatusValue(status);
          setError(null);
          setEditing(true);
        }}
        style={{ justifyContent: "flex-start", textAlign: "left" }}
      >
        <span className="muted small">{value}</span>
        <Icon name="edit" size={12} style={{ marginLeft: 6, opacity: 0.6, flexShrink: 0 }} />
      </button>
    );
  }

  return (
    <div className="stack g2" style={{ padding: "10px 12px", borderRadius: "var(--r-md)", background: "var(--bg-deep)", border: "1px solid var(--border)", minWidth: 260 }}>
      <label className="tiny dim">Keterangan (tampilan)</label>
      <input className="input" value={valueText} disabled={isPending} onChange={(e) => setValueText(e.target.value)} />

      <label className="tiny dim">Nominal diskon (Rupiah — kosongkan kalau belum ada nominal terprogram)</label>
      <input
        className="input"
        type="number"
        min={0}
        placeholder="Belum diatur"
        value={discount}
        disabled={isPending}
        onChange={(e) => setDiscount(e.target.value)}
      />
      {discount && Number.isFinite(Number(discount)) && (
        <div className="tiny dim">Dipotong {rp(Number(discount))} saat kode dipakai.</div>
      )}

      <label className="tiny dim">Kuota (kosongkan untuk tanpa batas)</label>
      <input className="input" type="number" min={0} placeholder="Tanpa batas" value={quota} disabled={isPending} onChange={(e) => setQuota(e.target.value)} />

      <label className="tiny dim">Berlaku sampai</label>
      <input className="input" type="date" value={validToDate} disabled={isPending} onChange={(e) => setValidToDate(e.target.value)} />

      <label className="tiny dim">Status</label>
      <select className="select" value={statusValue} disabled={isPending} onChange={(e) => setStatusValue(e.target.value as typeof STATUSES[number])}>
        {STATUSES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

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
              const r = await updatePromotion({
                promotionId,
                value: valueText,
                discountAmount: discount.trim() === "" ? null : Number(discount),
                maxUsage: quota.trim() === "" ? null : Number(quota),
                validTo: validToDate,
                status: statusValue,
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
