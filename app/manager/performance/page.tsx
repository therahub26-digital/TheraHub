import { PageHead, Card, CardHead, InfoNote } from "@/components/ui";
import MockDataNotice from "@/components/MockDataNotice";
import PrintButton from "@/components/PrintButton";
import TherapistPerformanceTable from "@/components/TherapistPerformanceTable";
import { getCurrentOutlet, isLiveOutletsData } from "@/lib/data/outlets";
import { getEffectiveToday } from "@/lib/data/bookings";
import { getTherapistPerformance } from "@/lib/data/performance";
import { fmtDateLong } from "@/lib/format";

// ---------------------------------------------------------------------
// Kinerja Terapis — sisi MANAGER (outlet milik sesi login). Permintaan
// Adjie 2026-10-15: review kinerja terapis per bulan dari jumlah tamu,
// kehadiran & keterlambatan, ijin, dan penilaian customer — plus
// penilaian manajemen bintang 1–5 + keterangan. Owner mendapat tabel
// yang sama di /owner/therapists dengan pemilih outlet.
//
// Semua angka dihitung saat halaman dibuka (§6.4) dari tabel yang
// sudah ada; pemilih bulan adalah form GET biasa (?period=YYYY-MM) —
// tanpa state client. Mode demo "Ganti Role" (tanpa sesi) tidak diberi
// angka karangan: hanya banner yang menjelaskan halaman ini butuh
// login sungguhan (§6.3 — angka tanpa sumber tidak ditampilkan).
// ---------------------------------------------------------------------

export default async function ManagerPerformancePage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const [sp, outlet, today, live] = await Promise.all([
    searchParams,
    getCurrentOutlet(),
    getEffectiveToday(),
    isLiveOutletsData(),
  ]);
  const currentPeriod = today.slice(0, 7);
  const period = /^\d{4}-\d{2}$/.test(sp.period ?? "") ? (sp.period as string) : currentPeriod;

  if (!live) {
    return (
      <>
        <PageHead title="Kinerja Terapis" desc="Rekap bulanan per terapis: tamu, kehadiran, ijin, penilaian customer, dan penilaian manajemen." />
        <MockDataNotice title="Halaman ini hanya berisi data sungguhan">
          Rekap kinerja dihitung dari absensi, booking, keterangan, dan penilaian customer yang nyata —
          tidak ada versi contohnya. Masuk sebagai manager untuk melihat angka outlet Anda.
        </MockDataNotice>
      </>
    );
  }

  const rows = await getTherapistPerformance(outlet.id, period, today);

  return (
    <>
      <PageHead
        title="Kinerja Terapis"
        desc={`${outlet.name} · rekap bulanan: tamu, kehadiran & terlambat, ijin, penilaian customer, penilaian manajemen.`}
        actions={
          <form method="get" className="row g2" style={{ alignItems: "center" }}>
            <input type="month" name="period" defaultValue={period} max={currentPeriod} className="input" style={{ width: 160 }} />
            <button type="submit" className="btn btn-primary btn-sm">Tampilkan</button>
            <PrintButton label="Cetak / Simpan PDF" />
          </form>
        }
      />

      <InfoNote icon="info" tone="info" title={`Periode ${period} · per ${fmtDateLong(today)}`}>
        Kehadiran dihitung terhadap hari kalender bulan ini yang sudah berjalan, dikurangi hari cuti/libur yang
        tercatat — belum ada roster shift per orang, jadi terapis dengan jadwal tidak penuh terlihat lebih rendah
        dari seharusnya. Terlambat dihitung dari jam masuk staf outlet ({outlet.workStartTime}). Penilaian customer
        berasal dari bintang yang dikirim tamu lewat aplikasi setelah kunjungan dibayar.
      </InfoNote>

      <Card style={{ marginTop: 20 }}>
        <CardHead title={`Rekap ${period}`} sub={`${rows.length} terapis aktif · penilaian manajemen bintang 1–5 bisa diisi langsung di tabel`} />
        <div className="card-body">
          <TherapistPerformanceTable rows={rows} outletId={outlet.id} period={period} />
        </div>
      </Card>
    </>
  );
}
