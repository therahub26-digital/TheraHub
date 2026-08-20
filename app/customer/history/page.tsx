import Icon from "@/components/Icon";
import { Badge } from "@/components/ui";
import MobileShell from "@/components/MobileShell";
import { ME_CUSTOMER, BOOKINGS, TODAY } from "@/lib/mock";
import { rp, fmtDateShort, fmtTime } from "@/lib/format";

export default function HistoryPage() {
  const me = ME_CUSTOMER;
  const bookings = BOOKINGS.filter((b) => b.customerId === me.id).sort((a, b) => b.date.localeCompare(a.date));
  const upcoming = bookings.filter((b) => b.date >= TODAY && !["CANCELLED", "NO_SHOW"].includes(b.status));
  const past = bookings.filter((b) => b.date < TODAY || ["CANCELLED", "NO_SHOW"].includes(b.status));
  const totalSpend = past.filter((b) => b.status === "PAID").reduce((s, b) => s + b.price, 0);

  return (
    <MobileShell role="customer" title="Riwayat" subtitle={`${bookings.length} total booking`} avatarName={me.name} avatarTone={me.avatarTone}>
      <div className="stack g4">
        <div className="row g2">
          <div className="m-stat">
            <div className="m-stat-value">{me.visitCount}</div>
            <div className="tiny dim">Total Kunjungan</div>
          </div>
          <div className="m-stat">
            <div className="m-stat-value">{rp(totalSpend, { short: true })}</div>
            <div className="tiny dim">Total Belanja</div>
          </div>
        </div>

        {upcoming.length > 0 && (
          <div>
            <div className="m-section">Akan Datang</div>
            <div className="stack g2">
              {upcoming.map((b) => (
                <div key={b.id} className="m-card m-card-tight">
                  <div className="row between" style={{ marginBottom: 6 }}>
                    <span className="small bold" style={{ color: "var(--text-1)" }}>{b.packageName}</span>
                    <Badge tone="info">{b.status.replace(/_/g, " ")}</Badge>
                  </div>
                  <div className="tiny dim">{fmtDateShort(b.date)} · {fmtTime(b.scheduledStart)} · {b.therapistName}</div>
                  <div className="row g2" style={{ marginTop: 10 }}>
                    <button className="m-btn m-btn-ghost" style={{ height: 36, fontSize: 12.5 }}>Reschedule</button>
                    <button className="m-btn m-btn-danger" style={{ height: 36, fontSize: 12.5 }}>Batalkan</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="m-section">Riwayat Kunjungan</div>
          <div className="stack g2">
            {past.slice(0, 15).map((b) => (
              <div key={b.id} className="m-row">
                <span className="stat-icon" style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0 }}>
                  <Icon name="hand-heart" size={14} />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="tiny bold truncate" style={{ color: "var(--text-1)" }}>{b.packageName}</div>
                  <div className="tiny dim truncate">{fmtDateShort(b.date)} · {b.therapistName}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="tiny bold" style={{ color: "var(--text-1)" }}>{rp(b.price, { short: true })}</div>
                  <Badge tone={b.status === "PAID" ? "success" : b.status === "CANCELLED" ? "neutral" : "danger"}>{b.status.replace(/_/g, " ")}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </MobileShell>
  );
}
