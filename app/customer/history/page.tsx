import Icon from "@/components/Icon";
import { Badge } from "@/components/ui";
import MobileShell from "@/components/MobileShell";
import CancelBookingButton from "@/components/CancelBookingButton";
import { getCurrentCustomer } from "@/lib/data/customers";
import { getBookingsForCustomer, getEffectiveToday } from "@/lib/data/bookings";
import { ME_CUSTOMER, BOOKINGS as MOCK_BOOKINGS, TODAY as MOCK_TODAY } from "@/lib/mock";
import { rp, fmtDateShort, fmtTime } from "@/lib/format";
import { wallClockIso } from "@/lib/wallclock";
import { guestCanStillChange } from "@/lib/bookingRules";
import { getTenantTheme } from "@/lib/data/tenant";

// ---------------------------------------------------------------------
// UPDATE 2026-08-22 — migrated off ME_CUSTOMER/BOOKINGS mock fixtures to
// real Supabase data (same dual-mode convention as every other portal
// page — see app/customer/page.tsx's header). "Reschedule" from the old
// mock UI is dropped here rather than faked: there is no real reschedule
// flow built yet (it would need to redo the whole conflict-check dance
// in lib/actions/customerBookings.ts against a NEW slot while releasing
// the old one) — better to not show a button that does nothing than to
// pretend one exists. "Batalkan" IS real (cancelCustomerBooking, same
// file) — RLS's bookings_customer policy already lets a customer update
// their own booking rows, no new migration needed for either.
// ---------------------------------------------------------------------

export default async function HistoryPage() {
  const theme = await getTenantTheme();
  const customer = await getCurrentCustomer();
  const live = customer !== null;
  const me = customer ?? ME_CUSTOMER;
  const today = live ? await getEffectiveToday() : MOCK_TODAY;

  const bookings = live
    ? (await getBookingsForCustomer(me.id)).sort((a, b) => b.date.localeCompare(a.date))
    : MOCK_BOOKINGS.filter((b) => b.customerId === me.id).sort((a, b) => b.date.localeCompare(a.date));

  const upcoming = bookings.filter((b) => b.date >= today && !["CANCELLED", "NO_SHOW"].includes(b.status));
  const past = bookings.filter((b) => b.date < today || ["CANCELLED", "NO_SHOW"].includes(b.status));
  const totalSpend = past.filter((b) => b.status === "PAID").reduce((s, b) => s + b.price, 0);

  return (
    <MobileShell role="customer" brandKey={theme.brandKey} bgKey={theme.bgKey} title="Riwayat" subtitle={`${bookings.length} total booking`} avatarName={me.name} avatarTone={me.avatarTone}>
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
                  <div className="tiny dim">{fmtDateShort(b.date)} · {fmtTime(b.scheduledStart)} · {b.therapistName || "—"}</div>
                  {live && ["BOOKED", "CONFIRMED", "ARRIVED"].includes(b.status) && (
                    <div className="row g2" style={{ marginTop: 10 }}>
                      <CancelBookingButton
                        bookingId={b.id}
                        startIso={wallClockIso(b.date, b.scheduledStart)}
                        initiallyLocked={!guestCanStillChange(wallClockIso(b.date, b.scheduledStart))}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="m-section">Riwayat Kunjungan</div>
          {past.length === 0 ? (
            <div className="small dim" style={{ textAlign: "center", padding: "12px 0" }}>Belum ada riwayat kunjungan.</div>
          ) : (
            <div className="stack g2">
              {past.slice(0, 15).map((b) => (
                <div key={b.id} className="m-row">
                  <span className="stat-icon" style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0 }}>
                    <Icon name="hand-heart" size={14} />
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="tiny bold truncate" style={{ color: "var(--text-1)" }}>{b.packageName}</div>
                    <div className="tiny dim truncate">{fmtDateShort(b.date)} · {b.therapistName || "—"}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="tiny bold" style={{ color: "var(--text-1)" }}>{rp(b.price, { short: true })}</div>
                    <Badge tone={b.status === "PAID" ? "success" : b.status === "CANCELLED" ? "neutral" : "danger"}>{b.status.replace(/_/g, " ")}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </MobileShell>
  );
}
