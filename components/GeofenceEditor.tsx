"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { Field, InfoNote } from "@/components/ui";
import { setGeofence } from "@/lib/actions/outlets";

// ---------------------------------------------------------------------
// /admin/geofence used to render the real outlet coordinates into
// editable inputs and a radius slider — with no save button anywhere on
// the page. Every adjustment was silently discarded on reload.
//
// This makes those four fields real (backlog 5.3). The radius slider now
// also drives the map preview circle, which previously stayed a fixed
// size no matter what the slider said — arguably the more misleading
// half of the old page, since it looked like feedback.
//
// The five attendance-policy checkboxes on the same page are NOT wired:
// they have no columns on `outlets` at all, so wiring them means a
// migration, and inventing a fake save for them is exactly the behavior
// this change exists to remove.
// ---------------------------------------------------------------------

/** Slider bounds. The action re-validates 20–1000; this is the comfortable range. */
const RADIUS_MIN = 40;
const RADIUS_MAX = 300;

export default function GeofenceEditor({
  outletId,
  outletName,
  lat,
  lng,
  radius,
  accuracy,
}: {
  outletId: string;
  outletName: string;
  lat: number;
  lng: number;
  radius: number;
  accuracy: number;
}) {
  const initial = { lat: String(lat), lng: String(lng), radius, accuracy: String(accuracy) };
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  const dirty =
    v.lat !== saved.lat || v.lng !== saved.lng || v.radius !== saved.radius || v.accuracy !== saved.accuracy;

  // Map the metre radius onto the preview circle so the picture responds
  // to the slider instead of lying about it. 110px was the old hard-coded
  // radius and sits mid-range, so a default outlet looks unchanged.
  const previewR = 46 + ((v.radius - RADIUS_MIN) / (RADIUS_MAX - RADIUS_MIN)) * 96;

  function onSave() {
    setError(null);
    setDone(false);
    startTransition(async () => {
      const result = await setGeofence(outletId, {
        lat: Number.parseFloat(v.lat),
        lng: Number.parseFloat(v.lng),
        geofenceRadius: v.radius,
        accuracyThreshold: Number.parseInt(v.accuracy, 10),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(v);
      setDone(true);
    });
  }

  return (
    <>
      <div
        style={{
          position: "relative", height: 340, margin: "0 20px 20px",
          borderRadius: "var(--r-md)", overflow: "hidden",
          background: "linear-gradient(135deg,#0d1b2a,#132a33)",
        }}
      >
        <svg width="100%" height="100%" viewBox="0 0 400 340" style={{ position: "absolute", inset: 0 }}>
          <defs>
            <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="400" height="340" fill="url(#grid)" />
          <circle cx="200" cy="170" r={previewR} fill="var(--accent)" opacity="0.09" />
          <circle cx="200" cy="170" r={previewR} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.6" />
          <circle cx="200" cy="170" r="7" fill="var(--accent)" stroke="#04140f" strokeWidth="2" />
        </svg>
        <div
          style={{
            position: "absolute", left: 14, bottom: 14, background: "rgba(10,15,24,0.75)",
            padding: "8px 12px", borderRadius: "var(--r-sm)", backdropFilter: "blur(8px)",
          }}
        >
          <div className="tiny bold" style={{ color: "var(--text-1)" }}>{outletName}</div>
          <div className="tiny dim">{v.lat}, {v.lng}</div>
          <div className="tiny dim">radius {v.radius} m</div>
        </div>
      </div>

      <div className="card-body" style={{ paddingTop: 0 }}>
        <div className="grid grid-2">
          <Field label="Latitude">
            <input
              className="input mono"
              value={v.lat}
              disabled={isPending}
              onChange={(e) => setV({ ...v, lat: e.target.value })}
            />
          </Field>
          <Field label="Longitude">
            <input
              className="input mono"
              value={v.lng}
              disabled={isPending}
              onChange={(e) => setV({ ...v, lng: e.target.value })}
            />
          </Field>
          <Field label={`Radius Geofence — ${v.radius} m`} hint="Area valid untuk check-in absensi">
            <input
              className="input"
              type="range"
              min={RADIUS_MIN}
              max={RADIUS_MAX}
              value={v.radius}
              disabled={isPending}
              onChange={(e) => setV({ ...v, radius: Number.parseInt(e.target.value, 10) })}
            />
          </Field>
          <Field label="Accuracy Threshold (meter)" hint="Akurasi GPS device maksimum yang diterima">
            <input
              className="input"
              type="number"
              value={v.accuracy}
              disabled={isPending}
              onChange={(e) => setV({ ...v, accuracy: e.target.value })}
            />
          </Field>
        </div>

        <div className="row g2" style={{ alignItems: "center", marginTop: 12 }}>
          <button className="btn btn-primary btn-sm" disabled={isPending || !dirty} onClick={onSave}>
            <Icon name="save" size={13} /> {isPending ? "Menyimpan…" : "Simpan Geofence"}
          </button>
          {dirty && !isPending && <span className="tiny dim">Ada perubahan yang belum disimpan.</span>}
          {!dirty && done && (
            <span className="tiny" style={{ color: "var(--success)" }}>
              <Icon name="check" size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />
              Tersimpan.
            </span>
          )}
        </div>

        {error && (
          <div className="tiny" style={{ color: "var(--danger)", marginTop: 8 }}>
            <Icon name="alert-triangle" size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />
            {error}
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <InfoNote icon="info">
            Mengubah radius berlaku untuk check-in berikutnya, bukan absensi yang sudah tercatat —
            baris yang terlanjur ditandai &quot;Mencurigakan&quot; tidak dihitung ulang.
          </InfoNote>
        </div>
      </div>
    </>
  );
}
