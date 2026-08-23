"use client";

import { useEffect, useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { Badge, Avatar } from "@/components/ui";
import { rp, minutesToHm, addDays } from "@/lib/format";
import { createCustomerBooking } from "@/lib/actions/customerBookings";
import TherapistProfileModal from "@/components/TherapistProfileModal";
import DatePickerField from "@/components/DatePickerField";
import { nowHHMM as wallNowHHMM } from "@/lib/wallclock";

/**
 * Round a "HH:mm" up to the next :00/:30 slot, clamped to 23:30 so a
 * late-evening bump can never roll past midnight into a different day
 * than the one the guest picked.
 */
function nextBookableSlot(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const rounded = Math.min(Math.ceil((h * 60 + m) / 30) * 30, 23 * 60 + 30);
  return `${String(Math.floor(rounded / 60)).padStart(2, "0")}:${String(rounded % 60).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------
// Customer-facing booking form — added 2026-08-22, the live-data
// replacement for /customer/book's old fully-mock, non-interactive
// step display. Sibling to components/BookingForm.tsx (the staff/kasir
// version) but: (a) no name/phone fields — the signed-in customer IS the
// guest, (b) outlet/package/therapist are actual selectable client state
// instead of a single hard-coded "PRIMARY_OUTLET", since a real customer
// can book at any outlet in their tenant.
//
// Deposit math is duplicated here (formatDepositLabel/calcDeposit
// normally live in lib/data/outlets.ts) rather than imported, because
// that module pulls in lib/supabase/server.ts (next/headers) — fine in a
// Server Component, but it would break this Client Component's bundle.
// Keep this in sync with lib/data/outlets.ts if the deposit formula ever
// changes.
// ---------------------------------------------------------------------

type DepositPolicyLite = {
  enabled: boolean;
  type: "FIXED" | "PERCENT";
  value: number;
  minTicket: number;
  expiryMin: number;
  note: string;
};

function depositLabel(d: DepositPolicyLite): string {
  if (!d.enabled) return "Tidak ada deposit";
  return d.type === "FIXED" ? `Rp${d.value.toLocaleString("id-ID")}` : `${d.value}% dari harga layanan`;
}

function calcDeposit(d: DepositPolicyLite, ticketTotal: number): number {
  if (!d.enabled || ticketTotal < d.minTicket) return 0;
  const raw = d.type === "FIXED" ? d.value : (ticketTotal * d.value) / 100;
  return Math.round(raw / 1000) * 1000;
}

export type OutletOption = {
  id: string;
  name: string;
  city: string;
  openHours: string;
  deposit: DepositPolicyLite;
  /** 0 = hari-H saja (default), maks 3 — lihat lib/actions/outlets.ts::setBookingWindowDays. */
  bookingWindowDays: number;
};

export type PackageOption = {
  id: string;
  outletId: string;
  name: string;
  durationMin: number;
  listPrice: number;
  memberPrice: number;
  requiredSkill: string;
};

export type TherapistOption = {
  id: string;
  outletId: string;
  name: string;
  grade?: string;
  skills: string[];
  photoUrl?: string;
  galleryUrls?: string[];
  featured?: boolean;
  featuredBadge?: string;
  bio?: string;
};

export default function CustomerBookingForm({
  outlets,
  packages,
  therapists,
  isMember,
  today,
  initialOutletId,
}: {
  outlets: OutletOption[];
  packages: PackageOption[];
  therapists: TherapistOption[];
  isMember: boolean;
  today: string;
  initialOutletId?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const [outletId, setOutletId] = useState(initialOutletId && outlets.some((o) => o.id === initialOutletId) ? initialOutletId : outlets[0]?.id ?? "");
  const outletPackages = useMemo(() => packages.filter((p) => p.outletId === outletId), [packages, outletId]);
  const [packageId, setPackageId] = useState(outletPackages[0]?.id ?? "");
  const selectedPackage = outletPackages.find((p) => p.id === packageId) ?? outletPackages[0];

  const outletTherapists = useMemo(
    () => therapists.filter((t) => t.outletId === outletId && (!selectedPackage || t.skills.includes(selectedPackage.requiredSkill))),
    [therapists, outletId, selectedPackage]
  );
  const [therapistId, setTherapistId] = useState(outletTherapists[0]?.id ?? "");
  const selectedTherapist = outletTherapists.find((t) => t.id === therapistId) ?? outletTherapists[0];

  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState("10:00");

  // Rule 1 (2026-08-23): a guest must not be able to book a slot that
  // has already passed. Read on the client, after mount, and kept
  // ticking — rendering the current time during SSR would both hydrate
  // mismatched and go stale the moment the guest left the tab open.
  // null until mount, which is why every use below is guarded.
  const [clockHHMM, setClockHHMM] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setClockHHMM(wallNowHHMM());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  const [notes, setNotes] = useState("");
  const [profileTherapist, setProfileTherapist] = useState<TherapistOption | null>(null);

  const outlet = outlets.find((o) => o.id === outletId);
  const maxDate = addDays(today, outlet?.bookingWindowDays ?? 0);
  const price = selectedPackage ? (isMember ? selectedPackage.memberPrice : selectedPackage.listPrice) : 0;
  const deposit = outlet && selectedPackage ? calcDeposit(outlet.deposit, price) : 0;

  // Clamp the picked date whenever it falls outside the (possibly new,
  // possibly narrower) selected outlet's booking window — e.g. switching
  // from an outlet allowing H-3 to one that's hari-H-only shouldn't leave
  // a now-invalid date silently selected.
  useEffect(() => {
    if (date < today || date > maxDate) setDate(today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxDate]);

  // Keep the chosen time honest as the clock moves: a guest who opened
  // the form at 09:55 and picks a slot at 10:15 should not be able to
  // submit it at 10:20. Bumping to the next half-hour is friendlier than
  // clearing the field, and converges immediately (the new value is
  // never itself in the past, so this cannot loop).
  useEffect(() => {
    if (date === today && clockHHMM && startTime < clockHHMM) {
      setStartTime(nextBookableSlot(clockHHMM));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, clockHHMM, today]);

  function onSelectOutlet(id: string) {
    setOutletId(id);
    const firstPkg = packages.find((p) => p.outletId === id);
    setPackageId(firstPkg?.id ?? "");
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!outletId || !packageId || !therapistId) {
      setError("Lengkapi outlet, layanan, dan terapis terlebih dahulu.");
      return;
    }
    startTransition(async () => {
      const result = await createCustomerBooking({ outletId, packageId, therapistId, date, startTime, notes });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOk(true);
      router.refresh();
    });
  }

  if (ok) {
    return (
      <div className="m-card" style={{ textAlign: "center", padding: 24 }}>
        <Icon name="circle-check" size={30} style={{ color: "var(--accent)", marginBottom: 10 }} />
        <div className="m-title" style={{ marginBottom: 4 }}>Booking berhasil dibuat</div>
        <div className="tiny dim" style={{ marginBottom: 16, lineHeight: 1.6 }}>
          Cek detailnya di halaman Riwayat. Konfirmasi ulang mungkin diperlukan pada hari-H sesuai kebijakan outlet.
        </div>
        <div className="row g2">
          <button className="m-btn m-btn-primary" style={{ flex: 1 }} onClick={() => router.push("/customer/history")}>
            Lihat Riwayat
          </button>
          <button
            className="m-btn m-btn-ghost"
            style={{ flex: 1 }}
            onClick={() => {
              setOk(false);
            }}
          >
            Booking Lagi
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
    <form onSubmit={onSubmit} className="stack g5">
      <div>
        <div className="row g2" style={{ marginBottom: 8 }}>
          <span className="stat-icon" style={{ width: 22, height: 22, borderRadius: 6, fontSize: 10 }}>1</span>
          <span className="m-section" style={{ marginBottom: 0 }}>Pilih Outlet</span>
        </div>
        {outlets.length === 0 ? (
          <div className="small dim">Belum ada outlet aktif untuk tenant ini.</div>
        ) : (
          <div className="stack g2">
            {outlets.map((o) => (
              <button
                type="button"
                key={o.id}
                onClick={() => onSelectOutlet(o.id)}
                className="m-list-link"
                style={{
                  width: "100%", textAlign: "left", border: "1px solid var(--border)", cursor: "pointer",
                  ...(o.id === outletId ? { border: "1.5px solid var(--accent)", background: "var(--accent-soft)" } : {}),
                }}
              >
                <span className="stat-icon" style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0 }}>
                  <Icon name="map-pin" size={15} />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="small bold truncate" style={{ color: "var(--text-1)" }}>{o.name.replace("Amethyst — ", "")}</div>
                  <div className="tiny dim truncate">{o.city}{o.openHours ? ` · ${o.openHours}` : ""}</div>
                  <div className="tiny truncate" style={{ color: o.deposit.enabled ? "var(--warning)" : "var(--text-4)", marginTop: 2 }}>
                    {o.deposit.enabled ? `Deposit ${depositLabel(o.deposit)}` : "Tanpa deposit"}
                  </div>
                </div>
                {o.id === outletId && <Icon name="check-circle" size={16} style={{ color: "var(--accent)", flexShrink: 0 }} />}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="row g2" style={{ marginBottom: 8 }}>
          <span className="stat-icon" style={{ width: 22, height: 22, borderRadius: 6, fontSize: 10 }}>2</span>
          <span className="m-section" style={{ marginBottom: 0 }}>Pilih Layanan</span>
        </div>
        {outletPackages.length === 0 ? (
          <div className="small dim">Belum ada paket layanan untuk outlet ini.</div>
        ) : (
          <div className="stack g2">
            {outletPackages.map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() => setPackageId(p.id)}
                className="m-list-link"
                style={{
                  width: "100%", textAlign: "left", border: "1px solid var(--border)", cursor: "pointer",
                  ...(p.id === packageId ? { border: "1.5px solid var(--accent)", background: "var(--accent-soft)" } : {}),
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="small bold truncate" style={{ color: "var(--text-1)" }}>{p.name}</div>
                  <div className="tiny dim truncate">{minutesToHm(p.durationMin)} · {rp(isMember ? p.memberPrice : p.listPrice)}</div>
                </div>
                {p.id === packageId && <Icon name="check-circle" size={16} style={{ color: "var(--accent)", flexShrink: 0 }} />}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="row g2" style={{ marginBottom: 8 }}>
          <span className="stat-icon" style={{ width: 22, height: 22, borderRadius: 6, fontSize: 10 }}>3</span>
          <span className="m-section" style={{ marginBottom: 0 }}>Pilih Terapis</span>
        </div>
        {outletTherapists.length === 0 ? (
          <div className="small dim">Belum ada terapis dengan keahlian yang cocok di outlet ini.</div>
        ) : (
          <div className="grid grid-2" style={{ gap: 8 }}>
            {outletTherapists.map((t) => (
              <div
                key={t.id}
                style={{
                  position: "relative", padding: 12, borderRadius: "var(--r-md)", background: "var(--bg-surface-2)", border: "1px solid var(--border)",
                  ...(t.id === therapistId ? { border: "1.5px solid var(--accent)", background: "var(--accent-soft)" } : {}),
                }}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setProfileTherapist(t);
                  }}
                  title="Lihat profil"
                  style={{
                    position: "absolute", top: 8, right: 8, width: 22, height: 22, borderRadius: "50%",
                    display: "grid", placeItems: "center", background: "var(--bg-surface-1)", border: "1px solid var(--border)", cursor: "pointer",
                  }}
                >
                  <Icon name="info" size={12} style={{ color: "var(--text-3)" }} />
                </button>
                <button type="button" onClick={() => setTherapistId(t.id)} className="stack g2" style={{ width: "100%", textAlign: "left", cursor: "pointer" }}>
                  {t.featured && (
                    <div style={{ alignSelf: "flex-start" }}>
                      <Badge tone="gold" icon="star">{t.featuredBadge ?? "Unggulan"}</Badge>
                    </div>
                  )}
                  <div className="row g2" style={{ paddingRight: 20 }}>
                    <Avatar name={t.name} photoUrl={t.photoUrl} size={44} rect />
                    <div style={{ minWidth: 0 }}>
                      <div className="tiny bold truncate" style={{ color: "var(--text-1)" }}>{t.name}</div>
                      {t.grade && <div className="tiny dim">{t.grade}</div>}
                    </div>
                  </div>
                  <div className="row g1 wrap">
                    {t.skills.slice(0, 2).map((s) => (
                      <span key={s} className="chip" style={{ height: 20, padding: "0 8px", fontSize: 10 }}>{s}</span>
                    ))}
                  </div>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="row g2" style={{ marginBottom: 8 }}>
          <span className="stat-icon" style={{ width: 22, height: 22, borderRadius: 6, fontSize: 10 }}>4</span>
          <span className="m-section" style={{ marginBottom: 0 }}>Tanggal &amp; Waktu</span>
        </div>
        <div className="row g2">
          <DatePickerField value={date} min={today} max={maxDate} onChange={setDate} />
          <input
            className="input"
            type="time"
            required
            value={startTime}
            min={date === today && clockHHMM ? clockHHMM : undefined}
            onChange={(e) => setStartTime(e.target.value)}
            style={{ flex: 1 }}
          />
        </div>
        {maxDate === today ? (
          <div className="tiny dim" style={{ marginTop: 6 }}>Outlet ini hanya menerima booking untuk hari ini.</div>
        ) : (
          <div className="tiny dim" style={{ marginTop: 6 }}>Booking bisa dijadwalkan sampai {maxDate.slice(8)}/{maxDate.slice(5, 7)}.</div>
        )}
        {date === today && clockHHMM && (
          <div className="tiny dim" style={{ marginTop: 4 }}>
            Untuk hari ini, jam paling awal yang bisa dipilih adalah {clockHHMM}.
          </div>
        )}
      </div>

      <div className="field">
        <label>Catatan (opsional)</label>
        <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Preferensi, kondisi khusus, dsb." />
      </div>

      {selectedPackage && (
        <div className="m-card m-card-tight">
          <div className="m-section">Ringkasan Booking</div>
          <div className="stack g2" style={{ marginBottom: 12 }}>
            <div className="row between tiny"><span className="muted">Layanan</span><span style={{ color: "var(--text-1)" }}>{selectedPackage.name}</span></div>
            <div className="row between tiny"><span className="muted">Harga</span><span style={{ color: "var(--text-1)" }}>{rp(price)}</span></div>
            {isMember && (
              <div className="row between tiny">
                <span className="muted">Diskon Member</span>
                <Badge tone="gold">-{Math.round((1 - selectedPackage.memberPrice / selectedPackage.listPrice) * 100)}%</Badge>
              </div>
            )}
            <div className="row between tiny" style={{ paddingTop: 8, borderTop: "1px solid var(--border)" }}>
              <span className="muted">Deposit</span>
              {deposit > 0 ? (
                <span className="bold" style={{ color: "var(--warning)" }}>{rp(deposit)}</span>
              ) : (
                <span className="dim">Tidak diperlukan</span>
              )}
            </div>
          </div>

          {deposit > 0 && (
            <div
              className="row g2"
              style={{ alignItems: "flex-start", marginBottom: 12, padding: "10px 12px", borderRadius: "var(--r-md)", background: "var(--warning-soft)", border: "1px solid rgba(245,158,11,0.25)" }}
            >
              <Icon name="info" size={14} style={{ color: "var(--warning)", flexShrink: 0, marginTop: 1 }} />
              <div className="tiny muted" style={{ lineHeight: 1.6 }}>
                Outlet ini meminta deposit {depositLabel(outlet!.deposit)}. Pembayaran deposit online belum tersedia di aplikasi —
                bayar langsung di outlet, mengikuti kebijakan yang berlaku.
              </div>
            </div>
          )}

          {date !== today && (
            <div
              className="row g2"
              style={{ alignItems: "flex-start", marginBottom: 12, padding: "10px 12px", borderRadius: "var(--r-md)", background: "var(--info-soft)", border: "1px solid rgba(56,189,248,0.25)" }}
            >
              <Icon name="bell-ring" size={14} style={{ color: "var(--info)", flexShrink: 0, marginTop: 1 }} />
              <div className="tiny muted" style={{ lineHeight: 1.6 }}>
                Booking untuk tanggal ini bukan hari ini — wajib dikonfirmasi ulang pada hari-H, minimal 1 jam sebelum jadwal.
              </div>
            </div>
          )}

          {error && (
            <div className="row g2" style={{ color: "var(--danger)", marginBottom: 12, padding: "8px 10px", background: "rgba(239,68,68,0.1)", borderRadius: 8 }}>
              <Icon name="triangle-alert" size={14} />
              <span className="tiny">{error}</span>
            </div>
          )}

          <button type="submit" className="m-btn m-btn-primary" disabled={isPending || !packageId || !therapistId}>
            <Icon name="check" size={15} /> {isPending ? "Memproses…" : "Konfirmasi Booking"}
          </button>
        </div>
      )}
    </form>
    {profileTherapist && <TherapistProfileModal therapist={profileTherapist} onClose={() => setProfileTherapist(null)} />}
    </>
  );
}
