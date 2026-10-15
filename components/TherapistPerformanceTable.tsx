import { Badge, PersonCell } from "@/components/ui";
import ManagementReviewEditor from "@/components/ManagementReviewEditor";
import { minutesToHm } from "@/lib/format";
import type { TherapistPerformanceRow } from "@/lib/data/performance";

// ---------------------------------------------------------------------
// Tabel rekap Kinerja Terapis — dipakai dua halaman dengan data yang
// sama persis: /manager/performance (outlet si manager) dan
// /owner/therapists (outlet yang dipilih owner). Server Component;
// satu-satunya bagian interaktif adalah editor penilaian manajemen per
// baris (client). Kolom-kolomnya persis permintaan Adjie 2026-10-15:
// jumlah tamu / bulan, kehadiran & terlambat, ijin sebulan, penilaian
// customer, dan penilaian manajemen bintang 1–5 + keterangan.
// ---------------------------------------------------------------------

function Stars({ value }: { value: number }) {
  const full = Math.round(value);
  return (
    <span style={{ color: "var(--gold)", whiteSpace: "nowrap" }}>
      {"★".repeat(full)}
      <span style={{ color: "var(--text-3)" }}>{"★".repeat(Math.max(0, 5 - full))}</span>
    </span>
  );
}

export default function TherapistPerformanceTable({
  rows,
  outletId,
  period,
}: {
  rows: TherapistPerformanceRow[];
  outletId: string;
  period: string;
}) {
  if (rows.length === 0) {
    return <div className="small dim" style={{ textAlign: "center", padding: "20px 0" }}>Tidak ada terapis aktif di outlet ini.</div>;
  }

  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Terapis</th>
            <th className="num">Tamu</th>
            <th>Kehadiran</th>
            <th>Terlambat</th>
            <th>Ijin</th>
            <th>Penilaian Customer</th>
            <th style={{ textAlign: "right" }}>Penilaian Manajemen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id}>
              <td>
                <PersonCell name={t.name} sub={t.code} toneKey={t.avatarTone} photoUrl={t.photoUrl ?? undefined} size={30} />
              </td>
              <td className="num strong">{t.guests}</td>
              <td>
                {t.expectedDays > 0 ? (
                  <span className="small">
                    <span className="strong" style={{ color: "var(--text-1)" }}>{t.presentDays}/{t.expectedDays} hari</span>{" "}
                    <span className="tiny dim">({Math.min(100, Math.round(t.attendancePct ?? 0))}%)</span>
                  </span>
                ) : (
                  <span className="tiny dim">Belum ada hari berjalan</span>
                )}
              </td>
              <td>
                {t.lateCount > 0 ? (
                  <Badge tone="warning">{t.lateCount}× · {minutesToHm(t.lateMinutesTotal)}</Badge>
                ) : (
                  <span className="tiny dim">—</span>
                )}
              </td>
              <td>
                {t.leaveSick + t.leaveOff + t.leaveLate > 0 ? (
                  <span className="tiny">
                    {t.leaveSick > 0 && <Badge tone="warning">Sakit/Cuti {t.leaveSick}</Badge>}{" "}
                    {t.leaveOff > 0 && <Badge tone="neutral">Libur {t.leaveOff}</Badge>}{" "}
                    {t.leaveLate > 0 && <Badge tone="info">Masuk Siang {t.leaveLate}</Badge>}
                  </span>
                ) : (
                  <span className="tiny dim">—</span>
                )}
              </td>
              <td>
                {t.customerAvg !== null ? (
                  <span className="small">
                    <Stars value={t.customerAvg} />{" "}
                    <span className="tiny dim">{t.customerAvg.toFixed(2)} · {t.customerCount} penilaian</span>
                  </span>
                ) : (
                  <span className="tiny dim">Belum ada penilaian</span>
                )}
              </td>
              <td style={{ textAlign: "right" }}>
                <ManagementReviewEditor
                  employeeId={t.id}
                  outletId={outletId}
                  period={period}
                  initialRating={t.management?.rating ?? null}
                  initialNote={t.management?.note ?? null}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
