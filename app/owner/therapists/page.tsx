import Link from "next/link";
import { PageHead, Card, CardHead, StatCard, Badge, Avatar, Progress, InfoNote } from "@/components/ui";
import MockDataNotice from "@/components/MockDataNotice";
import TherapistPerformanceTable from "@/components/TherapistPerformanceTable";
import { BarsChart } from "@/components/Charts";
import { THERAPIST_RANKING, outletName, THERAPISTS } from "@/lib/mock";
import { getOutlets, isLiveOutletsData } from "@/lib/data/outlets";
import { getEffectiveToday } from "@/lib/data/bookings";
import { getTherapistPerformance } from "@/lib/data/performance";
import { rp, pct, num, minutesToHm, fmtDateLong } from "@/lib/format";

// ---------------------------------------------------------------------
// Therapist Performance — halaman owner KEDUA yang live (setelah
// Payroll). Dimigrasi 2026-10-15 atas permintaan eksplisit Adjie:
// "feature review kinerja therapis untuk manager dan owner". Tabelnya
// persis tabel /manager/performance (TherapistPerformanceTable), dengan
// satu tambahan: owner bersifat tenant-wide, jadi ada PEMILIH OUTLET
// (?outlet=) — jawaban kecil per-halaman atas keputusan 2.1 (pemilih
// manual, bukan agregat), berlaku untuk halaman ini saja; 6 halaman
// owner lain tetap menunggu keputusan penuh.
//
// Mode demo "Ganti Role" (tanpa sesi) tetap menampilkan konten contoh
// lama (ranking mock) apa adanya, berbanner — konvensi §6.2.
// ---------------------------------------------------------------------

export default async function TherapistPerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ outlet?: string; period?: string }>;
}) {
  const [sp, live] = await Promise.all([searchParams, isLiveOutletsData()]);

  if (live) {
    const [outlets, today] = await Promise.all([getOutlets(), getEffectiveToday()]);
    const currentPeriod = today.slice(0, 7);
    const period = /^\d{4}-\d{2}$/.test(sp.period ?? "") ? (sp.period as string) : currentPeriod;
    const outlet = outlets.find((o) => o.id === sp.outlet) ?? outlets[0];
    const rows = outlet ? await getTherapistPerformance(outlet.id, period, today) : [];

    return (
      <>
        <PageHead
          title="Kinerja Terapis"
          desc="Rekap bulanan per outlet: tamu, kehadiran & terlambat, ijin, penilaian customer, dan penilaian manajemen."
          actions={
            <form method="get" className="row g2" style={{ alignItems: "center" }}>
              {outlet && <input type="hidden" name="outlet" value={outlet.id} />}
              <input type="month" name="period" defaultValue={period} max={currentPeriod} className="input" style={{ width: 160 }} />
              <button type="submit" className="btn btn-primary btn-sm">Tampilkan</button>
            </form>
          }
        />

        {/* Pemilih outlet — owner tenant-wide (lihat header file). */}
        <div className="row g2 wrap" style={{ marginBottom: 16 }}>
          {outlets.map((o) => (
            <Link
              key={o.id}
              href={`/owner/therapists?outlet=${o.id}&period=${period}`}
              className={`btn btn-sm ${o.id === outlet?.id ? "btn-primary" : "btn-ghost"}`}
            >
              {o.name}
            </Link>
          ))}
        </div>

        {outlet ? (
          <>
            <InfoNote icon="info" tone="info" title={`${outlet.name} · periode ${period} · per ${fmtDateLong(today)}`}>
              Kehadiran dihitung terhadap hari kalender yang sudah berjalan dikurangi hari cuti/libur tercatat;
              terlambat dari jam masuk staf outlet ({outlet.workStartTime}). Penilaian customer = bintang yang
              dikirim tamu lewat aplikasi setelah kunjungan dibayar. Penilaian manajemen bisa diisi/diubah dari sini
              maupun oleh manager outlet.
            </InfoNote>

            <Card style={{ marginTop: 20 }}>
              <CardHead title={`Rekap ${period}`} sub={`${rows.length} terapis aktif di ${outlet.name}`} />
              <div className="card-body">
                <TherapistPerformanceTable rows={rows} outletId={outlet.id} period={period} />
              </div>
            </Card>
          </>
        ) : (
          <Card>
            <div className="card-body small dim">Tenant ini belum punya outlet.</div>
          </Card>
        )}
      </>
    );
  }

  // ---- Demo "Ganti Role" viewer: konten contoh lama, apa adanya ------
  const avgUtil = THERAPIST_RANKING.reduce((s, t) => s + t.utilization, 0) / THERAPIST_RANKING.length;
  const avgRating = THERAPIST_RANKING.reduce((s, t) => s + t.rating, 0) / THERAPIST_RANKING.length;
  const totalGuests = THERAPIST_RANKING.reduce((s, t) => s + t.guests, 0);
  const top10 = THERAPIST_RANKING.slice(0, 10).map((t) => ({ name: t.name.split(" ")[0], revenue: t.revenue }));

  return (
    <>
      <PageHead title="Therapist Performance" desc="Ranking, utilization, dan kontribusi revenue seluruh terapis." />

      <MockDataNotice>
        Seluruh angka di halaman ini contoh tampilan. Masuk sebagai owner sungguhan untuk melihat rekap kinerja
        nyata per outlet (tamu, kehadiran, ijin, penilaian customer, dan penilaian manajemen).
      </MockDataNotice>

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Total Terapis" value={THERAPISTS.length} icon="sparkles" toneKey="rose" foot="Seluruh outlet" />
        <StatCard label="Total Tamu Dilayani" value={num(totalGuests)} icon="users" toneKey="teal" foot="Bulan berjalan" />
        <StatCard label="Rata-rata Utilization" value={pct(avgUtil)} icon="gauge" toneKey="sky" foot="Treatment / shift minutes" />
        <StatCard label="Rata-rata Rating" value={avgRating.toFixed(2)} icon="star" toneKey="gold" foot="Dari 5.0" />
      </div>

      <Card style={{ marginBottom: 20 }}>
        <CardHead title="Top 10 Terapis — Revenue Generated" />
        <div className="card-body">
          <BarsChart data={top10} xKey="name" yKey="revenue" height={250} horizontal color="#fb7185" />
        </div>
      </Card>

      <Card>
        <CardHead title="Ranking Lengkap" sub={`${THERAPIST_RANKING.length} terapis`} />
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th><th>Terapis</th><th>Outlet</th><th>Grade</th><th>Tamu</th>
                <th>Menit</th><th>Revenue</th><th>Komisi</th><th>Utilization</th><th>Diminta</th><th>Rating</th>
              </tr>
            </thead>
            <tbody>
              {THERAPIST_RANKING.map((t, i) => (
                <tr key={t.id}>
                  <td className="num dim">{i + 1}</td>
                  <td>
                    <div className="row g2">
                      <Avatar name={t.name} toneKey={t.avatarTone} size={28} />
                      <span className="strong" style={{ color: "var(--text-1)" }}>{t.name}</span>
                    </div>
                  </td>
                  <td className="muted small">{outletName(t.outletId)}</td>
                  <td><Badge tone={t.grade === "Master" ? "gold" : t.grade === "Senior" ? "accent" : "neutral"}>{t.grade}</Badge></td>
                  <td className="num">{t.guests}</td>
                  <td className="num muted">{minutesToHm(t.minutes)}</td>
                  <td className="num strong">{rp(t.revenue, { short: true })}</td>
                  <td className="num muted">{rp(t.commission, { short: true })}</td>
                  <td style={{ width: 120 }}>
                    <div className="row g2">
                      <div style={{ flex: 1 }}><Progress value={t.utilization} /></div>
                      <span className="tiny mono">{Math.round(t.utilization)}%</span>
                    </div>
                  </td>
                  <td className="num muted">{t.requested}×</td>
                  <td className="num">★ {t.rating}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
