"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { Field, Avatar, InfoNote } from "@/components/ui";
import { rp, minutesToHm } from "@/lib/format";
import { createBooking } from "@/lib/actions/bookings";

type PackageOption = { id: string; name: string; durationMin: number; listPrice: number };
type TherapistOption = { id: string; name: string; grade?: string; skills: string[]; photoUrl?: string };

export default function BookingForm({
  outletId,
  today,
  packages,
  therapists,
  source,
  backHref,
}: {
  outletId: string;
  today: string;
  packages: PackageOption[];
  therapists: TherapistOption[];
  source: "Walk-in" | "Kasir";
  backHref: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [packageId, setPackageId] = useState(packages[0]?.id ?? "");
  const [therapistId, setTherapistId] = useState(therapists[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState("10:00");
  const [notes, setNotes] = useState("");

  const selectedPackage = packages.find((p) => p.id === packageId);
  const selectedTherapist = therapists.find((t) => t.id === therapistId);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createBooking({
        outletId,
        customerName,
        customerPhone,
        packageId,
        therapistId,
        date,
        startTime,
        notes,
        source,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/manager/bookings?date=${date}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="col g3" style={{ maxWidth: 560 }}>
      <div className="grid grid-2" style={{ gap: 12 }}>
        <Field label="Nama Tamu">
          <input
            className="input"
            required
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Nama lengkap"
          />
        </Field>
        <Field label="No. Telepon">
          <input
            className="input"
            required
            inputMode="tel"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            placeholder="08xx-xxxx-xxxx"
          />
        </Field>
      </div>

      <Field label="Layanan" hint={selectedPackage ? `${minutesToHm(selectedPackage.durationMin)} · ${rp(selectedPackage.listPrice)}` : undefined}>
        <select className="select" required value={packageId} onChange={(e) => setPackageId(e.target.value)}>
          {packages.length === 0 && <option value="">Belum ada paket untuk outlet ini</option>}
          {packages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {minutesToHm(p.durationMin)}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Terapis">
        <div className="row g2">
          {selectedTherapist && <Avatar name={selectedTherapist.name} photoUrl={selectedTherapist.photoUrl} size={32} />}
          <select className="select" required value={therapistId} onChange={(e) => setTherapistId(e.target.value)} style={{ flex: 1 }}>
          {therapists.length === 0 && <option value="">Belum ada terapis di outlet ini</option>}
          {therapists.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.grade ? ` (${t.grade})` : ""}
            </option>
          ))}
          </select>
        </div>
      </Field>

      <div className="grid grid-2" style={{ gap: 12 }}>
        <Field label="Tanggal">
          <input className="input" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Jam Mulai">
          <input className="input" type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </Field>
      </div>

      <InfoNote icon="info">Room ditentukan kasir saat tamu check-in, tergantung mana yang kosong saat itu.</InfoNote>

      <Field label="Catatan" hint="Opsional — preferensi tamu, kondisi khusus, dsb.">
        <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      {error && (
        <div className="row g2" style={{ color: "var(--danger)", padding: "8px 10px", background: "rgba(239,68,68,0.1)", borderRadius: 8 }}>
          <Icon name="triangle-alert" size={14} />
          <span className="small">{error}</span>
        </div>
      )}

      <div className="row g2">
        <button type="submit" className="btn btn-primary" disabled={isPending || packages.length === 0 || therapists.length === 0}>
          <Icon name="calendar-plus" size={14} /> {isPending ? "Menyimpan…" : "Simpan Booking"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => router.push(backHref)} disabled={isPending}>
          Batal
        </button>
      </div>
    </form>
  );
}
