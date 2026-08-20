import Link from "next/link";
import Icon from "@/components/Icon";
import { Badge } from "@/components/ui";
import MobileShell from "@/components/MobileShell";
import { ME_CUSTOMER, BOOKINGS, PROMOTIONS, PRIMARY_OUTLET, OUTLETS, TODAY } from "@/lib/mock";
import { rp, fmtTime, fmtDateLong } from "@/lib/format";

export default function CustomerHomePage() {
  const me = ME_CUSTOMER;
  const myBookings = BOOKINGS.filter((b) => b.customerId === me.id).sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = myBookings.find((b) => b.date >= TODAY && ["BOOKED", "CONFIRMED", "ARRIVED", "CHECKED_IN"].includes(b.status));
  const promos = PROMOTIONS.filter((p) => p.status === "ACTIVE" && p.outletId === PRIMARY_OUTLET.id).slice(0, 3);

  return (
    <MobileShell
      role="customer"
      title={`Halo, ${me.name.split(" ")[0]}`}
      subtitle="Amethyst"
      avatarName={me.name}
      avatarTone={me.avatarTone}
      headerRight={
        <Link href="/customer/profile" className="btn btn-quiet btn-icon btn-sm">
          <Icon name="bell" size={17} />
        </Link>
      }
    >
      <div className="stack g4">
        <div className="m-card" style={{ background: "var(--accent-gradient)", border: "none" }}>
          <div className="row between" style={{ marginBottom: 14 }}>
            <div>
              <div className="tiny" style={{ color: "rgba(4,20,15,0.65)", marginBottom: 2 }}>Membership</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 700, color: "#04140f" }}>
                {me.membership !== "None" ? me.membership : "Reguler"}
              </div>
            </div>
            <Icon name="gem" size={26} style={{ color: "#04140f" }} />
          </div>
          <div className="row between">
            <div>
              <div className="tiny" style={{ color: "rgba(4,20,15,0.65)" }}>Saldo Prepaid</div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, color: "#04140f" }}>{rp(me.prepaidBalance)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="tiny" style={{ color: "rgba(4,20,15,0.65)" }}>Poin Loyalti</div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, color: "#04140f" }}>{me.loyaltyPoints.toLocaleString("id-ID")}</div>
            </div>
          </div>
        </div>

        <Link href="/customer/book" className="m-btn m-btn-primary">
          <Icon name="calendar-plus" size={16} /> Booking Layanan Baru
        </Link>

        {upcoming ? (
          <div>
            <div className="m-section">Booking Mendatang</div>
            <div className="m-card m-card-tight">
              <div className="row between" style={{ marginBottom: 8 }}>
                <span className="small bold" style={{ color: "var(--text-1)" }}>{upcoming.packageName}</span>
                <Badge tone="info">{upcoming.status.replace(/_/g, " ")}</Badge>
              </div>
              <div className="tiny dim" style={{ marginBottom: 2 }}>{fmtDateLong(upcoming.date)} · {fmtTime(upcoming.scheduledStart)}</div>
              <div className="tiny dim">{upcoming.therapistName} · {upcoming.roomName}</div>
              {upcoming.date !== TODAY && (
                <div
                  className="row g2"
                  style={{
                    alignItems: "flex-start", marginTop: 10, padding: "8px 10px",
                    borderRadius: "var(--r-sm)", background: "var(--info-soft)",
                  }}
                >
                  <Icon name="bell-ring" size={12} style={{ color: "var(--info)", flexShrink: 0, marginTop: 1 }} />
                  <span className="tiny muted" style={{ lineHeight: 1.55 }}>
                    Wajib dikonfirmasi ulang pada hari-H, min. 1 jam sebelum jadwal — atau otomatis batal.
                  </span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="small dim" style={{ textAlign: "center" }}>Belum ada booking mendatang.</div>
        )}

        <div>
          <div className="m-section">Pilih Outlet Favorit Anda</div>
          <div className="row g2" style={{ overflowX: "auto", paddingBottom: 4 }}>
            {OUTLETS.filter((o) => o.profile.published).map((o) => (
              <Link
                key={o.id}
                href={`/customer/outlets/${o.id}`}
                className="stack g1"
                style={{
                  minWidth: 132, flexShrink: 0, padding: 12, borderRadius: "var(--r-md)",
                  background: "var(--bg-surface-2)", border: "1px solid var(--border)",
                }}
              >
                <Icon name="map-pin" size={15} style={{ color: "var(--accent)" }} />
                <span className="tiny bold truncate" style={{ color: "var(--text-1)" }}>
                  {o.name.replace("Amethyst — ", "")}
                </span>
                <span className="tiny dim truncate">{o.city}</span>
                <span className="tiny row g1" style={{ color: "var(--accent)", marginTop: 2 }}>
                  Lihat profil <Icon name="chevron-right" size={11} />
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div>
          <div className="m-section">Promo Untuk Anda</div>
          <div className="stack g2">
            {promos.map((p) => (
              <div key={p.id} className="m-list-link">
                <span className="stat-icon" style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0 }}>
                  <Icon name="ticket" size={15} />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="small bold truncate" style={{ color: "var(--text-1)" }}>{p.name}</div>
                  <div className="tiny dim truncate">{p.value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="m-section">Favorit Anda</div>
          <div className="row g2">
            <div className="m-stat">
              <Icon name="hand-heart" size={16} style={{ color: "var(--accent)", marginBottom: 6 }} />
              <div className="tiny bold truncate" style={{ color: "var(--text-1)" }}>{me.favoriteTherapist}</div>
              <div className="tiny dim">Terapis favorit</div>
            </div>
            <div className="m-stat">
              <Icon name="sparkles" size={16} style={{ color: "var(--accent)", marginBottom: 6 }} />
              <div className="tiny bold truncate" style={{ color: "var(--text-1)" }}>{me.favoriteService}</div>
              <div className="tiny dim">Layanan favorit</div>
            </div>
          </div>
        </div>
      </div>
    </MobileShell>
  );
}
