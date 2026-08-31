"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { Card, CardHead, Badge, PersonCell } from "@/components/ui";
import { rp } from "@/lib/format";
import { payForSession, type PaymentMethod, type PosExtraItem } from "@/lib/actions/transactions";
import type { PayableSession } from "@/lib/types";

// ---------------------------------------------------------------------
// The real POS Cart (2026-08-23) — replaces the presentational mock that
// stood here since the UI-demo days, where every "add to cart" button
// was a <button> with no onClick and the totals were arithmetic on
// hard-coded numbers.
//
// Division of labour, same as every other client component in this app:
// this file owns selection, quantities and pending state. It owns NO
// pricing authority. The totals rendered here are a preview computed
// from server-supplied prices; the amount actually charged is recomputed
// from the database inside payForSession(), which also re-checks that
// each item is still sellable and still in stock. A tampered cart can
// therefore ask to buy the wrong things, but never at the wrong price —
// see PosExtraItem in lib/actions/transactions.ts.
// ---------------------------------------------------------------------

export type PosAddOn = { id: string; name: string; price: number };
export type PosProduct = {
  id: string;
  name: string;
  price: number;
  stock: number;
  tracksStock: boolean;
  // "F&B" = makanan ringan & minuman, "RETAIL" = produk retail lain.
  // Dipisah supaya kasir tidak harus menyisir satu grid campuran untuk
  // menemukan sebotol air — F&B adalah yang paling sering ditambahkan
  // dan paling sering terlewat ditagih.
  group: "F&B" | "RETAIL";
};

type CartLine = { kind: "ADD_ON" | "PRODUCT"; id: string; name: string; price: number; qty: number; maxQty: number | null };

const PAYMENT_METHODS: PaymentMethod[] = ["Cash", "QRIS", "Debit Card", "Credit Card", "Transfer", "E-Wallet"];

export default function PosCart({
  payables,
  addons,
  products,
  taxPct,
  serviceChargePct,
}: {
  payables: PayableSession[];
  addons: PosAddOn[];
  products: PosProduct[];
  taxPct: number;
  serviceChargePct: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(payables[0]?.sessionId ?? null);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [method, setMethod] = useState<PaymentMethod>("Cash");
  const [promoCode, setPromoCode] = useState("");
  const [showPromo, setShowPromo] = useState(false);

  const selected = payables.find((p) => p.sessionId === selectedId) ?? null;

  const { extrasTotal, subtotal, serviceCharge, tax, total } = useMemo(() => {
    const base = selected?.baseTotal ?? 0;
    const extras = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
    const sub = base + extras;
    const sc = Math.round((sub * serviceChargePct) / 100);
    const tx = Math.round(((sub + sc) * taxPct) / 100);
    return { extrasTotal: extras, subtotal: sub, serviceCharge: sc, tax: tx, total: sub + sc + tx };
  }, [selected, lines, serviceChargePct, taxPct]);

  function addLine(kind: "ADD_ON" | "PRODUCT", id: string, name: string, price: number, maxQty: number | null) {
    setError(null);
    setLines((prev) => {
      const existing = prev.find((l) => l.kind === kind && l.id === id);
      if (existing) {
        if (existing.maxQty !== null && existing.qty >= existing.maxQty) return prev;
        return prev.map((l) => (l === existing ? { ...l, qty: l.qty + 1 } : l));
      }
      return [...prev, { kind, id, name, price, qty: 1, maxQty }];
    });
  }

  // Addressed by kind+id, never by array index: the index belongs to the
  // render that drew the button, but the update runs against the latest
  // `prev`, and dropping a line at qty 0 reshuffles every index after it.
  // Two quick clicks could otherwise decrement the wrong product.
  function changeQty(kind: "ADD_ON" | "PRODUCT", id: string, delta: number) {
    setLines((prev) =>
      prev
        .map((l) => {
          if (l.kind !== kind || l.id !== id) return l;
          const next = l.qty + delta;
          if (l.maxQty !== null && next > l.maxQty) return l;
          return { ...l, qty: next };
        })
        .filter((l) => l.qty > 0)
    );
  }

  function checkout() {
    if (!selected) return;
    setError(null);
    setDone(null);
    setWarning(null);
    const extras: PosExtraItem[] = lines.map((l) => ({ kind: l.kind, id: l.id, qty: l.qty }));
    startTransition(async () => {
      const result = await payForSession(selected.sessionId, method, promoCode.trim() || undefined, extras);
      if (result.ok) {
        // `ok: true` boleh datang dengan peringatan: uang sudah berpindah,
        // tapi komisi/stok gagal ditulis. Keranjang tetap dibersihkan —
        // membiarkannya terisi mengundang kasir menagih ulang.
        setDone(`Pembayaran ${selected.customerName} berhasil diproses.`);
        setWarning(result.warning ?? null);
        setLines([]);
        setPromoCode("");
        setShowPromo(false);
        setSelectedId(null);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="grid grid-3" style={{ alignItems: "start" }}>
      <div className="stack g5" style={{ gridColumn: "span 2" }}>
        <Card>
          <CardHead
            title="Sesi Siap Dibayar"
            sub={payables.length > 0 ? `${payables.length} sesi menunggu pembayaran` : "Pilih tamu untuk memulai transaksi"}
          />
          <div className="card-body stack g2">
            {payables.length === 0 && (
              <div className="small dim">Belum ada sesi selesai yang menunggu pembayaran hari ini.</div>
            )}
            {payables.map((s) => {
              const active = s.sessionId === selectedId;
              return (
                <button
                  key={s.sessionId}
                  onClick={() => {
                    setSelectedId(s.sessionId);
                    setError(null);
                    setDone(null);
                    setWarning(null);
                  }}
                  disabled={isPending}
                  className="row between small"
                  style={{
                    width: "100%",
                    textAlign: "left",
                    background: active ? "var(--accent-soft, rgba(20,160,140,0.12))" : "transparent",
                    border: active ? "1px solid var(--accent)" : "1px solid transparent",
                    borderRadius: 10,
                    padding: "10px 12px",
                    cursor: isPending ? "default" : "pointer",
                  }}
                >
                  <PersonCell name={s.customerName} sub={`${s.packageName} · ${s.roomName} · ${s.therapistName}`} toneKey="teal" size={28} />
                  <span className="row g2">
                    <span className="small bold" style={{ color: "var(--text-1)" }}>{rp(s.baseTotal)}</span>
                    <Badge tone={active ? "accent" : "neutral"}>{active ? "Dipilih" : "Pilih"}</Badge>
                  </span>
                </button>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardHead title="Add-on Layanan" sub={addons.length > 0 ? "Klik untuk menambahkan ke keranjang" : undefined} />
          <div className="card-body">
            {addons.length === 0 && (
              <div className="small dim">Belum ada add-on aktif di outlet ini. Tambahkan lewat menu Katalog.</div>
            )}
            <div className="grid grid-3">
              {addons.map((a) => (
                <button
                  key={a.id}
                  className="btn btn-ghost"
                  disabled={isPending || !selected}
                  onClick={() => addLine("ADD_ON", a.id, a.name, a.price, null)}
                  style={{ flexDirection: "column", alignItems: "flex-start", height: "auto", padding: "12px 14px", gap: 4 }}
                >
                  <span className="small strong" style={{ color: "var(--text-1)" }}>{a.name}</span>
                  <span className="small" style={{ color: "var(--accent)" }}>{rp(a.price)}</span>
                </button>
              ))}
            </div>
          </div>
        </Card>

        <ProductPickerCard
          title="Makanan & Minuman"
          emptyNote="Belum ada makanan/minuman dengan harga jual di outlet ini. Tambahkan lewat menu Inventori."
          items={products.filter((p) => p.group === "F&B")}
          disabled={isPending || !selected}
          onPick={(p) => addLine("PRODUCT", p.id, p.name, p.price, p.tracksStock ? p.stock : null)}
        />

        <ProductPickerCard
          title="Produk Retail"
          emptyNote="Belum ada produk retail dengan harga jual di outlet ini."
          items={products.filter((p) => p.group === "RETAIL")}
          disabled={isPending || !selected}
          onPick={(p) => addLine("PRODUCT", p.id, p.name, p.price, p.tracksStock ? p.stock : null)}
        />
      </div>

      <Card className="card-pad" style={{ position: "sticky", top: "calc(var(--header-h) + 16px)" }}>
        <div className="row g2" style={{ marginBottom: 14 }}>
          <Icon name="shopping-cart" size={16} style={{ color: "var(--accent)" }} />
          <h3>Keranjang</h3>
        </div>

        {!selected && (
          <div className="small dim" style={{ marginBottom: 14 }}>
            Pilih sesi yang akan dibayar dulu di daftar sebelah kiri.
          </div>
        )}

        {selected && (
          <>
            <div className="stack g3" style={{ marginBottom: 16 }}>
              <div className="row between small">
                <div>
                  <div className="strong" style={{ color: "var(--text-1)" }}>{selected.packageName}</div>
                  <div className="tiny dim">{selected.customerName} · {selected.therapistName}</div>
                </div>
                <span className="strong" style={{ color: "var(--text-1)" }}>{rp(selected.packagePrice)}</span>
              </div>

              {selected.extensions.map((e, i) => (
                <div key={`ext-${i}`} className="row between small">
                  <div>
                    <div className="strong" style={{ color: "var(--text-1)" }}>{e.name}</div>
                    <div className="tiny dim">Extension disetujui</div>
                  </div>
                  <span className="strong" style={{ color: "var(--text-1)" }}>{rp(e.price)}</span>
                </div>
              ))}

              {lines.map((l) => (
                <div key={`${l.kind}-${l.id}`} className="row between small">
                  <div style={{ minWidth: 0 }}>
                    <div className="strong truncate" style={{ color: "var(--text-1)" }}>{l.name}</div>
                    <div className="row g1" style={{ marginTop: 3 }}>
                      <button className="btn btn-ghost btn-sm" disabled={isPending} onClick={() => changeQty(l.kind, l.id, -1)} style={{ padding: "1px 7px", height: 22 }}>−</button>
                      <span className="tiny" style={{ minWidth: 18, textAlign: "center" }}>{l.qty}</span>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={isPending || (l.maxQty !== null && l.qty >= l.maxQty)}
                        onClick={() => changeQty(l.kind, l.id, 1)}
                        style={{ padding: "1px 7px", height: 22 }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <span className="strong" style={{ color: "var(--text-1)" }}>{rp(l.price * l.qty)}</span>
                </div>
              ))}
            </div>

            <div className="stack g2" style={{ borderTop: "1px solid var(--border)", paddingTop: 12, marginBottom: 16 }}>
              {extrasTotal > 0 && (
                <div className="row between small muted"><span>Tambahan keranjang</span><span>{rp(extrasTotal)}</span></div>
              )}
              <div className="row between small muted"><span>Subtotal</span><span>{rp(subtotal)}</span></div>
              <div className="row between small muted"><span>Service Charge ({serviceChargePct}%)</span><span>{rp(serviceCharge)}</span></div>
              <div className="row between small muted"><span>Pajak ({taxPct}%)</span><span>{rp(tax)}</span></div>
              <div className="row between" style={{ paddingTop: 8, borderTop: "1px solid var(--border)" }}>
                <span className="bold" style={{ color: "var(--text-1)" }}>Total</span>
                <span className="bold" style={{ color: "var(--accent)", fontSize: 17 }}>{rp(total)}</span>
              </div>
              {/* Promo discount is deliberately NOT previewed here. Its
                  validity (active, in period, quota left, new-customer
                  only) is decided server-side at the moment of payment,
                  and showing a discount the server might refuse would be
                  quoting the guest a price this screen cannot honour. */}
              {promoCode.trim() && (
                <div className="tiny dim">Diskon kode “{promoCode.trim()}” dihitung & divalidasi saat pembayaran diproses.</div>
              )}
            </div>

            <div className="stack g2">
              <select
                className="select"
                value={method}
                disabled={isPending}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                style={{ width: "100%" }}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>

              {!showPromo && (
                <button className="btn btn-ghost btn-sm" disabled={isPending} onClick={() => setShowPromo(true)}>
                  <Icon name="ticket" size={13} /> Terapkan Kode Promo
                </button>
              )}
              {showPromo && (
                <input
                  className="input"
                  placeholder="Kode promo (opsional)"
                  value={promoCode}
                  disabled={isPending}
                  onChange={(e) => setPromoCode(e.target.value)}
                />
              )}

              <button className="btn btn-primary" style={{ width: "100%" }} disabled={isPending} onClick={checkout}>
                <Icon name="credit-card" size={15} /> {isPending ? "Memproses…" : `Bayar ${rp(total)}`}
              </button>
            </div>
          </>
        )}

        {error && (
          <div className="tiny" style={{ color: "var(--danger)", marginTop: 10 }}>
            <Icon name="alert-triangle" size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />
            {error}
          </div>
        )}
        {warning && (
          <div className="tiny" style={{ color: "var(--warning)", marginTop: 10 }}>
            <Icon name="info" size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />
            {warning}
          </div>
        )}
        {done && (
          <div className="tiny" style={{ color: "var(--success, #2e9e5b)", marginTop: 10 }}>
            <Icon name="check-circle" size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />
            {done}
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------
// One grid of tappable products. Extracted when the single mixed
// "Produk Retail & F&B" grid was split in two (2026-08-23, user:
// "buatkan penjualan produk makanan ringan dan minuman") so the two
// sections cannot drift apart in behaviour — a sold-out item must look
// and act sold-out identically whether it is a bottle of water or a
// retail product.
// ---------------------------------------------------------------------
function ProductPickerCard({
  title,
  emptyNote,
  items,
  disabled,
  onPick,
}: {
  title: string;
  emptyNote: string;
  items: PosProduct[];
  disabled: boolean;
  onPick: (p: PosProduct) => void;
}) {
  return (
    <Card>
      <CardHead title={title} sub={items.length > 0 ? "Stok berkurang otomatis saat pembayaran" : undefined} />
      <div className="card-body">
        {items.length === 0 && <div className="small dim">{emptyNote}</div>}
        <div className="grid grid-3">
          {items.map((p) => {
            const soldOut = p.tracksStock && p.stock <= 0;
            return (
              <button
                key={p.id}
                className="btn btn-ghost"
                disabled={disabled || soldOut}
                onClick={() => onPick(p)}
                style={{ flexDirection: "column", alignItems: "flex-start", height: "auto", padding: "12px 14px", gap: 4, opacity: soldOut ? 0.5 : 1 }}
              >
                <span className="small strong" style={{ color: "var(--text-1)" }}>{p.name}</span>
                <span className="tiny dim">{p.tracksStock ? (soldOut ? "Stok habis" : `Stok ${p.stock}`) : "Tanpa stok"}</span>
                <span className="small" style={{ color: "var(--accent)" }}>{rp(p.price)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
