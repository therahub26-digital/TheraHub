import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, Badge, PersonCell } from "@/components/ui";
import { PRIMARY_OUTLET, sessionsOf, packagesOf, sellableProducts, addonsOf } from "@/lib/mock";
import { rp } from "@/lib/format";

export default function PosCartPage() {
  const outlet = PRIMARY_OUTLET;
  const completed = sessionsOf(outlet.id).filter((s) => s.status === "COMPLETED");
  const activeGuest = completed[0];
  const packages = packagesOf(outlet.id).filter((p) => p.status === "ACTIVE").slice(0, 6);
  const addons = addonsOf(outlet.id).filter((a) => a.active);
  const retail = sellableProducts.slice(0, 6);

  const cartItems = activeGuest
    ? [{ name: activeGuest.packageName, qty: 1, price: packages.find((p) => p.name === activeGuest.packageName)?.listPrice ?? 195_000, sub: activeGuest.therapistName }]
    : [{ name: "Traditional Massage 60", qty: 1, price: 150_000, sub: "Melati Puspita" }];
  const subtotal = cartItems.reduce((s, it) => s + it.qty * it.price, 0);
  const discount = 0;
  const net = subtotal - discount;
  const serviceCharge = Math.round((net * outlet.serviceChargePct) / 100);
  const tax = Math.round(((net + serviceCharge) * outlet.taxPct) / 100);
  const total = net + serviceCharge + tax;

  return (
    <>
      <PageHead
        title="POS Cart"
        desc={`${outlet.name} · Tambahkan layanan, extension, add-on, atau produk ke keranjang sebelum pembayaran.`}
      />

      <div className="grid grid-3" style={{ alignItems: "start" }}>
        <div className="stack g5" style={{ gridColumn: "span 2" }}>
          <Card>
            <CardHead title="Sesi Siap Dibayar" sub="Pilih tamu untuk memulai transaksi" />
            <div className="card-body stack g2">
              {completed.length === 0 && <div className="small dim">Belum ada sesi selesai hari ini.</div>}
              {completed.map((s) => (
                <div key={s.id} className="row between small" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                  <PersonCell name={s.customerName} sub={`${s.packageName} · ${s.roomName}`} toneKey="teal" size={28} />
                  <Badge tone={s.id === activeGuest?.id ? "accent" : "neutral"}>{s.id === activeGuest?.id ? "Dipilih" : "Pilih"}</Badge>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHead title="Paket Layanan" sub="Tambahkan langsung ke keranjang" />
            <div className="card-body">
              <div className="grid grid-3">
                {packages.map((p) => (
                  <button key={p.id} className="btn btn-ghost" style={{ flexDirection: "column", alignItems: "flex-start", height: "auto", padding: "12px 14px", gap: 4 }}>
                    <span className="small strong" style={{ color: "var(--text-1)" }}>{p.name}</span>
                    <span className="tiny dim">{p.durationMin} menit</span>
                    <span className="small" style={{ color: "var(--accent)" }}>{rp(p.listPrice)}</span>
                  </button>
                ))}
              </div>
            </div>
          </Card>

          <Card>
            <CardHead title="Add-on & Produk" sub="Item tambahan opsional" />
            <div className="card-body">
              <div className="grid grid-3">
                {addons.map((a) => (
                  <button key={a.id} className="btn btn-ghost" style={{ flexDirection: "column", alignItems: "flex-start", height: "auto", padding: "12px 14px", gap: 4 }}>
                    <span className="small strong" style={{ color: "var(--text-1)" }}>{a.name}</span>
                    <span className="small" style={{ color: "var(--accent)" }}>{rp(a.price)}</span>
                  </button>
                ))}
                {retail.map((p) => (
                  <button key={p.id} className="btn btn-ghost" style={{ flexDirection: "column", alignItems: "flex-start", height: "auto", padding: "12px 14px", gap: 4 }}>
                    <span className="small strong" style={{ color: "var(--text-1)" }}>{p.name}</span>
                    <span className="small" style={{ color: "var(--accent)" }}>{rp(p.sellPrice ?? 0)}</span>
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
            <div className="row between small muted"><span>Diskon</span><span>{rp(discount)}</span></div>
            <div className="row between small muted"><span>Service Charge ({outlet.serviceChargePct}%)</span><span>{rp(serviceCharge)}</span></div>
            <div className="row between small muted"><span>Pajak ({outlet.taxPct}%)</span><span>{rp(tax)}</span></div>
            <div className="row between" style={{ paddingTop: 8, borderTop: "1px solid var(--border)" }}>
              <span className="bold" style={{ color: "var(--text-1)" }}>Total</span>
              <span className="bold" style={{ color: "var(--accent)", fontSize: 17 }}>{rp(total)}</span>
            </div>
          </div>
          <div className="stack g2">
            <button className="btn btn-ghost btn-sm"><Icon name="percent" size={13} /> Terapkan Diskon / Voucher</button>
            <button className="btn btn-primary" style={{ width: "100%" }}><Icon name="credit-card" size={15} /> Lanjut ke Pembayaran</button>
          </div>
        </Card>
      </div>
    </>
  );
}
