import Link from "next/link";
import { notFound } from "next/navigation";
import Icon from "@/components/Icon";
import { Badge, Avatar, InfoNote } from "@/components/ui";
import MobileShell from "@/components/MobileShell";
import { OUTLETS, outletOf, therapistsOf, therapistDayStatus, DAY_RANGE, TODAY } from "@/lib/mock";
import { fmtDayShort, fmtDateShort } from "@/lib/format";

export default async function OutletTherapistGalleryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { id } = await params;
  if (!OUTLETS.some((o) => o.id === id)) notFound();
  const outlet = outletOf(id);
  const sp = await searchParams;

  const dayOptions = DAY_RANGE.slice(7, 13); // hari ini .. +5 hari
  const date = sp.date && dayOptions.includes(sp.date) ? sp.date : TODAY;

  const withStatus = therapistsOf(outlet.id).map((t) => ({ t, status: therapistDayStatus(t.id, date) }));
  const available = withStatus
    .filter((x) => x.status === "AVAILABLE")
    .sort((a, b) => (b.t.featured ? 1 : 0) - (a.t.featured ? 1 : 0));
  const unavailable = withStatus.filter((x) => x.status !== "AVAILABLE");

  return (
    <MobileShell
      role="customer"
      title={outlet.name.replace("Amethyst — ", "")}
      subtitle="Galeri Terapis"
      showBack
    >
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
                <span className="tiny dim">{d === TODAY ? "Hari ini" : fmtDayShort(d)}</span>
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
                <div
                  key={t.id}
                  className="stack g2"
                  style={{ padding: 12, borderRadius: "var(--r-md)", background: "var(--bg-surface-2)", border: "1px solid var(--border)" }}
                >
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
                  {t.featured && t.bio && (
                    <div className="tiny muted" style={{ lineHeight: 1.55 }}>{t.bio}</div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="small dim" style={{ textAlign: "center", padding: "12px 0" }}>
              Tidak ada terapis tersedia pada tanggal ini.
            </div>
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

        {date !== TODAY && (
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
