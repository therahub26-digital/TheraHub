"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { saveManagementReview } from "@/lib/actions/reviews";

// ---------------------------------------------------------------------
// Penilaian manajemen per terapis per bulan — bintang 1–5 + keterangan
// (Adjie 2026-10-15). Dipakai di baris tabel Kinerja Terapis (manager &
// owner). Upsert: menyimpan ulang bulan yang sama memperbarui nilai,
// tidak menumpuk. Siapa boleh menilai ditegakkan RLS (manager outlet
// ybs / admin / owner), bukan komponen ini.
// ---------------------------------------------------------------------

export default function ManagementReviewEditor({
  employeeId,
  outletId,
  period,
  initialRating,
  initialNote,
}: {
  employeeId: string;
  outletId: string;
  period: string;
  initialRating: number | null;
  initialNote: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number>(initialRating ?? 0);
  const [note, setNote] = useState(initialNote ?? "");
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <div className="stack g1" style={{ alignItems: "flex-end" }}>
        <div className="row g1" style={{ alignItems: "center" }}>
          {initialRating ? (
            <span className="tiny" style={{ color: "var(--gold)", whiteSpace: "nowrap" }}>
              {"★".repeat(initialRating)}
              <span style={{ color: "var(--text-3)" }}>{"★".repeat(5 - initialRating)}</span>
            </span>
          ) : (
            <span className="tiny dim">Belum dinilai</span>
          )}
          <button
            className="btn btn-quiet btn-icon btn-sm"
            title={initialRating ? "Ubah penilaian manajemen bulan ini" : "Beri penilaian manajemen bulan ini"}
            aria-label="Penilaian manajemen"
            onClick={() => { setRating(initialRating ?? 0); setNote(initialNote ?? ""); setError(null); setOpen(true); }}
          >
            <Icon name="edit" size={13} />
          </button>
        </div>
        {initialNote && (
          <div className="tiny dim truncate" style={{ maxWidth: 200 }} title={initialNote}>{initialNote}</div>
        )}
      </div>
    );
  }

  return (
    <div className="stack g1" style={{ minWidth: 190 }}>
      <div className="row g1" role="radiogroup" aria-label="Bintang 1 sampai 5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} bintang`}
            disabled={isPending}
            onClick={() => setRating(n)}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
              padding: "2px 1px",
              color: n <= rating ? "var(--gold, #eab308)" : "var(--text-3)",
            }}
          >
            ★
          </button>
        ))}
      </div>
      <input
        className="input"
        placeholder="Keterangan (opsional)"
        value={note}
        disabled={isPending}
        onChange={(e) => setNote(e.target.value)}
      />
      {error && <div className="tiny" style={{ color: "var(--danger)" }}>{error}</div>}
      <div className="row g1">
        <button
          className="btn btn-primary btn-sm"
          disabled={isPending || rating < 1}
          title={rating < 1 ? "Pilih jumlah bintang dulu" : undefined}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const r = await saveManagementReview(employeeId, outletId, period, rating, note);
              if (!r.ok) { setError(r.error); return; }
              setOpen(false);
              router.refresh();
            });
          }}
        >
          <Icon name="save" size={12} /> {isPending ? "Menyimpan…" : "Simpan"}
        </button>
        <button className="btn btn-ghost btn-sm" disabled={isPending} onClick={() => setOpen(false)}>Batal</button>
      </div>
    </div>
  );
}
