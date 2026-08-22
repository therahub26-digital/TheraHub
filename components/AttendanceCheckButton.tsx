"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { checkIn, checkOut, type ActionResult } from "@/lib/actions/attendance";

// ---------------------------------------------------------------------
// GPS check-in/check-out button for /therapist/attendance (and the
// Beranda "Absensi" card). Same useAction()-style wrapper as
// components/SessionActions.tsx — pending state + error text, all the
// actual rules live server-side in lib/actions/attendance.ts.
//
// The only thing this component owns that the others don't: asking the
// browser for a GPS fix (`navigator.geolocation`) before calling the
// action. Geolocation can fail in ways a plain server action never
// would (permission denied, no fix, insecure context) — each gets its
// own message instead of a generic "gagal".
// ---------------------------------------------------------------------

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Perangkat/browser ini tidak mendukung GPS."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 });
  });
}

function geoErrorMessage(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return "Izin lokasi ditolak — aktifkan izin lokasi untuk browser ini lalu coba lagi.";
    case err.POSITION_UNAVAILABLE:
      return "Lokasi tidak tersedia — pastikan GPS aktif dan coba lagi.";
    case err.TIMEOUT:
      return "Waktu tunggu lokasi habis — coba lagi.";
    default:
      return "Gagal membaca lokasi — coba lagi.";
  }
}

export default function AttendanceCheckButton({ mode }: { mode: "checkin" | "checkout" }) {
  const [isPending, startTransition] = useTransition();
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    if (mode === "checkout") {
      startTransition(async () => {
        const result: ActionResult = await checkOut();
        if (!result.ok) setError(result.error);
      });
      return;
    }

    setLocating(true);
    getPosition()
      .then((pos) => {
        setLocating(false);
        startTransition(async () => {
          const result: ActionResult = await checkIn(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
          if (!result.ok) setError(result.error);
        });
      })
      .catch((err: GeolocationPositionError) => {
        setLocating(false);
        setError(geoErrorMessage(err));
      });
  }

  const busy = locating || isPending;

  return (
    <div>
      <button className="m-btn m-btn-primary" disabled={busy} onClick={run}>
        <Icon name={mode === "checkout" ? "log-out" : "map-pin-check"} size={16} />
        {busy ? (locating ? "Mencari lokasi…" : "Menyimpan…") : mode === "checkout" ? "Check-out" : "Check-in Sekarang"}
      </button>
      {error && (
        <div className="tiny" style={{ color: "var(--danger)", marginTop: 8 }}>
          <Icon name="alert-triangle" size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />
          {error}
        </div>
      )}
    </div>
  );
}
