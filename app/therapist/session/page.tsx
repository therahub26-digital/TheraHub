import Icon from "@/components/Icon";
import { Badge, Progress } from "@/components/ui";
import MobileShell from "@/components/MobileShell";
import { CompleteSessionButton, StartSessionButton, RequestExtensionButton, EmergencyAlertButton } from "@/components/SessionActions";
import SessionAlarm from "@/components/SessionAlarm";
import { ME_THERAPIST, sessionsOf, bookingsOf, EXTENSION_REQUESTS, TODAY, NOW_HHMM } from "@/lib/mock";
import { getSignedInTherapist } from "@/lib/data/commissions";
import { getCurrentOutlet } from "@/lib/data/outlets";
import { getSessionForTherapist, getExtensionRequestsForOutlet } from "@/lib/data/sessions";
import { getExtensionsForOutlet } from "@/lib/data/catalog";
import { getBookingsForOutlet, getEffectiveToday, getEffectiveNow } from "@/lib/data/bookings";
import { minutesToHm, fmtTime } from "@/lib/format";

// ---------------------------------------------------------------------
// Live-wired 2026-08-21 (was 100% mock before — the therapist app's own
// buttons had no onClick at all, unlike the kasir/manager side which was
// already wired to lib/actions/sessions.ts via SessionActions.tsx). Same
// dual-mode convention as every other page: a signed-in therapist sees
// their own real session/extension data; the demo "Ganti Role" viewer
// still sees ME_THERAPIST + mock fixtures.
// ---------------------------------------------------------------------

export default async function SessionControlPage() {
  const signedIn = await getSignedInTherapist();
  const me = signedIn ?? ME_THERAPIST;
  const outlet = await getCurrentOutlet();
  const avatarTone = signedIn ? "teal" : ME_THERAPIST.avatarTone;

  if (signedIn) {
    const [active, requests, extensions, today, now] = await Promise.all([
      getSessionForTherapist(me.id),
      getExtensionRequestsForOutlet(outlet.id),
      getExtensionsForOutlet(outlet.id),
      getEffectiveToday(),
      getEffectiveNow(),
    ]);
    // No therapistId on ExtensionRequest (see lib/data/sessions.ts) — matched
    // by name, same as the mock fixture this page used to filter by.
    const myExtensions = requests.filter((r) => r.therapistName === me.name);

    if (!active) {
      const todaysBookings = await getBookingsForOutlet(outlet.id, today);
      const nextJob = todaysBookings
        .filter((b) => b.therapistId === me.id && ["ARRIVED", "CHECKED_IN"].includes(b.status))
        .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart))[0];

      return (
        <MobileShell role="therapist" title="Sesi Aktif" subtitle={`Pukul ${now}`} avatarName={me.name} avatarTone={avatarTone}>
          <div className="stack g4">
            <div className="m-card" style={{ textAlign: "center", padding: "32px 16px" }}>
              <Icon name="timer" size={30} style={{ color: "var(--text-4)", marginBottom: 10 }} />
              <div className="m-title" style={{ marginBottom: 4 }}>Tidak Ada Sesi Aktif</div>
              <div className="tiny dim">Mulai sesi baru saat tamu sudah check-in dan siap dilayani.</div>
            </div>

            {nextJob ? (
              <div className="m-card m-card-tight">
                <div className="m-section">Job Berikutnya</div>
                <div className="row between" style={{ marginBottom: 10 }}>
                  <div>
                    <div className="small bold" style={{ color: "var(--text-1)" }}>{nextJob.customerName}</div>
                    <div className="tiny dim">{nextJob.packageName} · {nextJob.roomName}</div>
                  </div>
                  <span className="tiny bold" style={{ color: "var(--accent)" }}>{fmtTime(nextJob.scheduledStart)}</span>
                </div>
                <StartSessionButton bookingId={nextJob.id} />
              </div>
            ) : (
              <div className="small dim" style={{ textAlign: "center" }}>Tidak ada job yang siap dimulai saat ini.</div>
            )}
          </div>
        </MobileShell>
      );
    }

    return (
      <MobileShell role="therapist" title="Sesi Aktif" subtitle={active.bookingCode} avatarName={me.name} avatarTone={avatarTone}>
        <div className="stack g4">
          <SessionAlarm key={active.id} expectedEndIso={active.expectedEndIso} alarmSoundUrl={outlet.alarmSoundUrl} />

          <div className="m-card" style={{ textAlign: "center", background: "var(--accent-soft)", border: "1px solid var(--accent)" }}>
            <Badge tone={active.status === "ENDING_SOON" ? "warning" : "accent"} dot lg>
              {active.status === "ENDING_SOON" ? "Akan Berakhir" : "Sesi Berjalan"}
            </Badge>
            <div style={{ margin: "16px 0 6px", fontFamily: "var(--font-display)", fontSize: 40, fontWeight: 700, color: "var(--text-1)" }}>
              {active.minutesRemaining}
              <span style={{ fontSize: 16, fontWeight: 600, color: "var(--text-3)" }}> menit tersisa</span>
            </div>
            <Progress value={active.progressPct} tone={active.status === "ENDING_SOON" ? "warn" : undefined} />
            <div className="tiny dim" style={{ marginTop: 10 }}>
              Mulai {active.actualStart} · Estimasi selesai {active.expectedEnd}
              {active.extensionMinutes > 0 && ` · +${active.extensionMinutes}m extension`}
            </div>
          </div>

          <div className="m-card m-card-tight">
            <div className="m-section">Detail Tamu</div>
            <div className="stack g2">
              <div className="row between tiny"><span className="muted">Tamu</span><span style={{ color: "var(--text-1)" }}>{active.customerName}</span></div>
              <div className="row between tiny"><span className="muted">Layanan</span><span style={{ color: "var(--text-1)" }}>{active.packageName}</span></div>
              <div className="row between tiny"><span className="muted">Room</span><span style={{ color: "var(--text-1)" }}>{active.roomName}</span></div>
              <div className="row between tiny"><span className="muted">Durasi Dibeli</span><span style={{ color: "var(--text-1)" }}>{minutesToHm(active.purchasedDurationMin)}</span></div>
            </div>
          </div>

          <div className="stack g2">
            <CompleteSessionButton sessionId={active.id} block />
            <RequestExtensionButton sessionId={active.id} extensions={extensions.filter((e) => e.active)} />
            <EmergencyAlertButton bookingId={active.bookingId} />
          </div>

          {myExtensions.length > 0 && (
            <div>
              <div className="m-section">Riwayat Extension</div>
              <div className="stack g2">
                {myExtensions.map((r) => (
                  <div key={r.id} className="m-row">
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="tiny bold" style={{ color: "var(--text-1)" }}>{r.extensionName}</div>
                      <div className="tiny dim">{r.bookingCode} · {r.customerName}</div>
                    </div>
                    <Badge tone={r.status === "PENDING" ? "warning" : r.status === "APPROVED" ? "success" : "danger"}>{r.status}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </MobileShell>
    );
  }

  // ---- Demo "Ganti Role" viewer: unchanged mock presentation ----------
  // (signedIn is null here, so `me` above already equals ME_THERAPIST.)
  const active = sessionsOf(ME_THERAPIST.outletId).find((s) => s.therapistId === me.id && (s.status === "ACTIVE" || s.status === "ENDING_SOON"));
  const myExtensions = EXTENSION_REQUESTS.filter((r) => r.therapistName === me.name);
  const nextJob = bookingsOf(ME_THERAPIST.outletId, TODAY)
    .filter((b) => b.therapistId === me.id && ["ARRIVED", "CHECKED_IN"].includes(b.status))
    .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart))[0];

  if (!active) {
    return (
      <MobileShell role="therapist" title="Sesi Aktif" subtitle={`Pukul ${NOW_HHMM}`} avatarName={me.name} avatarTone={ME_THERAPIST.avatarTone}>
        <div className="stack g4">
          <div className="m-card" style={{ textAlign: "center", padding: "32px 16px" }}>
            <Icon name="timer" size={30} style={{ color: "var(--text-4)", marginBottom: 10 }} />
            <div className="m-title" style={{ marginBottom: 4 }}>Tidak Ada Sesi Aktif</div>
            <div className="tiny dim">Mulai sesi baru saat tamu sudah check-in dan siap dilayani.</div>
          </div>

          {nextJob ? (
            <div className="m-card m-card-tight">
              <div className="m-section">Job Berikutnya</div>
              <div className="row between" style={{ marginBottom: 10 }}>
                <div>
                  <div className="small bold" style={{ color: "var(--text-1)" }}>{nextJob.customerName}</div>
                  <div className="tiny dim">{nextJob.packageName} · {nextJob.roomName}</div>
                </div>
                <span className="tiny bold" style={{ color: "var(--accent)" }}>{fmtTime(nextJob.scheduledStart)}</span>
              </div>
              <button className="m-btn m-btn-primary" disabled title="Mode demo — masuk sebagai terapis untuk benar-benar memulai sesi."><Icon name="play" size={15} /> Mulai Sesi</button>
            </div>
          ) : (
            <div className="small dim" style={{ textAlign: "center" }}>Tidak ada job yang siap dimulai saat ini.</div>
          )}
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell role="therapist" title="Sesi Aktif" subtitle={active.bookingCode} avatarName={me.name} avatarTone={ME_THERAPIST.avatarTone}>
      <div className="stack g4">
        <div className="m-card" style={{ textAlign: "center", background: "var(--accent-soft)", border: "1px solid var(--accent)" }}>
          <Badge tone={active.status === "ENDING_SOON" ? "warning" : "accent"} dot lg>
            {active.status === "ENDING_SOON" ? "Akan Berakhir" : "Sesi Berjalan"}
          </Badge>
          <div style={{ margin: "16px 0 6px", fontFamily: "var(--font-display)", fontSize: 40, fontWeight: 700, color: "var(--text-1)" }}>
            {active.minutesRemaining}
            <span style={{ fontSize: 16, fontWeight: 600, color: "var(--text-3)" }}> menit tersisa</span>
          </div>
          <Progress value={active.progressPct} tone={active.status === "ENDING_SOON" ? "warn" : undefined} />
          <div className="tiny dim" style={{ marginTop: 10 }}>
            Mulai {active.actualStart} · Estimasi selesai {active.expectedEnd}
            {active.extensionMinutes > 0 && ` · +${active.extensionMinutes}m extension`}
          </div>
        </div>

        <div className="m-card m-card-tight">
          <div className="m-section">Detail Tamu</div>
          <div className="stack g2">
            <div className="row between tiny"><span className="muted">Tamu</span><span style={{ color: "var(--text-1)" }}>{active.customerName}</span></div>
            <div className="row between tiny"><span className="muted">Layanan</span><span style={{ color: "var(--text-1)" }}>{active.packageName}</span></div>
            <div className="row between tiny"><span className="muted">Room</span><span style={{ color: "var(--text-1)" }}>{active.roomName}</span></div>
            <div className="row between tiny"><span className="muted">Durasi Dibeli</span><span style={{ color: "var(--text-1)" }}>{minutesToHm(active.purchasedDurationMin)}</span></div>
          </div>
        </div>

        <div className="stack g2">
          <button className="m-btn m-btn-primary" disabled title="Mode demo — masuk sebagai terapis untuk benar-benar menutup sesi."><Icon name="check" size={15} /> Selesaikan Sesi</button>
          <button className="m-btn m-btn-ghost" disabled title="Mode demo — masuk sebagai terapis untuk mengajukan extension."><Icon name="hourglass" size={15} /> Ajukan Extension</button>
        </div>

        {myExtensions.length > 0 && (
          <div>
            <div className="m-section">Riwayat Extension</div>
            <div className="stack g2">
              {myExtensions.map((r) => (
                <div key={r.id} className="m-row">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="tiny bold" style={{ color: "var(--text-1)" }}>{r.extensionName}</div>
                    <div className="tiny dim">{r.bookingCode} · {r.customerName}</div>
                  </div>
                  <Badge tone={r.status === "PENDING" ? "warning" : r.status === "APPROVED" ? "success" : "danger"}>{r.status}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </MobileShell>
  );
}
