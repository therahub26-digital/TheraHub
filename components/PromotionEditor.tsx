"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { updatePromotion, createPromotion } from "@/lib/actions/promotions";
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

// ---------------------------------------------------------------------
// "Promo Baru" — added 2026-08-22, user feedback: "paket promo buat
// template: membership, happy hour, dll (bisa diaktifkan bisa tidak)".
// `promotions.type` already supports "Membership" (see lib/types.ts) and
// `status` already has ACTIVE/SCHEDULED/EXPIRED — this form is what was
// missing to actually create a row using those, not a schema change.
// "Happy Hour" as a literal time-of-day rule is NOT built here — see
// lib/actions/promotions.ts's createPromotion() header for why; this
// form can still create a promo of any existing type (including a
// manually-scheduled "happy hour"-style discount via validFrom/validTo),
// just not one with real per-hour logic.
// ---------------------------------------------------------------------

const PROMO_TYPES = ["Promo", "Voucher", "Prepaid Package", "Membership", "Loyalty"] as const;

export function NewPromotionForm({ outletId, today }: { outletId: string; today: string }) {
  const [open, setOpen] = useState(false);
  const empty = {
    name: "",
    type: "Promo" as (typeof PROMO_TYPES)[number],
    code: "",
    value: "",
    discount: "",
    newCustomersOnly: false,
    validFrom: today,
    validTo: today,
    maxUsage: "",
    status: "ACTIVE" as "ACTIVE" | "SCHEDULED" | "EXPIRED",
  };
  const [f, setF] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button className="btn btn-primary btn-sm" onClick={() => { setF(empty); setError(null); setOpen(true); }}>
        <Icon name="plus" size={14} /> Promo Baru
      </button>
    );
  }

  return (
    <div className="stack g2" style={{ padding: "14px 16px", borderRadius: "var(--r-md)", background: "var(--bg-deep)", border: "1px solid var(--border)", marginBottom: 16, maxWidth: 420 }}>
      <label className="stack g1">
        <span className="tiny dim">Nama promo</span>
        <input className="input" value={f.name} disabled={isPending} placeholder="mis. Membership Gold" onChange={(e) => setF({ ...f, name: e.target.value })} />
      </label>

      <label className="stack g1">
        <span className="tiny dim">Tipe</span>
        <select className="select" value={f.type} disabled={isPending} onChange={(e) => setF({ ...f, type: e.target.value as (typeof PROMO_TYPES)[number] })}>
          {PROMO_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </label>

      <label className="stack g1">
        <span className="tiny dim">Kode (kosongkan kalau tidak pakai kode)</span>
        <input className="input" value={f.code} disabled={isPending} placeholder="mis. GOLD2026" onChange={(e) => setF({ ...f, code: e.target.value })} />
      </label>

      <label className="stack g1">
        <span className="tiny dim">Keterangan (tampilan ke customer)</span>
        <input className="input" value={f.value} disabled={isPending} placeholder="mis. Diskon 20% semua layanan" onChange={(e) => setF({ ...f, value: e.target.value })} />
      </label>

      <label className="stack g1">
        <span className="tiny dim">Nominal diskon (Rupiah — kosongkan kalau belum ada nominal terprogram)</span>
        <input className="input" type="number" min={0} placeholder="Belum diatur" value={f.discount} disabled={isPending} onChange={(e) => setF({ ...f, discount: e.target.value })} />
      </label>

      <div className="row g3">
        <label className="stack g1" style={{ flex: 1 }}>
          <span className="tiny dim">Berlaku dari</span>
          <input className="input" type="date" value={f.validFrom} disabled={isPending} onChange={(e) => setF({ ...f, validFrom: e.target.value })} />
        </label>
        <label className="stack g1" style={{ flex: 1 }}>
          <span className="tiny dim">Berlaku sampai</span>
          <input className="input" type="date" value={f.validTo} disabled={isPending} onChange={(e) => setF({ ...f, validTo: e.target.value })} />
        </label>
      </div>

      <label className="stack g1">
        <span className="tiny dim">Kuota (kosongkan untuk tanpa batas)</span>
        <input className="input" type="number" min={0} placeholder="Tanpa batas" value={f.maxUsage} disabled={isPending} onChange={(e) => setF({ ...f, maxUsage: e.target.value })} />
      </label>

      <label className="row g2" style={{ alignItems: "center" }}>
        <input type="checkbox" checked={f.newCustomersOnly} disabled={isPending} onChange={(e) => setF({ ...f, newCustomersOnly: e.target.checked })} />
        <span className="small">Khusus customer baru (belum pernah transaksi PAID)</span>
      </label>

      <label className="stack g1">
        <span className="tiny dim">Status</span>
        <select className="select" value={f.status} disabled={isPending} onChange={(e) => setF({ ...f, status: e.target.value as typeof f.status })}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </label>

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
              const r = await createPromotion({
                outletId,
                name: f.name,
                type: f.type,
                code: f.code.trim() === "" ? null : f.code,
                value: f.value,
                discountAmount: f.discount.trim() === "" ? null : Number(f.discount),
                newCustomersOnly: f.newCustomersOnly,
                validFrom: f.validFrom,
                validTo: f.validTo,
                maxUsage: f.maxUsage.trim() === "" ? null : Number(f.maxUsage),
                status: f.status,
              });
              if (r.ok) { setF(empty); setOpen(false); }
              else setError(r.error);
            });
          }}
        >
          <Icon name="check" size={13} /> {isPending ? "Menyimpan…" : "Simpan Promo"}
        </button>
        <button className="btn btn-ghost btn-sm" disabled={isPending} onClick={() => setOpen(false)}>
          Batal
        </button>
      </div>
    </div>
  );
}
