import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, Badge, PersonCell, InfoNote } from "@/components/ui";
import { PRIMARY_OUTLET, sessionsOf } from "@/lib/mock";
import { rp } from "@/lib/format";

const METHODS = [
  { key: "cash", label: "Cash", icon: "banknote" },
  { key: "qris", label: "QRIS", icon: "qr-code" },
  { key: "debit", label: "Debit Card", icon: "credit-card" },
  { key: "credit", label: "Credit Card", icon: "credit-card" },
  { key: "transfer", label: "Transfer", icon: "arrow-left-right" },
  { key: "ewallet", label: "E-Wallet", icon: "smartphone" },
];

export default function PaymentPage() {
  const outlet = PRIMARY_OUTLET;
  const completed = sessionsOf(outlet.id).filter((s) => s.status === "COMPLETED");
  const guest = completed[0];
  const subtotal = 150_000;
  const serviceCharge = Math.round((subtotal * outlet.serviceChargePct) / 100);
  const tax = Math.round(((subtotal + serviceCharge) * outlet.taxPct) / 100);
  const total = subtotal + serviceCharge + tax;

  return (
    <>
      <PageHead
        title="Payment"
        desc={`${outlet.name} · Pilih metode pembayaran dan selesaikan transaksi.`}
      />

      <div className="grid grid-3" style={{ alignItems: "start" }}>
        <div className="stack g5" style={{ gridColumn: "span 2" }}>
          <Card>
            <CardHead title="Metode Pembayaran" sub="Pilih salah satu — mendukung split payment" />
            <div className="card-body">
              <div className="grid grid-3">
                {METHODS.map((m, i) => (
                  <button
                    key={m.key}
                    className="btn"
                    style={{
                      flexDirection: "column",
                      height: 84,
                      gap: 8,
                      background: i === 1 ? "var(--accent-soft)" : "var(--bg-deep)",
                      border: `1.5px solid ${i === 1 ? "var(--accent)" : "var(--border)"}`,
                      color: i === 1 ? "var(--accent)" : "var(--text-2)",
                    }}
                  >
                    <Icon name={m.icon} size={22} />
                    <span className="small bold">{m.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </Card>

          <Card className="card-pad">
            <div className="row g3" style={{ marginBottom: 12 }}>
              <span className="stat-icon" style={{ width: 56, height: 56, borderRadius: 14 }}>
                <Icon name="qr-code" size={26} />
              </span>
              <div>
                <div className="strong" style={{ color: "var(--text-1)" }}>QRIS — Midtrans Payment Gateway</div>
                <div className="tiny dim">Tamu memindai kode QR untuk membayar {rp(total)}. Status akan diperbarui otomatis via webhook.</div>
              </div>
            </div>
            <div
              style={{
                width: 200,
                height: 200,
                margin: "0 auto",
                borderRadius: "var(--r-md)",
                background: "repeating-linear-gradient(45deg, rgba(255,255,255,0.06) 0 8px, rgba(255,255,255,0.02) 8px 16px)",
                border: "1px solid var(--border-2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="qr-code" size={72} style={{ color: "var(--text-4)" }} />
            </div>
            <div className="row g2" style={{ justifyContent: "center", marginTop: 14 }}>
              <Badge tone="warning" dot>Menunggu pembayaran</Badge>
            </div>
          </Card>

          <InfoNote icon="info">
            Setelah pembayaran terkonfirmasi, struk otomatis tercetak dan komisi terapis dicatat ke sistem payroll.
          </InfoNote>
        </div>

        <Card className="card-pad">
          <div className="row g2" style={{ marginBottom: 14 }}>
            <Icon name="receipt" size={16} style={{ color: "var(--accent)" }} />
            <h3>Ringkasan Tagihan</h3>
          </div>
          {guest && (
            <div style={{ marginBottom: 14 }}>
              <PersonCell name={guest.customerName} sub={`${guest.packageName} · ${guest.therapistName}`} toneKey="teal" size={34} />
            </div>
          )}
          <div className="stack g2" style={{ marginBottom: 16 }}>
            <div className="row between small muted"><span>Subtotal</span><span>{rp(subtotal)}</span></div>
            <div className="row between small muted"><span>Service Charge</span><span>{rp(serviceCharge)}</span></div>
            <div className="row between small muted"><span>Pajak</span><span>{rp(tax)}</span></div>
            <div className="row between" style={{ paddingTop: 8, borderTop: "1px solid var(--border)" }}>
              <span className="bold" style={{ color: "var(--text-1)" }}>Total Bayar</span>
              <span className="bold" style={{ color: "var(--accent)", fontSize: 18 }}>{rp(total)}</span>
            </div>
          </div>
          <div className="stack g2">
            <button className="btn btn-primary" style={{ width: "100%" }}><Icon name="check" size={15} /> Konfirmasi Pembayaran</button>
            <button className="btn btn-ghost" style={{ width: "100%" }}><Icon name="arrow-left" size={13} /> Kembali ke Cart</button>
          </div>
        </Card>
      </div>
    </>
  );
}
