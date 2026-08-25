"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { createExpense, approveExpense, rejectExpense, topUpPettyCash, type PaymentMethod } from "@/lib/actions/expenses";
import { EXPENSE_CATEGORIES } from "@/lib/constants/expenseCategories";
import { todayIsoDate } from "@/lib/wallclock";

// ---------------------------------------------------------------------
// Write-side UI for /manager/expenses — new 2026-08-23. Same inline
// dropdown-panel pattern as components/InventoryEditor.tsx.
// ---------------------------------------------------------------------

const PAYMENT_METHODS: PaymentMethod[] = ["Cash", "QRIS", "Debit Card", "Credit Card", "Transfer", "E-Wallet", "Split", "Midtrans"];

function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="tiny" style={{ color: "var(--danger)", marginTop: 6 }}>
      <Icon name="alert-triangle" size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />
      {error}
    </div>
  );
}

function Panel({ children, width = 340 }: { children: React.ReactNode; width?: number }) {
  return (
    <div
      className="stack g2"
      style={{
        position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 30,
        padding: "14px 16px", borderRadius: "var(--r-md)", background: "var(--bg-panel, var(--bg-deep))",
        border: "1px solid var(--border)", minWidth: width, maxWidth: width,
        boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
      }}
    >
      {children}
    </div>
  );
}

export function NewExpenseForm({ outletId }: { outletId: string }) {
  const [open, setOpen] = useState(false);
  const empty = {
    date: todayIsoDate(), category: EXPENSE_CATEGORIES[0].key, vendor: "", amount: "", tax: "0",
    paymentMethod: "Cash" as PaymentMethod, description: "",
  };
  const [v, setV] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button className="btn btn-primary btn-sm" onClick={() => { setV(empty); setError(null); setOpen(true); }}>
        <Icon name="plus" size={14} /> Catat Pengeluaran
      </button>
    );
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <Panel width={360}>
        <div className="small strong" style={{ color: "var(--text-1)" }}>Pengeluaran baru</div>
        <div className="row g2">
          <label className="stack g1" style={{ flex: 1 }}>
            <span className="tiny dim">Tanggal</span>
            <input className="input" type="date" value={v.date} disabled={isPending} onChange={(e) => setV({ ...v, date: e.target.value })} />
          </label>
          <label className="stack g1" style={{ flex: 1 }}>
            <span className="tiny dim">Kategori</span>
            <select className="select" value={v.category} disabled={isPending} onChange={(e) => setV({ ...v, category: e.target.value })}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.key}</option>)}
            </select>
          </label>
        </div>
        <label className="stack g1">
          <span className="tiny dim">Vendor</span>
          <input className="input" value={v.vendor} disabled={isPending} onChange={(e) => setV({ ...v, vendor: e.target.value })} />
        </label>
        <div className="row g2">
          <label className="stack g1" style={{ flex: 1 }}>
            <span className="tiny dim">Jumlah</span>
            <input className="input" type="number" value={v.amount} disabled={isPending} onChange={(e) => setV({ ...v, amount: e.target.value })} />
          </label>
          <label className="stack g1" style={{ flex: 1 }}>
            <span className="tiny dim">Pajak</span>
            <input className="input" type="number" value={v.tax} disabled={isPending} onChange={(e) => setV({ ...v, tax: e.target.value })} />
          </label>
        </div>
        <label className="stack g1">
          <span className="tiny dim">Metode pembayaran</span>
          <select className="select" value={v.paymentMethod} disabled={isPending} onChange={(e) => setV({ ...v, paymentMethod: e.target.value as PaymentMethod })}>
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label className="stack g1">
          <span className="tiny dim">Deskripsi</span>
          <input className="input" value={v.description} disabled={isPending} onChange={(e) => setV({ ...v, description: e.target.value })} />
        </label>
        <ErrorNote error={error} />
        <div className="row g2">
          <button
            className="btn btn-primary btn-sm"
            disabled={isPending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const r = await createExpense({
                  outletId, date: v.date, category: v.category, vendor: v.vendor,
                  amount: Number(v.amount) || 0, tax: Number(v.tax) || 0,
                  paymentMethod: v.paymentMethod, description: v.description,
                });
                if (r.ok) setOpen(false);
                else setError(r.error);
              });
            }}
          >
            <Icon name="check" size={13} /> {isPending ? "Menyimpan…" : "Simpan"}
          </button>
          <button className="btn btn-ghost btn-sm" disabled={isPending} onClick={() => setOpen(false)}>Batal</button>
        </div>
      </Panel>
    </div>
  );
}

export function ApproveRejectButtons({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="stack g1" style={{ alignItems: "flex-end" }}>
      <div className="row g1">
        <button
          className="btn btn-ghost btn-sm" disabled={isPending}
          onClick={() => { setError(null); startTransition(async () => { const r = await approveExpense(id); if (!r.ok) setError(r.error); }); }}
        >
          <Icon name="check" size={12} /> Setujui
        </button>
        <button
          className="btn btn-ghost btn-sm" disabled={isPending} style={{ color: "var(--danger)" }}
          onClick={() => { setError(null); startTransition(async () => { const r = await rejectExpense(id); if (!r.ok) setError(r.error); }); }}
        >
          <Icon name="x" size={12} /> Tolak
        </button>
      </div>
      <ErrorNote error={error} />
    </div>
  );
}

export function PettyCashTopUpForm({ outletId }: { outletId: string }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => { setAmount(""); setNote(""); setError(null); setOpen(true); }}>
        <Icon name="plus" size={12} /> Top-up
      </button>
    );
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <Panel width={280}>
        <div className="small strong" style={{ color: "var(--text-1)" }}>Top-up kas kecil</div>
        <label className="stack g1">
          <span className="tiny dim">Jumlah</span>
          <input className="input" type="number" value={amount} disabled={isPending} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="stack g1">
          <span className="tiny dim">Catatan (opsional)</span>
          <input className="input" value={note} disabled={isPending} onChange={(e) => setNote(e.target.value)} />
        </label>
        <ErrorNote error={error} />
        <div className="row g2">
          <button
            className="btn btn-primary btn-sm"
            disabled={isPending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const r = await topUpPettyCash({ outletId, amount: Number(amount) || 0, note });
                if (r.ok) setOpen(false);
                else setError(r.error);
              });
            }}
          >
            <Icon name="check" size={13} /> {isPending ? "Menyimpan…" : "Simpan"}
          </button>
          <button className="btn btn-ghost btn-sm" disabled={isPending} onClick={() => setOpen(false)}>Batal</button>
        </div>
      </Panel>
    </div>
  );
}
