"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { setBookingWindowDays } from "@/lib/actions/outlets";

// ---------------------------------------------------------------------
// Manager-facing control for how many days ahead the Customer App lets a
// guest book — added 2026-08-22 per user request. Default (0) means
// same-day only, matching the app's behavior before this feature existed
// — nothing changes for an outlet until a manager explicitly widens it,
// capped at 3 days (see the migration's check constraint for the hard
// limit; this UI only offers 0-3 to begin with).
// ---------------------------------------------------------------------

const OPTIONS = [
  { value: 0, label: "Hanya hari-H" },
  { value: 1, label: "H-1 (besok)" },
  { value: 2, label: "H-2" },
  { value: 3, label: "H-3 (maksimal)" },
];

export default function BookingWindowSetting({ outletId, currentDays }: { outletId: string; currentDays: number }) {
  const [days, setDays] = useState(currentDays);
  const [saved, setSaved] = useState(currentDays);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSave() {
    setError(null);
    startTransition(async () => {
      const result = await setBookingWindowDays(outletId, days);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(days);
    });
  }

  return (
    <div className="stack g3">
      <div className="small dim">
        Tamu bisa memesan mulai dari hari ini sampai maksimal berapa hari ke depan lewat Customer App.
      </div>
      <div className="row g2 wrap">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`chip ${days === o.value ? "on" : ""}`}
            onClick={() => setDays(o.value)}
            disabled={isPending}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="row g2" style={{ alignItems: "center" }}>
        <button className="btn btn-primary btn-sm" disabled={isPending || days === saved} onClick={onSave}>
          <Icon name="save" size={13} /> {isPending ? "Menyimpan…" : "Simpan"}
        </button>
        {days === saved && (
          <span className="tiny dim">
            Saat ini: {OPTIONS.find((o) => o.value === saved)?.label ?? `${saved} hari`}
          </span>
        )}
      </div>
      {error && (
        <div className="tiny" style={{ color: "var(--danger)" }}>
          <Icon name="alert-triangle" size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />
          {error}
        </div>
      )}
    </div>
  );
}
