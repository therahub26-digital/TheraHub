"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { submitCustomerReview } from "@/lib/actions/reviews";

// ---------------------------------------------------------------------
// Tamu menilai satu kunjungan yang sudah dibayar — bintang 1–5 +
// komentar (migrasi 0038), dari /customer/history. Satu kali per
// kunjungan (UNIQUE booking_id di database); setelah terkirim baris
// riwayatnya menampilkan bintang, bukan tombol. Penilaian ini yang
// direkap di halaman Kinerja Terapis manager/owner.
// ---------------------------------------------------------------------

export default function CustomerReviewForm({ bookingId, therapistName }: { bookingId: string; therapistName: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button className="m-btn m-btn-ghost" style={{ marginTop: 8 }} onClick={() => setOpen(true)}>
        <Icon name="star" size={14} /> Beri Penilaian
      </button>
    );
  }

  return (
    <div className="stack g2" style={{ marginTop: 10 }}>
      <div className="tiny dim">Bagaimana pelayanan {therapistName || "terapis Anda"}?</div>
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
              fontSize: 26,
              lineHeight: 1,
              padding: "2px 3px",
              color: n <= rating ? "var(--gold, #eab308)" : "var(--text-3)",
            }}
          >
            ★
          </button>
        ))}
      </div>
      <input
        className="input"
        placeholder="Komentar (opsional)"
        value={comment}
        disabled={isPending}
        onChange={(e) => setComment(e.target.value)}
      />
      {error && (
        <div className="tiny" style={{ color: "var(--danger)" }}>
          <Icon name="alert-triangle" size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />
          {error}
        </div>
      )}
      <div className="row g2">
        <button
          className="m-btn m-btn-primary"
          disabled={isPending || rating < 1}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const r = await submitCustomerReview(bookingId, rating, comment);
              if (!r.ok) { setError(r.error); return; }
              setOpen(false);
              router.refresh();
            });
          }}
        >
          <Icon name="star" size={14} /> {isPending ? "Mengirim…" : "Kirim Penilaian"}
        </button>
        <button className="m-btn m-btn-ghost" disabled={isPending} onClick={() => setOpen(false)}>Batal</button>
      </div>
    </div>
  );
}
