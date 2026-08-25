"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { nowIso } from "@/lib/wallclock";

// ---------------------------------------------------------------------
// Sounds an alarm on the therapist session page the instant a session's
// time runs out — replaces the earlier "tolerance minutes" idea the user
// asked to drop in favor of this: no grace window, just a loud/visual
// alert right at zero, then the therapist presses "Selesaikan Sesi" or
// "Ajukan Extension" (both already rendered on the page, just below
// this banner — this component doesn't duplicate them).
//
// Runs its OWN countdown entirely client-side (setInterval, ticking every
// second) rather than trusting the server-rendered `minutesRemaining` on
// SessionRec — that value is only a snapshot as of the last page render,
// and this page has no other live-refresh mechanism, so a therapist who
// leaves the tab open would otherwise never see the alarm fire at all.
//
// TIMEZONE NOTE: `expectedEndIso` and this component's own clock must be
// compared in the SAME frame (see lib/wallclock.ts's header) — both use
// `nowIso()`-style wall-clock-as-UTC strings. Sejak perbaikan 2026-08-25
// (backlog 7.13) `nowIso()` TIDAK lagi membaca local getters mesin: ia
// menggeser +7 jam lalu membaca getUTC*(), jadi hasilnya sama di device
// mana pun. Hitung mundur ini sekarang benar walau HP terapis di-set ke
// WITA/WIT atau timezone lain — bukan lagi asumsi "device harus WIB".
//
// `key={sessionId}` on the call site (or a change in `expectedEndIso`,
// e.g. after an extension is approved) is enough to reset `muted` back
// to false via the effect below, so a later overrun on the same session
// (started fresh, or after an extension quietly runs out too) alarms
// again instead of staying silently muted forever.
// ---------------------------------------------------------------------

function playDefaultBeep() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 660;
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
    // A second, higher-pitched tone right after — reads more like an
    // alarm than a single notification ping.
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.frequency.value = 880;
    gain2.gain.setValueAtTime(0.2, ctx.currentTime + 0.4);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.75);
    osc2.connect(gain2).connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.4);
    osc2.stop(ctx.currentTime + 0.75);
  } catch {
    // Audio can fail silently (autoplay policy, no audio device) — the
    // pulsing visual banner is still shown regardless.
  }
}

export default function SessionAlarm({
  expectedEndIso,
  alarmSoundUrl,
}: {
  expectedEndIso: string | null | undefined;
  alarmSoundUrl?: string | null;
}) {
  const [timeUp, setTimeUp] = useState(false);
  const [muted, setMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const beepTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // A later expected_end (extension approved, or a new session) means
  // "start fresh" — clear both the fired state and any earlier mute.
  useEffect(() => {
    setTimeUp(false);
    setMuted(false);
  }, [expectedEndIso]);

  useEffect(() => {
    if (!expectedEndIso) return;
    const check = () => {
      const remainingMs = new Date(expectedEndIso).getTime() - new Date(nowIso()).getTime();
      setTimeUp(remainingMs <= 0);
    };
    check();
    const id = setInterval(check, 1000);
    return () => clearInterval(id);
  }, [expectedEndIso]);

  // Looping sound while time is up and not muted — custom upload if the
  // outlet has one, otherwise the repeating default beep.
  useEffect(() => {
    if (!timeUp || muted) {
      if (beepTimer.current) {
        clearInterval(beepTimer.current);
        beepTimer.current = null;
      }
      audioRef.current?.pause();
      return;
    }

    if (alarmSoundUrl) {
      const el = audioRef.current;
      if (el) {
        el.loop = true;
        el.play().catch(() => {
          // Autoplay can be blocked before any user gesture on the page —
          // the visual banner still shows, and the "Matikan Alarm" button
          // itself counts as a gesture that would unblock a retry.
        });
      }
      return () => {
        el?.pause();
      };
    }

    playDefaultBeep();
    beepTimer.current = setInterval(playDefaultBeep, 1500);
    return () => {
      if (beepTimer.current) clearInterval(beepTimer.current);
      beepTimer.current = null;
    };
  }, [timeUp, muted, alarmSoundUrl]);

  if (!timeUp) return null;

  return (
    <div
      className="row between"
      style={{
        padding: "12px 16px",
        borderRadius: 10,
        background: "rgba(239,68,68,0.16)",
        border: "1px solid var(--danger)",
        animation: muted ? undefined : "pulseDanger 1.1s ease-in-out infinite",
        marginBottom: 4,
      }}
    >
      <div className="row g2" style={{ alignItems: "center" }}>
        <Icon name="bell-ring" size={18} style={{ color: "var(--danger)" }} />
        <span className="small bold" style={{ color: "var(--text-1)" }}>Waktu Sesi Habis!</span>
      </div>
      {!muted && (
        <button className="btn btn-ghost btn-sm" onClick={() => setMuted(true)}>
          <Icon name="x" size={13} /> Matikan Alarm
        </button>
      )}
      {alarmSoundUrl && <audio ref={audioRef} src={alarmSoundUrl} preload="auto" />}
    </div>
  );
}
