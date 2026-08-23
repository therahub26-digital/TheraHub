"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { isoDate, monthLabel, fmtDateLong } from "@/lib/format";

// ---------------------------------------------------------------------
// Custom calendar popup for the customer booking date field — added
// 2026-08-23 per user feedback: the native <input type="date"> works
// (min/max already constrain it to the outlet's booking window) but
// looks like a plain text field inside the app's dark phone-mockup
// frame, and it wasn't obvious a calendar was even available when the
// outlet allows booking several days ahead. This renders an explicit
// "tap to open calendar" field instead, with in-range days selectable
// and everything outside [min, max] visibly disabled/dimmed — the whole
// point being the customer can SEE how many days ahead they're allowed
// to book, not just discover it by scrubbing a native picker.
//
// No external date library — the booking window this ever needs to
// cover is capped at 4 days total (today .. H+3, see
// setBookingWindowDays()'s 0-3 constraint), so a from-scratch month grid
// using Date/isoDate (lib/format.ts, same timezone-safe parsing used
// everywhere else in this app) is simpler than pulling in a dependency.
// ---------------------------------------------------------------------

const DOW = ["M", "S", "S", "R", "K", "J", "S"];

function ymOf(iso: string): string {
  return iso.slice(0, 7);
}

export default function DatePickerField({
  value,
  min,
  max,
  onChange,
}: {
  value: string;
  min: string;
  max: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [viewYm, setViewYm] = useState(ymOf(value));
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  function openPicker() {
    setViewYm(ymOf(value));
    setOpen(true);
  }

  const [vy, vm] = viewYm.split("-").map(Number);
  const startWeekday = new Date(vy, vm - 1, 1).getDay(); // 0 = Minggu
  const daysInMonth = new Date(vy, vm, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(isoDate(new Date(vy, vm - 1, d)));

  const canPrev = viewYm > ymOf(min);
  const canNext = viewYm < ymOf(max);

  function shiftMonth(delta: number) {
    const d = new Date(vy, vm - 1 + delta, 1);
    setViewYm(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  return (
    <div ref={wrapRef} style={{ position: "relative", flex: 1 }}>
      <button
        type="button"
        className="input"
        onClick={openPicker}
        style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
      >
        <span className="truncate">{fmtDateLong(value)}</span>
        <Icon name="calendar" size={14} style={{ color: "var(--text-3)", flexShrink: 0, marginLeft: 8 }} />
      </button>

      {open && (
        <div
          className="stack g2"
          style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 40, width: 250,
            background: "var(--bg-surface-1)", border: "1px solid var(--border)", borderRadius: "var(--r-md)",
            padding: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
          }}
        >
          <div className="row between" style={{ alignItems: "center" }}>
            <button type="button" className="btn btn-quiet btn-icon btn-sm" disabled={!canPrev} onClick={() => shiftMonth(-1)} aria-label="Bulan sebelumnya">
              <Icon name="chevron-left" size={14} />
            </button>
            <span className="tiny bold" style={{ color: "var(--text-1)" }}>{monthLabel(viewYm)}</span>
            <button type="button" className="btn btn-quiet btn-icon btn-sm" disabled={!canNext} onClick={() => shiftMonth(1)} aria-label="Bulan berikutnya">
              <Icon name="chevron-right" size={14} />
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {DOW.map((d, i) => (
              <div key={i} className="tiny dim" style={{ textAlign: "center", padding: "2px 0" }}>{d}</div>
            ))}
            {cells.map((iso, i) => {
              if (!iso) return <div key={`blank-${i}`} />;
              const disabled = iso < min || iso > max;
              const selected = iso === value;
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onChange(iso);
                    setOpen(false);
                  }}
                  style={{
                    height: 28, borderRadius: "var(--r-sm)", border: "none", fontSize: 11.5,
                    cursor: disabled ? "default" : "pointer",
                    background: selected ? "var(--accent)" : "transparent",
                    color: disabled ? "var(--text-4)" : selected ? "#04140f" : "var(--text-1)",
                    fontWeight: selected ? 700 : 500,
                  }}
                >
                  {Number(iso.slice(8))}
                </button>
              );
            })}
          </div>

          {min === max && (
            <div className="tiny dim" style={{ textAlign: "center" }}>Outlet ini hanya menerima booking hari ini.</div>
          )}
        </div>
      )}
    </div>
  );
}
