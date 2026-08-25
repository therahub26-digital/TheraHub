import Link from "next/link";
import { notFound } from "next/navigation";
import Icon from "@/components/Icon";
import { Badge, Avatar, InfoNote } from "@/components/ui";
import MobileShell from "@/components/MobileShell";
import TherapistGalleryGrid from "@/components/TherapistGalleryGrid";
import { getOutletById, getOutlets } from "@/lib/data/outlets";
import { getTherapistsForOutlet } from "@/lib/data/employees";
import { getCurrentCustomer } from "@/lib/data/customers";
import { getTenantTheme } from "@/lib/data/tenant";
import { OUTLETS as MOCK_OUTLETS, outletOf, therapistsOf, therapistDayStatus, DAY_RANGE, TODAY as MOCK_TODAY } from "@/lib/mock";
import { fmtDayShort, fmtDateShort } from "@/lib/format";

// ---------------------------------------------------------------------
// UPDATE 2026-08-22 — migrated the therapist LISTING off mock to real
// data (getTherapistsForOutlet, already dual-mode — built for the staff
// portals in an earlier phase). The mock version's per-day AVAILABLE /
// OFF / CUTI split (therapistDayStatus) is NOT carried over to live mode
// — that reads employee_day_off/employee_leave, and RLS on both tables
// only opens them to staff (via _current_tenant_id()/_current_employee_id(),
// both app_users-only helpers — see supabase/migrations/0002_rls_policies.sql)
// or the therapist themselves, never a customer session. Rather than add
// a new customer-facing RLS policy for a "is this therapist free today"
// read (a real scheduling feature, more than this pass's scope), live
// mode here just lists every real active therapist with an honest note
// that day-by-day availability isn't wired up yet — actual availability
// still gets caught at booking time by the conflict check in
// lib/actions/customerBookings.ts.
// ---------------------------------------------------------------------

export default async function OutletTherapistGalleryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const theme = await getTenantTheme();
  const { id } = await params;
  const customer = await getCurrentCustomer();
  const live = customer !== null;

  const outlets = live ? await getOutlets() : MOCK_OUTLETS;
  if (!outlets.some((o) => o.id === id)) notFound();
  const outlet = live ? await getOutletById(id) : outletOf(id);
  if (!outlet) notFound();

  if (live) {
    const therapists = (await getTherapistsForOutlet(outlet.id)).sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));

    return (
      <MobileShell role="customer" brandKey={theme.brandKey} bgKey={theme.bgKey} title={outlet.name.replace("Amethyst — ", "")} subtitle="Galeri Terapis" showBack>
        <div className="stack g5">
          <div className="m-section">Terapis · {therapists.length}</div>
          {therapists.length > 0 ? (
            <TherapistGalleryGrid
              therapists={therapists.map((t) => ({
                id: t.id,
                name: t.name,
                grade: t.therapistGrade,
                skills: t.skills,
                photoUrl: t.photoUrl,
                galleryUrls: t.galleryUrls,
                bio: t.bio,
                featured: t.featured,
                featuredBadge: t.featuredBadge,
              }))}
            />
          ) : (
            <div className="small dim" style={{ textAlign: "center", padding: "12px 0" }}>Belum ada terapis di outlet ini.</div>
          )}

          <InfoNote tone="info" icon="info" title="Ketersediaan per hari belum tersedia di sini">
            Pilih tanggal & jam langsung saat booking — sistem akan otomatis mengecek bentrok jadwal terapis pada saat itu.
          </InfoNote>

          <Link href={`/customer/book?outlet=${outlet.id}`} className="m-btn m-btn-primary">
            <Icon name="calendar-plus" size={15} /> Booking di Outlet Ini
          </Link>
        </div>
      </MobileShell>
    );
  }

  // ---- demo/"Ganti Role" mock preview below — unchanged from before ----
  const sp = await searchParams;
  const dayOptions = DAY_RANGE.slice(7, 13);
  const date = sp.date && dayOptions.includes(sp.date) ? sp.date : MOCK_TODAY;

  const withStatus = therapistsOf(outlet.id).map((t) => ({ t, status: therapistDayStatus(t.id, date) }));
  const available = withStatus.filter((x) => x.status === "AVAILABLE").sort((a, b) => (b.t.featured ? 1 : 0) - (a.t.featured ? 1 : 0));
  const unavailable = withStatus.filter((x) => x.status !== "AVAILABLE");

  return (
    <MobileShell role="customer" brandKey={theme.brandKey} bgKey={theme.bgKey} title={outlet.name.replace("Amethyst — ", "")} subtitle="Galeri Terapis" showBack>
      <div className="stack g5">
        <div>
          <div className="m-section">Pilih Tanggal</div>
          <div className="row g2" style={{ overflowX: "auto", paddingBottom: 4 }}>
            {dayOptions.map((d) => (
              <Link
                key={d}
                href={`/customer/outlets/${outlet.id}/therapists?date=${d}`}
                className="stack g1"
                style={{
                  minWidth: 54, textAlign: "center", padding: "8px 4px", borderRadius: "var(--r-md)", flexShrink: 0,
                  background: d === date ? "var(--accent-soft)" : "var(--bg-surface-2)",
                  border: `1px solid ${d === date ? "var(--accent)" : "var(--border)"}`,
                }}
              >
                <span className="tiny dim">{d === MOCK_TODAY ? "Hari ini" : fmtDayShort(d)}</span>
                <span className="small bold" style={{ color: d === date ? "var(--accent)" : "var(--text-1)" }}>{d.slice(8)}</span>
              </Link>
            ))}
          </div>
          <div className="tiny dim" style={{ marginTop: 6, lineHeight: 1.6 }}>
            Ketersediaan terapis berbeda tiap hari — terapis punya jadwal libur dan sewaktu-waktu bisa cuti/sakit.
          </div>
        </div>

        <div>
          <div className="m-section">Tersedia · {fmtDateShort(date)} ({available.length})</div>
          {available.length > 0 ? (
            <div className="grid grid-2" style={{ gap: 8 }}>
              {available.map(({ t }) => (
                <div key={t.id} className="stack g2" style={{ padding: 12, borderRadius: "var(--r-md)", background: "var(--bg-surface-2)", border: "1px solid var(--border)" }}>
                  {t.featured && (
                    <div style={{ alignSelf: "flex-start" }}>
                      <Badge tone="gold" icon="star">{t.featuredBadge}</Badge>
                    </div>
                  )}
                  <div className="row g2">
                    <Avatar name={t.name} toneKey={t.avatarTone} size={44} rect />
                    <div style={{ minWidth: 0 }}>
                      <div className="tiny bold truncate" style={{ color: "var(--text-1)" }}>{t.name}</div>
                      <div className="tiny dim">{t.therapistGrade} · ★ {t.rating}</div>
                    </div>
                  </div>
                  <div className="row g1 wrap">
                    {t.skills.slice(0, 2).map((s) => (
                      <span key={s} className="chip" style={{ height: 20, padding: "0 8px", fontSize: 10 }}>{s}</span>
                    ))}
                  </div>
                  {t.featured && t.bio && <div className="tiny muted" style={{ lineHeight: 1.55 }}>{t.bio}</div>}
                </div>
              ))}
            </div>
          ) : (
            <div className="small dim" style={{ textAlign: "center", padding: "12px 0" }}>Tidak ada terapis tersedia pada tanggal ini.</div>
          )}
        </div>

        {unavailable.length > 0 && (
          <div>
            <div className="m-section">Tidak Tersedia ({unavailable.length})</div>
            <div className="stack g2">
              {unavailable.map(({ t, status }) => (
                <div key={t.id} className="m-list-link" style={{ opacity: 0.62 }}>
                  <Avatar name={t.name} toneKey={t.avatarTone} size={34} rect />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="small bold truncate" style={{ color: "var(--text-1)" }}>{t.name}</div>
                    <div className="tiny dim truncate">{t.therapistGrade}</div>
                  </div>
                  <Badge tone={status === "OFF" ? "neutral" : "warning"} icon={status === "OFF" ? "x-circle" : "alert-triangle"}>
                    {status === "OFF" ? "Libur" : "Cuti/Sakit"}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {date !== MOCK_TODAY && (
          <InfoNote tone="warning" icon="alert-triangle" title="Booking tanggal ini perlu konfirmasi ulang">
            Untuk booking selain hari ini, tamu wajib mengonfirmasi ulang pada hari-H — minimal 1 jam sebelum jadwal.
            Bila tidak dikonfirmasi, booking otomatis dianggap batal (lihat kebijakan outlet).
          </InfoNote>
        )}

        <Link href="/customer/book" className="m-btn m-btn-primary">
          <Icon name="calendar-plus" size={15} /> Booking di Outlet Ini
        </Link>
      </div>
    </MobileShell>
  );
}
