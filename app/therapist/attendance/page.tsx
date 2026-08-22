import Icon from "@/components/Icon";
import { Badge } from "@/components/ui";
import MobileShell from "@/components/MobileShell";
import AttendanceCheckButton from "@/components/AttendanceCheckButton";
import { ME_THERAPIST, attendanceOf, outletOf } from "@/lib/mock";
import { getSignedInTherapist } from "@/lib/data/commissions";
import { getCurrentOutlet } from "@/lib/data/outlets";
import { getAttendanceHistoryForTherapist } from "@/lib/data/attendance";
import { getEffectiveToday } from "@/lib/data/bookings";
import { fmtTime, fmtDateShort, minutesToHm } from "@/lib/format";

const STATUS_LABEL: Record<string, string> = {
  VALID: "Lokasi Valid", OUTSIDE: "Di Luar Geofence", LOW_ACCURACY: "Akurasi Rendah", SUSPICIOUS: "Mencurigakan",
};

// ---------------------------------------------------------------------
// Live-wired 2026-08-22 — was 100% mock before (the "Check-in Sekarang"
// button had no onClick at all). Same dual-mode convention as every
// other page: a signed-in therapist gets their own real GPS check-in/
// check-out (lib/actions/attendance.ts, lib/data/attendance.ts); the
// demo "Ganti Role" viewer keeps the original mock presentation,
// untouched below.
//
// See lib/actions/attendance.ts's file header for what's honestly in
// scope here (geofence + accuracy validation, not fake-GPS/mock-location
// detection; late-vs-outlet-open-hours, not a real per-therapist shift
// schedule — this database has no shift table at all).
// ---------------------------------------------------------------------

export default async function AttendancePage() {
  const signedIn = await getSignedInTherapist();

  if (signedIn) {
    const [outlet, today] = await Promise.all([getCurrentOutlet(), getEffectiveToday()]);
    const history = await getAttendanceHistoryForTherapist(signedIn.id, signedIn.name, 7);
    const todayRow = history.find((a) => a.date === today);
    const checkedIn = !!todayRow?.checkInAt;
    const checkedOut = !!todayRow?.checkOutAt;

    return (
      <MobileShell role="therapist" title="Absensi GPS" subtitle={outlet.name} avatarName={signedIn.name} avatarTone="teal">
        <div className="stack g4">
          <div
            className="m-card"
            style={{
              textAlign: "center",
              background: checkedIn ? "var(--accent-soft)" : "var(--bg-surface-2)",
              border: `1px solid ${checkedIn ? "var(--accent)" : "var(--border)"}`,
            }}
          >
            <div
              style={{
                width: 108,
                height: 108,
                margin: "6px auto 14px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "radial-gradient(circle, var(--accent-soft) 0%, transparent 72%)",
                border: `2px solid ${checkedIn ? "var(--accent)" : "var(--border-2)"}`,
                position: "relative",
              }}
            >
              <span style={{ position: "absolute", inset: 14, borderRadius: "50%", border: "1px dashed var(--border-2)" }} />
              <Icon name="map-pin-check" size={38} style={{ color: checkedIn ? "var(--accent)" : "var(--text-3)" }} />
            </div>
            <div className="m-title" style={{ marginBottom: 2 }}>
              {checkedOut ? "Absensi Hari Ini Selesai" : checkedIn ? "Anda Sudah Check-in" : "Belum Check-in Hari Ini"}
            </div>
            <div className="tiny dim" style={{ marginBottom: 14 }}>
              {todayRow?.checkInAt
                ? `Pukul ${fmtTime(todayRow.checkInAt)} · ${todayRow.distanceFromGeofence}m dari titik outlet`
                : `Radius geofence ${outlet.geofenceRadius}m dari outlet`}
            </div>
            {!checkedOut && <AttendanceCheckButton mode={checkedIn ? "checkout" : "checkin"} />}
          </div>

          {todayRow && (
            <div className="m-card m-card-tight">
              <div className="m-section">Verifikasi Lokasi &amp; Perangkat</div>
              <div className="stack g2">
                <div className="row between tiny">
                  <span className="muted">Status Lokasi</span>
                  <Badge tone={todayRow.locationStatus === "VALID" ? "success" : todayRow.locationStatus === "LOW_ACCURACY" ? "warning" : "danger"} dot>
                    {STATUS_LABEL[todayRow.locationStatus]}
                  </Badge>
                </div>
                <div className="row between tiny">
                  <span className="muted">Akurasi GPS</span>
                  <span className={todayRow.accuracy > outlet.accuracyThreshold ? "" : "dim"} style={todayRow.accuracy > outlet.accuracyThreshold ? { color: "var(--warning)" } : undefined}>
                    ±{Math.round(todayRow.accuracy)}m (threshold {outlet.accuracyThreshold}m)
                  </span>
                </div>
                <div className="row between tiny">
                  <span className="muted">Jarak dari Outlet</span>
                  <span className="dim">{todayRow.distanceFromGeofence}m</span>
                </div>
                <div className="row between tiny">
                  <span className="muted">Device Binding</span>
                  <span className="dim mono">{todayRow.deviceId}</span>
                </div>
              </div>
            </div>
          )}

          <div className="row g2" style={{ alignItems: "flex-start", padding: "12px 14px", borderRadius: "var(--r-md)", background: "rgba(56,189,248,0.09)", border: "1px solid rgba(56,189,248,0.25)" }}>
            <Icon name="shield-check" size={16} style={{ color: "var(--info)", flexShrink: 0, marginTop: 1 }} />
            <div className="tiny" style={{ lineHeight: 1.6 }}>
              <span className="bold" style={{ color: "var(--info)" }}>Integritas Perangkat: </span>
              <span className="muted">
                Untuk keandalan anti-fake-GPS, absensi terapis direkomendasikan berjalan sebagai aplikasi Android native/wrapper
                dengan mock-location detection, device binding, dan integrity check — bukan PWA murni.
              </span>
            </div>
          </div>

          <div>
            <div className="m-section">Riwayat 7 Hari</div>
            <div className="stack g2">
              {history.length === 0 && <div className="small dim">Belum ada riwayat absensi.</div>}
              {history.map((a) => (
                <div key={a.id} className="m-row">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="small bold" style={{ color: "var(--text-1)" }}>{fmtDateShort(a.date)}</div>
                    <div className="tiny dim">
                      {a.checkInAt ? `${fmtTime(a.checkInAt)} – ${a.checkOutAt ? fmtTime(a.checkOutAt) : "..."}` : "Tidak hadir"}
                      {a.lateMinutes > 0 ? ` · terlambat ${minutesToHm(a.lateMinutes)}` : ""}
                    </div>
                  </div>
                  <Badge tone={a.status === "SUSPICIOUS" ? "danger" : a.status === "LATE" ? "warning" : a.status === "ABSENT" ? "danger" : "success"} dot>
                    {a.status.replace(/_/g, " ")}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      </MobileShell>
    );
  }

  // ---- Demo "Ganti Role" viewer: unchanged mock presentation ----------
  const me = ME_THERAPIST;
  const outlet = outletOf(me.outletId);
  const history = attendanceOf(me.id);
  const today = history[0];
  const checkedIn = today?.status === "CHECKED_IN" || today?.status === "CHECKED_OUT";

  return (
    <MobileShell role="therapist" title="Absensi GPS" subtitle={outlet.name} avatarName={me.name} avatarTone={me.avatarTone}>
      <div className="stack g4">
        <div
          className="m-card"
          style={{
            textAlign: "center",
            background: checkedIn ? "var(--accent-soft)" : "var(--bg-surface-2)",
            border: `1px solid ${checkedIn ? "var(--accent)" : "var(--border)"}`,
          }}
        >
          <div
            style={{
              width: 108,
              height: 108,
              margin: "6px auto 14px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "radial-gradient(circle, var(--accent-soft) 0%, transparent 72%)",
              border: `2px solid ${checkedIn ? "var(--accent)" : "var(--border-2)"}`,
              position: "relative",
            }}
          >
            <span
              style={{
                position: "absolute",
                inset: 14,
                borderRadius: "50%",
                border: "1px dashed var(--border-2)",
              }}
            />
            <Icon name="map-pin-check" size={38} style={{ color: checkedIn ? "var(--accent)" : "var(--text-3)" }} />
          </div>
          <div className="m-title" style={{ marginBottom: 2 }}>
            {checkedIn ? "Anda Sudah Check-in" : "Belum Check-in Hari Ini"}
          </div>
          <div className="tiny dim" style={{ marginBottom: 14 }}>
            {today?.checkInAt ? `Pukul ${fmtTime(today.checkInAt)} · ${today.distanceFromGeofence}m dari titik outlet` : "Radius geofence " + outlet.geofenceRadius + "m dari outlet"}
          </div>
          <button className="m-btn m-btn-primary">
            <Icon name={checkedIn ? "log-out" : "map-pin-check"} size={16} /> {checkedIn ? "Check-out" : "Check-in Sekarang"}
          </button>
        </div>

        {today && (
          <div className="m-card m-card-tight">
            <div className="m-section">Verifikasi Lokasi &amp; Perangkat</div>
            <div className="stack g2">
              <div className="row between tiny">
                <span className="muted">Status Lokasi</span>
                <Badge tone={today.locationStatus === "VALID" ? "success" : today.locationStatus === "LOW_ACCURACY" ? "warning" : "danger"} dot>
                  {STATUS_LABEL[today.locationStatus]}
                </Badge>
              </div>
              <div className="row between tiny">
                <span className="muted">Akurasi GPS</span>
                <span className={today.accuracy > outlet.accuracyThreshold ? "" : "dim"} style={today.accuracy > outlet.accuracyThreshold ? { color: "var(--warning)" } : undefined}>
                  ±{today.accuracy}m (threshold {outlet.accuracyThreshold}m)
                </span>
              </div>
              <div className="row between tiny">
                <span className="muted">Jarak dari Outlet</span>
                <span className="dim">{today.distanceFromGeofence}m</span>
              </div>
              <div className="row between tiny">
                <span className="muted">Mock Location</span>
                <Badge tone={today.locationStatus === "SUSPICIOUS" ? "danger" : "success"} dot>
                  {today.locationStatus === "SUSPICIOUS" ? "Terdeteksi" : "Tidak Terdeteksi"}
                </Badge>
              </div>
              <div className="row between tiny">
                <span className="muted">Device Binding</span>
                <span className="dim mono">{today.deviceId}</span>
              </div>
              <div className="row between tiny">
                <span className="muted">App Version</span>
                <span className="dim">{today.appVersion}</span>
              </div>
            </div>
          </div>
        )}

        <div className="row g2" style={{ alignItems: "flex-start", padding: "12px 14px", borderRadius: "var(--r-md)", background: "rgba(56,189,248,0.09)", border: "1px solid rgba(56,189,248,0.25)" }}>
          <Icon name="shield-check" size={16} style={{ color: "var(--info)", flexShrink: 0, marginTop: 1 }} />
          <div className="tiny" style={{ lineHeight: 1.6 }}>
            <span className="bold" style={{ color: "var(--info)" }}>Integritas Perangkat: </span>
            <span className="muted">
              Untuk keandalan anti-fake-GPS, absensi terapis direkomendasikan berjalan sebagai aplikasi Android native/wrapper
              dengan mock-location detection, device binding, dan integrity check — bukan PWA murni.
            </span>
          </div>
        </div>

        <div>
          <div className="m-section">Riwayat 7 Hari</div>
          <div className="stack g2">
            {history.map((a) => (
              <div key={a.id} className="m-row">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="small bold" style={{ color: "var(--text-1)" }}>{fmtDateShort(a.date)}</div>
                  <div className="tiny dim">
                    {a.checkInAt ? `${fmtTime(a.checkInAt)} – ${a.checkOutAt ? fmtTime(a.checkOutAt) : "..."}` : "Tidak hadir"}
                    {a.lateMinutes > 0 ? ` · terlambat ${a.lateMinutes}m` : ""}
                  </div>
                </div>
                <Badge tone={a.status === "SUSPICIOUS" ? "danger" : a.status === "LATE" ? "warning" : a.status === "ABSENT" ? "danger" : "success"} dot>
                  {a.status.replace(/_/g, " ")}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </div>
    </MobileShell>
  );
}
