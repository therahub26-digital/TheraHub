"use client";

import { useMemo, useState } from "react";
import { Badge, PersonCell } from "@/components/ui";
import ManagementReviewEditor from "@/components/ManagementReviewEditor";
import { minutesToHm } from "@/lib/format";
import type { TherapistPerformanceRow } from "@/lib/data/performance";

// ---------------------------------------------------------------------
// Tabel rekap Kinerja Terapis — dipakai dua halaman dengan data yang
// sama persis: /manager/performance (outlet si manager) dan
// /owner/therapists (outlet yang dipilih owner). Kolom-kolomnya persis
// permintaan Adjie 2026-10-15: jumlah tamu / bulan, kehadiran &
// terlambat, ijin sebulan, penilaian customer, dan penilaian manajemen
// bintang 1–5 + keterangan.
//
// Revisi malam 2026-10-15: "dibuat kolom permasing2 kriteria saja,
// tidak usah ditotal, manager bisa sort berdasarkan kriteria" — jadi
// Client Component dengan SORT per kolom (klik judul kolom: ▼ turun →
// ▲ naik → klik kolom lain pindah kriteria) dan TANPA baris/angka
// total gabungan; setiap kriteria berdiri sendiri. Data tetap dihitung
// server-side (lib/data/performance.ts); yang client hanya urutannya.
// ---------------------------------------------------------------------

type SortKey = "name" | "guests" | "attendance" | "late" | "leave" | "customer" | "management";

/** Nilai pembanding per kriteria; null = belum ada data, selalu ditaruh paling bawah apa pun arahnya. */
function sortValue(t: TherapistPerformanceRow, key: SortKey): number | string | null {
  switch (key) {
    case "name": return t.name.toLowerCase();
    case "guests": return t.guests;
    case "attendance": return t.attendancePct;
    case "late": return t.lateMinutesTotal > 0 ? t.lateMinutesTotal : t.lateCount > 0 ? t.lateCount : 0;
    case "leave": return t.leaveSick + t.leaveOff + t.leaveLate;
    case "customer": return t.customerAvg;
    case "management": return t.management?.rating ?? null;
  }
}

function Stars({ value }: { value: number }) {
  const full = Math.round(value);
  return (
    <span style={{ color: "var(--gold)", whiteSpace: "nowrap" }}>
      {"★".repeat(full)}
      <span style={{ color: "var(--text-3)" }}>{"★".repeat(Math.max(0, 5 - full))}</span>
    </span>
  );
}

const HEADERS: { key: SortKey; label: string; numeric?: boolean; title: string }[] = [
  { key: "name", label: "Terapis", title: "Urutkan berdasarkan nama" },
  { key: "guests", label: "Tamu", numeric: true, title: "Urutkan berdasarkan jumlah tamu" },
  { key: "attendance", label: "Kehadiran", title: "Urutkan berdasarkan tingkat kehadiran" },
  { key: "late", label: "Terlambat", title: "Urutkan berdasarkan keterlambatan" },
  { key: "leave", label: "Ijin", title: "Urutkan berdasarkan jumlah ijin" },
  { key: "customer", label: "Penilaian Customer", title: "Urutkan berdasarkan penilaian customer" },
  { key: "management", label: "Penilaian Manajemen", title: "Urutkan berdasarkan penilaian manajemen" },
];

export default function TherapistPerformanceTable({
  rows,
  outletId,
  period,
}: {
  rows: TherapistPerformanceRow[];
  outletId: string;
  period: string;
}) {
  // Default: jumlah tamu terbanyak dulu — kriteria yang paling sering
  // ingin dilihat; satu klik di kolom mana pun memindahkan kriterianya.
  const [sortKey, setSortKey] = useState<SortKey>("guests");
  const [asc, setAsc] = useState(false);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      if (va === null && vb === null) return a.name.localeCompare(b.name);
      if (va === null) return 1; // null selalu di bawah
      if (vb === null) return -1;
      if (typeof va === "string" && typeof vb === "string") {
        return asc ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return asc ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return copy;
  }, [rows, sortKey, asc]);

  function clickHeader(key: SortKey) {
    if (key === sortKey) {
      setAsc(!asc);
    } else {
      setSortKey(key);
      // Nama enak dibaca naik; kriteria angka mulai dari yang terbesar.
      setAsc(key === "name");
    }
  }

  if (rows.length === 0) {
    return <div className="small dim" style={{ textAlign: "center", padding: "20px 0" }}>Tidak ada terapis aktif di outlet ini.</div>;
  }

  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr>
            {HEADERS.map((h) => (
              <th
                key={h.key}
                className={h.numeric ? "num" : undefined}
                style={h.key === "management" ? { textAlign: "right" } : undefined}
              >
                <button
                  onClick={() => clickHeader(h.key)}
                  title={h.title}
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    font: "inherit",
                    color: h.key === sortKey ? "var(--text-1)" : "inherit",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h.label} {h.key === sortKey ? (asc ? "▲" : "▼") : ""}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => (
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
