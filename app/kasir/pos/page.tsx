import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, Badge, PersonCell } from "@/components/ui";
import { PRIMARY_OUTLET, sessionsOf, packagesOf, addonsOf } from "@/lib/mock";
import { rp } from "@/lib/format";
import { getCurrentOutlet } from "@/lib/data/outlets";
import { getPayableSessionsForOutlet } from "@/lib/data/pos";
import { getAddonsForOutlet } from "@/lib/data/catalog";
import { getProducts } from "@/lib/data/inventory";
import PosCart, { type PosAddOn, type PosProduct } from "@/components/PosCart";

// ---------------------------------------------------------------------
// /kasir/pos — migrated off mock data 2026-08-23 (user: "transaksi: pos
// cart belum dikerjakan").
//
// This page was the last of the cashier's daily screens still running
// entirely on lib/mock: it showed a fabricated guest, fabricated cart
// totals, and every "add to cart" / "Lanjut ke Pembayaran" button was
// inert markup. /manager/pos was migrated back in babak ketiga, but that
// one only REPORTS on transactions — this is the screen that actually
// takes money, so it was the more consequential of the two to leave
// pretending.
//
// Dual-mode, same rule as every other data page here: a real signed-in
// session gets real payable sessions / real catalog / real stock, and
// the demo "Ganti Role" viewer keeps the presentational mock. The
// fallback trigger is "no auth session", never "zero rows" — a cashier
// who has genuinely billed everyone gets an honest empty queue, not a
// screen full of invented guests to charge.
// ---------------------------------------------------------------------

export default async function PosCartPage() {
  const outlet = await getCurrentOutlet();
  const [payables, addons, products] = await Promise.all([
    getPayableSessionsForOutlet(outlet.id),
    getAddonsForOutlet(outlet.id),
    getProducts(),
  ]);

  // ---- Live branch -------------------------------------------------
  if (payables !== null) {
    const posAddons: PosAddOn[] = addons
      .filter((a) => a.active)
      .map((a) => ({ id: a.id, name: a.name, price: a.price }));

    // Only things that are actually for sale at the counter: priced
    // (sell_price set — "belum diatur ≠ nol", an unpriced product is not
    // a free one) and of a customer-facing category. Treatment
    // consumables and operational supplies are stock this outlet USES,
    // not stock it sells, and listing them here would invite a cashier
    // to ring up the massage oil the therapist is mid-treatment with.
    const posProducts: PosProduct[] = products
      .filter((p) => p.sellPrice !== null && (p.category === "Retail Product" || p.category === "Food & Beverage"))
      .map((p) => ({
        id: p.id,
        name: p.name,
        price: p.sellPrice as number,
        stock: p.stocks[outlet.id] ?? 0,
        tracksStock: p.trackStock,
        group: p.category === "Food & Beverage" ? ("F&B" as const) : ("RETAIL" as const),
      }));

    return (
      <>
        <PageHead
          title="POS Cart"
          desc={`${outlet.name} · Pilih sesi yang sudah selesai, tambahkan add-on atau produk, lalu proses pembayaran.`}
        />
        <PosCart
          payables={payables}
          addons={posAddons}
          products={posProducts}
          taxPct={outlet.taxPct}
          serviceChargePct={outlet.serviceChargePct}
        />
      </>
    );
  }

  // ---- Demo "Ganti Role" branch (unchanged presentation) ------------
  const demoOutlet = PRIMARY_OUTLET;
  const completed = sessionsOf(demoOutlet.id).filter((s) => s.status === "COMPLETED");
  const activeGuest = completed[0];
  const demoPackages = packagesOf(demoOutlet.id).filter((p) => p.status === "ACTIVE").slice(0, 6);
  const demoAddons = addonsOf(demoOutlet.id).filter((a) => a.active);

  const cartItems = activeGuest
    ? [
        {
          name: activeGuest.packageName,
          qty: 1,
          price: demoPackages.find((p) => p.name === activeGuest.packageName)?.listPrice ?? 195_000,
          sub: activeGuest.therapistName,
        },
      ]
    : [{ name: "Traditional Massage 60", qty: 1, price: 150_000, sub: "Melati Puspita" }];
  const subtotal = cartItems.reduce((s, it) => s + it.qty * it.price, 0);
  const serviceCharge = Math.round((subtotal * demoOutlet.serviceChargePct) / 100);
  const tax = Math.round(((subtotal + serviceCharge) * demoOutlet.taxPct) / 100);
  const total = subtotal + serviceCharge + tax;

  return (
    <>
      <PageHead
        title="POS Cart"
        desc={`${demoOutlet.name} · Tampilan contoh — login sebagai kasir untuk memproses pembayaran sungguhan.`}
      />

      <div className="grid grid-3" style={{ alignItems: "start" }}>
        <div className="stack g5" style={{ gridColumn: "span 2" }}>
          <Card>
            <CardHead title="Sesi Siap Dibayar" sub="Data contoh (mode demo)" />
            <div className="card-body stack g2">
              {completed.map((s) => (
                <div key={s.id} className="row between small" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                  <PersonCell name={s.customerName} sub={`${s.packageName} · ${s.roomName}`} toneKey="teal" size={28} />
                  <Badge tone={s.id === activeGuest?.id ? "accent" : "neutral"}>{s.id === activeGuest?.id ? "Dipilih" : "Pilih"}</Badge>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHead title="Add-on Layanan" sub="Data contoh (mode demo)" />
            <div className="card-body">
              <div className="grid grid-3">
                {demoAddons.map((a) => (
                  <button key={a.id} className="btn btn-ghost" disabled style={{ flexDirection: "column", alignItems: "flex-start", height: "auto", padding: "12px 14px", gap: 4 }}>
                    <span className="small strong" style={{ color: "var(--text-1)" }}>{a.name}</span>
                    <span className="small" style={{ color: "var(--accent)" }}>{rp(a.price)}</span>
                  </button>
                ))}
              </div>
            </div>
          </Card>
        </div>

        <Card className="card-pad" style={{ position: "sticky", top: "calc(var(--header-h) + 16px)" }}>
          <div className="row g2" style={{ marginBottom: 14 }}>
            <Icon name="shopping-cart" size={16} style={{ color: "var(--accent)" }} />
            <h3>Keranjang</h3>
          </div>
          <div className="stack g3" style={{ marginBottom: 16 }}>
            {cartItems.map((it, i) => (
              <div key={i} className="row between small">
                <div>
                  <div className="strong" style={{ color: "var(--text-1)" }}>{it.name}</div>
                  <div className="tiny dim">{it.sub} · x{it.qty}</div>
                </div>
                <span className="strong" style={{ color: "var(--text-1)" }}>{rp(it.price * it.qty)}</span>
              </div>
            ))}
          </div>
          <div className="stack g2" style={{ borderTop: "1px solid var(--border)", paddingTop: 12, marginBottom: 16 }}>
            <div className="row between small muted"><span>Subtotal</span><span>{rp(subtotal)}</span></div>
            <div className="row between small muted"><span>Service Charge ({demoOutlet.serviceChargePct}%)</span><span>{rp(serviceCharge)}</span></div>
            <div className="row between small muted"><span>Pajak ({demoOutlet.taxPct}%)</span><span>{rp(tax)}</span></div>
            <div className="row between" style={{ paddingTop: 8, borderTop: "1px solid var(--border)" }}>
              <span className="bold" style={{ color: "var(--text-1)" }}>Total</span>
              <span className="bold" style={{ color: "var(--accent)", fontSize: 17 }}>{rp(total)}</span>
            </div>
          </div>
          <button className="btn btn-primary" style={{ width: "100%" }} disabled>
            <Icon name="credit-card" size={15} /> Lanjut ke Pembayaran
          </button>
          <div className="tiny dim" style={{ marginTop: 8 }}>
            Mode demo — pembayaran sungguhan hanya bisa diproses setelah login sebagai kasir.
          </div>
        </Card>
      </div>
    </>
  );
}
