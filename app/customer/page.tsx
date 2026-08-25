import Link from "next/link";
import Icon from "@/components/Icon";
import { Badge, Avatar } from "@/components/ui";
import MobileShell from "@/components/MobileShell";
import { getCurrentCustomer } from "@/lib/data/customers";
import { getBookingsForCustomer, getEffectiveToday } from "@/lib/data/bookings";
import { getOutlets } from "@/lib/data/outlets";
import { getPromotionsForOutlet } from "@/lib/data/promotions";
import { ME_CUSTOMER, BOOKINGS as MOCK_BOOKINGS, PROMOTIONS as MOCK_PROMOTIONS, PRIMARY_OUTLET, OUTLETS as MOCK_OUTLETS, TODAY as MOCK_TODAY } from "@/lib/mock";
import { rp, fmtTime, fmtDateLong } from "@/lib/format";
import { getTenantTheme } from "@/lib/data/tenant";

// ---------------------------------------------------------------------
// UPDATE 2026-08-22 — migrated off the hard-coded ME_CUSTOMER/BOOKINGS/
// PROMOTIONS/PRIMARY_OUTLET/OUTLETS mock fixtures to real Supabase data,
// per user request "halaman konsumen migrasi ke data real". Same
// dual-mode convention as every other portal page: getCurrentCustomer()
// returns null for a demo/"Ganti Role" viewer (no real customer session)
// -> fall back to the mock fixtures so that showcase experience is
// unchanged; a real signed-in customer sees their own real data.
//
// "Home outlet" for a customer (no outlet_id on `customers`, see
// lib/data/customers.ts's file header) is resolved as: the outlet of
// their most recent booking if they have one, else the tenant's first
// published outlet, else just the first outlet — same fallback chain a
// brand-new customer with zero bookings needs.
//
// UPDATE 2026-08-25 — Adjie: "halaman beranda ini seharusnya seperti
// penyambutan: kotak membership tidak perlu ada, digabungkan dengan
// kotak halo budy saja, tampilan uinya lebih baik seperti tampilan
// outlet pakai header; di kotak pilih favourite outlet anda, ukurannya
// dilebarkan dan tambahkan gambar tampak depan ruko (ambil dari profil
// outlet), kotak booking mendatang juga dikecilkan, jenis layanan gak
// usah ditampilkan". Empat perubahan itu:
//   1. Kartu Membership gold yang berdiri sendiri DIHAPUS; membership,
//      saldo prepaid, dan poin loyalti sekarang jadi bagian dari satu
//      hero penyambutan di atas.
//   2. Hero itu memakai pola yang sama persis dengan hero di halaman
//      profil outlet (/customer/outlets/[id]): foto cover outlet + scrim
//      gelap kalau ada fotonya, jatuh ke accent-gradient kalau belum.
//   3. Kartu outlet dilebarkan dan diberi foto cover outlet.
//   4. Kartu booking mendatang dipadatkan dan nama paket dilepas.
// Judul MobileShell diubah jadi "Beranda" supaya sapaannya tidak dobel
// dengan hero di bawahnya.
// ---------------------------------------------------------------------

export default async function CustomerHomePage() {
  const theme = await getTenantTheme();
  const customer = await getCurrentCustomer();
  const live = customer !== null;

  const me = customer ?? ME_CUSTOMER;
  const effectiveToday = live ? await getEffectiveToday() : MOCK_TODAY;
  const myBookings = live
    ? (await getBookingsForCustomer(me.id)).sort((a, b) => a.date.localeCompare(b.date))
    : MOCK_BOOKINGS.filter((b) => b.customerId === me.id).sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = myBookings.find((b) => b.date >= effectiveToday && ["BOOKED", "CONFIRMED", "ARRIVED", "CHECKED_IN"].includes(b.status));

  const outlets = live ? await getOutlets() : MOCK_OUTLETS;
  const published = outlets.filter((o) => o.profile.published);

  const homeOutletId = upcoming?.outletId ?? published[0]?.id ?? outlets[0]?.id ?? PRIMARY_OUTLET.id;
  const homeOutlet = outlets.find((o) => o.id === homeOutletId);
  // Foto tampak depan ruko diambil dari cover profil outlet — sumber yang
  // sama persis dengan yang dipakai halaman profil outlet, jadi begitu
  // Admin mengganti cover di /admin/outlets/[id]/profile, hero di sini
  // dan kartu outlet di bawah ikut berubah tanpa upload kedua kali.
  const heroCover = homeOutlet?.profile.cover ?? "";
  const membership = me.membership !== "None" ? me.membership : "Reguler";

  const promos = live
    ? (await getPromotionsForOutlet(homeOutletId)).filter((p) => p.status === "ACTIVE").slice(0, 3)
    : MOCK_PROMOTIONS.filter((p) => p.status === "ACTIVE" && p.outletId === PRIMARY_OUTLET.id).slice(0, 3);

  // Teks di atas foto selalu putih di atas scrim gelap (terbaca di kedua
  // tema tanpa warna kondisional); tanpa foto, gradient accent butuh tinta
  // gelap. Pola yang sama dipakai hero /customer/outlets/[id].
  const onPhoto = !!heroCover;
  const inkStrong = onPhoto ? "#fff" : "#04140f";
  const inkSoft = onPhoto ? "rgba(255,255,255,0.82)" : "rgba(4,20,15,0.68)";

  return (
    <MobileShell
      role="customer" brandKey={theme.brandKey} bgKey={theme.bgKey}
      title="Beranda"
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
        {/* Hero penyambutan — sapaan + membership + saldo + poin jadi satu. */}
        <div
          style={{
            position: "relative",
            borderRadius: "var(--r-lg)",
            overflow: "hidden",
            display: "flex",
            alignItems: "flex-end",
            minHeight: onPhoto ? 190 : undefined,
            background: onPhoto ? "var(--bg-surface-2)" : "var(--accent-gradient)",
          }}
        >
          {onPhoto && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={heroCover}
                alt=""
                aria-hidden
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
              />
              <div
                aria-hidden
                style={{
                  position: "absolute", inset: 0,
                  background: "linear-gradient(180deg, rgba(3,7,12,0.16) 0%, rgba(3,7,12,0.52) 46%, rgba(3,7,12,0.88) 100%)",
                }}
              />
            </>
          )}

          <div style={{ position: "relative", padding: 16, width: "100%" }}>
            <div className="row g3" style={{ marginBottom: 14 }}>
              <Avatar name={me.name} toneKey={me.avatarTone} size={40} />
              <div style={{ minWidth: 0 }}>
                <div
                  className="truncate"
                  style={{
                    fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 19, lineHeight: 1.25,
                    color: inkStrong, textShadow: onPhoto ? "0 1px 12px rgba(0,0,0,0.5)" : undefined,
                  }}
                >
                  Halo, {me.name.split(" ")[0]}
                </div>
                <div className="row g2" style={{ marginTop: 3 }}>
                  <Icon name="gem" size={12} style={{ color: inkStrong }} />
                  <span className="tiny" style={{ color: inkSoft }}>Member {membership} · Amethyst</span>
                </div>
              </div>
            </div>

            <div
              className="row between"
              style={{
                padding: "10px 12px", borderRadius: "var(--r-md)",
                background: onPhoto ? "rgba(255,255,255,0.13)" : "rgba(4,20,15,0.12)",
                backdropFilter: onPhoto ? "blur(8px)" : undefined,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div className="tiny" style={{ color: inkSoft }}>Saldo Prepaid</div>
                <div className="truncate" style={{ fontFamily: "var(--font-display)", fontWeight: 700, color: inkStrong }}>
                  {rp(me.prepaidBalance)}
                </div>
              </div>
              <div style={{ textAlign: "right", minWidth: 0 }}>
                <div className="tiny" style={{ color: inkSoft }}>Poin Loyalti</div>
                <div className="truncate" style={{ fontFamily: "var(--font-display)", fontWeight: 700, color: inkStrong }}>
                  {me.loyaltyPoints.toLocaleString("id-ID")}
                </div>
              </div>
            </div>
          </div>
        </div>

        <Link href="/customer/book" className="m-btn m-btn-primary">
          <Icon name="calendar-plus" size={16} /> Booking Layanan Baru
        </Link>

        {upcoming ? (
          <div>
            <div className="m-section">Booking Mendatang</div>
            {/* Dipadatkan atas permintaan Adjie: nama paket dilepas, catatan
                konfirmasi H-1 jadi satu baris tipis (bukan kotak berpadding)
                — tetap tampil karena isinya penting (booking otomatis batal),
                cuma tidak lagi mendominasi layar. */}
            <div className="m-card m-card-tight">
              <div className="row between" style={{ marginBottom: 4 }}>
                <span className="small bold" style={{ color: "var(--text-1)" }}>
                  {fmtDateLong(upcoming.date)} · {fmtTime(upcoming.scheduledStart)}
                </span>
                <Badge tone="info">{upcoming.status.replace(/_/g, " ")}</Badge>
              </div>
              <div className="tiny dim truncate">
                {upcoming.therapistName || "—"} · {upcoming.roomName || "Room ditentukan saat check-in"}
              </div>
              {upcoming.date !== effectiveToday && (
                <div className="row g2" style={{ alignItems: "flex-start", marginTop: 8 }}>
                  <Icon name="bell-ring" size={11} style={{ color: "var(--info)", flexShrink: 0, marginTop: 2 }} />
                  <span className="tiny dim" style={{ lineHeight: 1.5 }}>
                    Konfirmasi ulang di hari-H (min. 1 jam sebelum jadwal) — atau otomatis batal.
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
          {/*
            Adjie (2026-08-25): "kotak pilih outlet favourite anda di buat
            selebar layar tapi dibagi 2 kotak, sebelah kiri tulisan
            (cikawao, bandung, lihat profil) dan di sebelah kanannya kotak
            gambar... kalau ada outlet baru nanti dibawahnya".
            Jadi: bukan lagi baris yang di-scroll ke samping, tapi daftar
            bertumpuk ke bawah, tiap kartu selebar layar dan dibagi dua —
            teks di kiri, foto tampak depan ruko di kanan.
          */}
          <div className="stack g2">
            {published.map((o) => (
              <Link
                key={o.id}
                href={`/customer/outlets/${o.id}`}
                className="row"
                style={{
                  width: "100%", alignItems: "stretch", gap: 0, borderRadius: "var(--r-md)",
                  overflow: "hidden", background: "var(--bg-surface-2)", border: "1px solid var(--border)",
                }}
              >
                <div className="stack g1" style={{ flex: 1, minWidth: 0, padding: 12, justifyContent: "center" }}>
                  <div className="row g2">
                    <Icon name="map-pin" size={13} style={{ color: "var(--accent)", flexShrink: 0 }} />
                    <span className="small bold truncate" style={{ color: "var(--text-1)" }}>
                      {o.name.replace("Amethyst — ", "")}
                    </span>
                  </div>
                  <span className="tiny dim truncate">{o.city}</span>
                  <span className="tiny row g1" style={{ color: "var(--accent)", marginTop: 2 }}>
                    Lihat profil <Icon name="chevron-right" size={11} />
                  </span>
                </div>

                <div
                  style={{
                    position: "relative", flexShrink: 0, width: "42%", minHeight: 92,
                    background: "var(--bg-surface-3)",
                  }}
                >
                  {o.profile.cover ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={o.profile.cover}
                      alt={`Tampak depan ${o.name}`}
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <div
                      className="stack g1"
                      style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", color: "var(--text-3)" }}
                    >
                      <Icon name="camera" size={16} />
                      <span className="tiny dim">Belum ada foto</span>
                    </div>
                  )}
                </div>
              </Link>
            ))}
            {published.length === 0 && <div className="small dim">Belum ada outlet yang dipublikasikan.</div>}
          </div>
        </div>

        {promos.length > 0 && (
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
        )}

        {(me.favoriteTherapist || me.favoriteService) && (
          <div>
            <div className="m-section">Favorit Anda</div>
            <div className="row g2">
              <div className="m-stat">
                <Icon name="hand-heart" size={16} style={{ color: "var(--accent)", marginBottom: 6 }} />
                <div className="tiny bold truncate" style={{ color: "var(--text-1)" }}>{me.favoriteTherapist || "—"}</div>
                <div className="tiny dim">Terapis favorit</div>
              </div>
              <div className="m-stat">
                <Icon name="sparkles" size={16} style={{ color: "var(--accent)", marginBottom: 6 }} />
                <div className="tiny bold truncate" style={{ color: "var(--text-1)" }}>{me.favoriteService || "—"}</div>
                <div className="tiny dim">Layanan favorit</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </MobileShell>
  );
}
