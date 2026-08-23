"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import {
  createProduct,
  createPurchaseOrder,
  receivePurchaseOrder,
  createAndCompleteStockTransfer,
  createStockOpnameAndPost,
} from "@/lib/actions/inventory";
import type { Product } from "@/lib/types";

// ---------------------------------------------------------------------
// Write-side UI for /manager/inventory — new 2026-08-23. Same inline
// dropdown-panel pattern as components/StaffEditor.tsx /
// CommissionEditor.tsx (no modal component exists in this codebase yet,
// see app/manager/rooms/page.tsx's header comment on Bug 8).
// ---------------------------------------------------------------------

const CATEGORIES: Product["category"][] = ["Retail Product", "Food & Beverage", "Treatment Consumable", "Operational Supply", "Reusable Asset"];

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
        border: "1px solid var(--border)", minWidth: width, maxWidth: width, maxHeight: "70vh", overflowY: "auto",
        boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
      }}
    >
      {children}
    </div>
  );
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ================================================================ PRODUK

export function NewProductForm({ tenantId }: { tenantId: string }) {
  const [open, setOpen] = useState(false);
  const empty = { sku: "", name: "", category: CATEGORIES[0], uom: "pcs", costPrice: "0", sellPrice: "", minStock: "5" };
  const [v, setV] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => { setV(empty); setError(null); setOpen(true); }}>
        <Icon name="package" size={14} /> Produk Baru
      </button>
    );
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <Panel>
        <div className="small strong" style={{ color: "var(--text-1)" }}>Produk / consumable baru</div>
        <div className="row g2">
          <label className="stack g1" style={{ flex: 1 }}>
            <span className="tiny dim">SKU</span>
            <input className="input" value={v.sku} disabled={isPending} onChange={(e) => setV({ ...v, sku: e.target.value })} />
          </label>
          <label className="stack g1" style={{ flex: 2 }}>
            <span className="tiny dim">Nama</span>
            <input className="input" value={v.name} disabled={isPending} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </label>
        </div>
        <label className="stack g1">
          <span className="tiny dim">Kategori</span>
          <select className="select" value={v.category} disabled={isPending} onChange={(e) => setV({ ...v, category: e.target.value as Product["category"] })}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <div className="row g2">
          <label className="stack g1" style={{ flex: 1 }}>
            <span className="tiny dim">Satuan (uom)</span>
            <input className="input" value={v.uom} disabled={isPending} onChange={(e) => setV({ ...v, uom: e.target.value })} />
          </label>
          <label className="stack g1" style={{ flex: 1 }}>
            <span className="tiny dim">Min. stok</span>
            <input className="input" type="number" value={v.minStock} disabled={isPending} onChange={(e) => setV({ ...v, minStock: e.target.value })} />
          </label>
        </div>
        <div className="row g2">
          <label className="stack g1" style={{ flex: 1 }}>
            <span className="tiny dim">Harga cost</span>
            <input className="input" type="number" value={v.costPrice} disabled={isPending} onChange={(e) => setV({ ...v, costPrice: e.target.value })} />
          </label>
          <label className="stack g1" style={{ flex: 1 }}>
            <span className="tiny dim">Harga jual (kosongkan jika tidak dijual)</span>
            <input className="input" type="number" value={v.sellPrice} disabled={isPending} onChange={(e) => setV({ ...v, sellPrice: e.target.value })} />
          </label>
        </div>
        <ErrorNote error={error} />
        <div className="row g2">
          <button
            className="btn btn-primary btn-sm"
            disabled={isPending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const r = await createProduct({
                  tenantId,
                  sku: v.sku,
                  name: v.name,
                  category: v.category,
                  uom: v.uom,
                  costPrice: Number(v.costPrice) || 0,
                  sellPrice: v.sellPrice === "" ? null : Number(v.sellPrice),
                  minStock: Number(v.minStock) || 0,
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

// =========================================================== ITEM ROWS

type ItemRow = { productId: string; qty: string; unitCost: string };

function ItemRows({
  products,
  rows,
  showCost,
  onChange,
}: {
  products: Product[];
  rows: ItemRow[];
  showCost: boolean;
  onChange: (rows: ItemRow[]) => void;
}) {
  function update(i: number, patch: Partial<ItemRow>) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function remove(i: number) {
    onChange(rows.filter((_, idx) => idx !== i));
  }
  return (
    <div className="stack g2">
      <span className="tiny dim">Item</span>
      {rows.map((row, i) => (
        <div key={i} className="row g1" style={{ alignItems: "center" }}>
          <select
            className="select"
            style={{ flex: 2 }}
            value={row.productId}
            onChange={(e) => update(i, { productId: e.target.value })}
          >
            <option value="">Pilih produk…</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
          </select>
          <input
            className="input" type="number" placeholder="Qty" style={{ width: 64 }}
            value={row.qty} onChange={(e) => update(i, { qty: e.target.value })}
          />
          {showCost && (
            <input
              className="input" type="number" placeholder="Harga" style={{ width: 90 }}
              value={row.unitCost} onChange={(e) => update(i, { unitCost: e.target.value })}
            />
          )}
          <button className="btn btn-ghost btn-icon btn-sm" type="button" onClick={() => remove(i)}>
            <Icon name="x" size={13} />
          </button>
        </div>
      ))}
      <button
        className="btn btn-ghost btn-sm" type="button"
        onClick={() => onChange([...rows, { productId: "", qty: "", unitCost: "" }])}
      >
        <Icon name="plus" size={12} /> Tambah item
      </button>
    </div>
  );
}

// ======================================================= PURCHASE ORDER

export function PurchaseOrderForm({ outletId, products }: { outletId: string; products: Product[] }) {
  const [open, setOpen] = useState(false);
  const [supplier, setSupplier] = useState("");
  const [orderDate, setOrderDate] = useState(todayIso());
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<ItemRow[]>([{ productId: "", qty: "", unitCost: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setSupplier(""); setOrderDate(todayIso()); setExpectedDate(""); setNotes("");
    setRows([{ productId: "", qty: "", unitCost: "" }]); setError(null);
  }

  if (!open) {
    return (
      <button className="btn btn-primary btn-sm" onClick={() => { reset(); setOpen(true); }}>
        <Icon name="plus" size={14} /> Purchase Order
      </button>
    );
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <Panel width={420}>
        <div className="small strong" style={{ color: "var(--text-1)" }}>Purchase Order baru</div>
        <label className="stack g1">
          <span className="tiny dim">Supplier</span>
          <input className="input" value={supplier} disabled={isPending} onChange={(e) => setSupplier(e.target.value)} />
        </label>
        <div className="row g2">
          <label className="stack g1" style={{ flex: 1 }}>
            <span className="tiny dim">Tanggal order</span>
            <input className="input" type="date" value={orderDate} disabled={isPending} onChange={(e) => setOrderDate(e.target.value)} />
          </label>
          <label className="stack g1" style={{ flex: 1 }}>
            <span className="tiny dim">Estimasi datang</span>
            <input className="input" type="date" value={expectedDate} disabled={isPending} onChange={(e) => setExpectedDate(e.target.value)} />
          </label>
        </div>
        <ItemRows products={products} rows={rows} showCost onChange={setRows} />
        <label className="stack g1">
          <span className="tiny dim">Catatan (opsional)</span>
          <input className="input" value={notes} disabled={isPending} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <ErrorNote error={error} />
        <div className="row g2">
          <button
            className="btn btn-primary btn-sm"
            disabled={isPending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const r = await createPurchaseOrder({
                  outletId, supplier, orderDate, expectedDate: expectedDate || null, notes,
                  items: rows.map((row) => ({ productId: row.productId, qty: Number(row.qty) || 0, unitCost: Number(row.unitCost) || 0 })),
                });
                if (r.ok) setOpen(false);
                else setError(r.error);
              });
            }}
          >
            <Icon name="check" size={13} /> {isPending ? "Menyimpan…" : "Buat PO"}
          </button>
          <button className="btn btn-ghost btn-sm" disabled={isPending} onClick={() => setOpen(false)}>Batal</button>
        </div>
      </Panel>
    </div>
  );
}

export function ReceivePOButton({ poId, status }: { poId: string; status: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (status === "RECEIVED" || status === "CANCELLED") return null;
  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
      <button
        className="btn btn-ghost btn-sm" disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const r = await receivePurchaseOrder(poId);
            if (!r.ok) setError(r.error);
          });
        }}
      >
        <Icon name="check-circle" size={12} /> {isPending ? "Memproses…" : "Terima"}
      </button>
      <ErrorNote error={error} />
    </div>
  );
}

// ========================================================= TRANSFER OUTLET

export function StockTransferForm({
  tenantId, currentOutletId, outlets, products,
}: {
  tenantId: string;
  currentOutletId: string;
  outlets: { id: string; name: string }[];
  products: Product[];
}) {
  const [open, setOpen] = useState(false);
  const [fromOutletId, setFromOutletId] = useState(currentOutletId);
  const [toOutletId, setToOutletId] = useState(outlets.find((o) => o.id !== currentOutletId)?.id ?? "");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<ItemRow[]>([{ productId: "", qty: "", unitCost: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setFromOutletId(currentOutletId);
    setToOutletId(outlets.find((o) => o.id !== currentOutletId)?.id ?? "");
    setNote(""); setRows([{ productId: "", qty: "", unitCost: "" }]); setError(null);
  }

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => { reset(); setOpen(true); }}>
        <Icon name="arrow-left-right" size={14} /> Transfer
      </button>
    );
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <Panel width={420}>
        <div className="small strong" style={{ color: "var(--text-1)" }}>Transfer stok antar outlet</div>
        <div className="row g2">
          <label className="stack g1" style={{ flex: 1 }}>
            <span className="tiny dim">Dari</span>
            <select className="select" value={fromOutletId} disabled={isPending} onChange={(e) => setFromOutletId(e.target.value)}>
              {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          <label className="stack g1" style={{ flex: 1 }}>
            <span className="tiny dim">Ke</span>
            <select className="select" value={toOutletId} disabled={isPending} onChange={(e) => setToOutletId(e.target.value)}>
              {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
        </div>
        <ItemRows products={products} rows={rows} showCost={false} onChange={setRows} />
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
                const r = await createAndCompleteStockTransfer({
                  tenantId, fromOutletId, toOutletId, note,
                  items: rows.map((row) => ({ productId: row.productId, qty: Number(row.qty) || 0 })),
                });
                if (r.ok) setOpen(false);
                else setError(r.error);
              });
            }}
          >
            <Icon name="check" size={13} /> {isPending ? "Memproses…" : "Kirim Transfer"}
          </button>
          <button className="btn btn-ghost btn-sm" disabled={isPending} onClick={() => setOpen(false)}>Batal</button>
        </div>
      </Panel>
    </div>
  );
}

// =========================================================== STOCK OPNAME

export function StockOpnameForm({ outletId, products }: { outletId: string; products: Product[] }) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState("");
  const [opnameDate, setOpnameDate] = useState(todayIso());
  const [rows, setRows] = useState<{ productId: string; counted: string }[]>([{ productId: "", counted: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setScope(""); setOpnameDate(todayIso()); setRows([{ productId: "", counted: "" }]); setError(null);
  }
  function update(i: number, patch: Partial<{ productId: string; counted: string }>) {
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => { reset(); setOpen(true); }}>
        <Icon name="clipboard-check" size={14} /> Stock Opname
      </button>
    );
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <Panel width={420}>
        <div className="small strong" style={{ color: "var(--text-1)" }}>Stock opname baru</div>
        <div className="row g2">
          <label className="stack g1" style={{ flex: 2 }}>
            <span className="tiny dim">Cakupan (mis. &quot;Treatment Consumable&quot;)</span>
            <input className="input" value={scope} disabled={isPending} onChange={(e) => setScope(e.target.value)} />
          </label>
          <label className="stack g1" style={{ flex: 1 }}>
            <span className="tiny dim">Tanggal</span>
            <input className="input" type="date" value={opnameDate} disabled={isPending} onChange={(e) => setOpnameDate(e.target.value)} />
          </label>
        </div>

        <div className="stack g2">
          <span className="tiny dim">Hasil hitung fisik</span>
          {rows.map((row, i) => {
            const product = products.find((p) => p.id === row.productId);
            const systemQty = product?.stocks[outletId] ?? 0;
            return (
              <div key={i} className="row g1" style={{ alignItems: "center" }}>
                <select
                  className="select" style={{ flex: 2 }} value={row.productId}
                  onChange={(e) => update(i, { productId: e.target.value })}
                >
                  <option value="">Pilih produk…</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
                </select>
                <span className="tiny dim" style={{ width: 54, textAlign: "center" }}>{systemQty} sistem</span>
                <input
                  className="input" type="number" placeholder="Hasil hitung" style={{ width: 80 }}
                  value={row.counted} onChange={(e) => update(i, { counted: e.target.value })}
                />
                <button className="btn btn-ghost btn-icon btn-sm" type="button" onClick={() => setRows(rows.filter((_, idx) => idx !== i))}>
                  <Icon name="x" size={13} />
                </button>
              </div>
            );
          })}
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => setRows([...rows, { productId: "", counted: "" }])}>
            <Icon name="plus" size={12} /> Tambah item
          </button>
        </div>

        <ErrorNote error={error} />
        <div className="row g2">
          <button
            className="btn btn-primary btn-sm"
            disabled={isPending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const items = rows
                  .filter((r) => r.productId && r.counted !== "")
                  .map((r) => {
                    const product = products.find((p) => p.id === r.productId)!;
                    return {
                      productId: r.productId,
                      systemQty: product.stocks[outletId] ?? 0,
                      countedQty: Number(r.counted) || 0,
                      unitCost: product.costPrice,
                    };
                  });
                const res = await createStockOpnameAndPost({ outletId, scope, opnameDate, items });
                if (res.ok) setOpen(false);
                else setError(res.error);
              });
            }}
          >
            <Icon name="check" size={13} /> {isPending ? "Memproses…" : "Post Opname"}
          </button>
          <button className="btn btn-ghost btn-sm" disabled={isPending} onClick={() => setOpen(false)}>Batal</button>
        </div>
      </Panel>
    </div>
  );
}
