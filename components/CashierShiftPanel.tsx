"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { Field, InfoNote } from "@/components/ui";
import { openCashierShift, closeCashierShift, setCashierShiftsPerDay } from "@/lib/actions/cashierShifts";
import { cashVariance, varianceNeedsNote } from "@/lib/cashier-shift-math";
import { rp } from "@/lib/format";

// Angka rupiah diketik bebas ("1.500.000", "1500000", "Rp 1.500.000").
function parseRupiah(s: string): number {
  const digits = s.replace(/[^\d]/g, "");
  return digits ? Number(digits) : Number.NaN;
}

function RupiahInput({
  value,
  onChange,
  disabled,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <input
      className="input"
      inputMode="numeric"
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => {
        const n = parseRupiah(e.target.value);
        onChange(Number.isNaN(n) ? "" : n.toLocaleString("id-ID"));
      }}
    />
  );
}

export function OpenShiftForm({ outletId, shiftNo, shiftsPerDay }: { outletId: string; shiftNo: number; shiftsPerDay: number }) {
  const router = useRouter();
  const [float, setFloat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    const n = parseRupiah(float);
    if (Number.isNaN(n)) {
      setError("Isi modal awal (uang kembalian di laci). Isi 0 kalau tidak ada.");
      return;
    }
    start(async () => {
      const r = await openCashierShift({ outletId, openingFloat: n });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="stack g3">
      <Field
        label={shiftsPerDay === 2 ? `Modal Awal Shift ${shiftNo}` : "Modal Awal (uang kembalian di laci)"}
        hint="Hitung uang di laci sebelum transaksi pertama"
      >
        <RupiahInput value={float} onChange={setFloat} disabled={pending} placeholder="mis. 500.000" />
      </Field>
      {error && <InfoNote tone="danger" icon="alert-triangle">{error}</InfoNote>}
      <button className="btn btn-primary" onClick={submit} disabled={pending}>
        <Icon name="door-open" size={15} /> {pending ? "Membuka…" : `Buka Shift${shiftsPerDay === 2 ? ` ${shiftNo}` : ""}`}
      </button>
    </div>
  );
}

export function CloseShiftForm({ shiftId, expected }: { shiftId: string; expected: number }) {
  const router = useRouter();
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const n = parseRupiah(counted);
  const variance = Number.isNaN(n) ? null : cashVariance(n, expected);
  const needNote = variance !== null && varianceNeedsNote(variance);

  function submit() {
    setError(null);
    if (Number.isNaN(n)) {
      setError("Isi kas hasil hitung fisik di laci.");
      return;
    }
    if (needNote && !note.trim()) {
      setError("Ada selisih — alasan selisih wajib diisi.");
      return;
    }
    start(async () => {
      const r = await closeCashierShift({ shiftId, countedCash: n, varianceNote: note });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="stack g3">
      <Field label="Kas Hasil Hitung Fisik" hint="Hitung semua uang tunai di laci, termasuk modal awal">
        <RupiahInput value={counted} onChange={setCounted} disabled={pending} placeholder="mis. 735.000" />
      </Field>

      {variance !== null && (
        <div
          className="row between"
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            background: "var(--bg-surface-2)",
            color: !needNote ? "var(--success)" : variance < 0 ? "var(--danger)" : "var(--warning)",
          }}
        >
          <span className="small strong">
            {!needNote ? "Kas cocok" : variance < 0 ? "Kas kurang" : "Kas lebih"}
          </span>
          <span className="num strong">{rp(variance, { sign: true })}</span>
        </div>
      )}

      {needNote && (
        <Field label="Alasan Selisih (wajib)" hint="Setiap selisih, kurang maupun lebih, harus dijelaskan — akan direview manager">
          <textarea
            className="input"
            rows={3}
            value={note}
            disabled={pending}
            onChange={(e) => setNote(e.target.value)}
            placeholder="mis. kembalian salah ke tamu Room 03 Rp20.000"
          />
        </Field>
      )}

      {error && <InfoNote tone="danger" icon="alert-triangle">{error}</InfoNote>}

      <button className="btn btn-primary" onClick={submit} disabled={pending}>
        <Icon name="lock" size={15} /> {pending ? "Menutup…" : "Tutup Shift"}
      </button>
      <div className="tiny dim">
        Penjualan dihitung ulang di server saat tombol ditekan, jadi transaksi yang masuk barusan tetap ikut terhitung.
      </div>
    </div>
  );
}

export function ShiftsPerDayEditor({ outletId, value }: { outletId: string; value: 1 | 2 }) {
  const router = useRouter();
  const [v, setV] = useState<1 | 2>(value);
  const [saved, setSaved] = useState<1 | 2>(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setError(null);
    start(async () => {
      const r = await setCashierShiftsPerDay(outletId, v);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSaved(v);
      router.refresh();
    });
  }

  return (
    <div className="stack g3">
      <Field label="Jumlah Shift Kasir per Hari" hint="Berlaku mulai shift berikutnya yang dibuka">
        <select className="select" value={v} disabled={pending} onChange={(e) => setV(Number(e.target.value) === 2 ? 2 : 1)}>
          <option value={1}>1 shift — buka pagi, tutup malam</option>
          <option value={2}>2 shift — pergantian kasir (shift 1 &amp; shift 2)</option>
        </select>
      </Field>
      {error && <InfoNote tone="danger" icon="alert-triangle">{error}</InfoNote>}
      <div className="row g2">
        <button className="btn btn-primary btn-sm" onClick={save} disabled={pending || v === saved}>
          {pending ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
    </div>
  );
}
