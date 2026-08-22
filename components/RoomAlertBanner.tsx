"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { createClient } from "@/lib/supabase/client";
import { resolveRoomAlert } from "@/lib/actions/alerts";
import type { OpenRoomAlert } from "@/lib/data/alerts";

// ---------------------------------------------------------------------
// Real-time "call for help" banner for manager + kasir. Mounted once per
// outlet in app/manager/layout.tsx and app/kasir/layout.tsx (both pass
// `outletId` + the server-fetched initial `alerts` list from
// lib/data/alerts.ts).
//
// Subscribes to Postgres changes on room_alerts via Supabase Realtime,
// scoped to this outlet — RLS (room_alerts_read) is still what actually
// decides which rows this connection is allowed to receive, this filter
// just narrows it further to the outlet this Shell instance is showing.
// On any INSERT/UPDATE, calls router.refresh() so the server-rendered
// `alerts` prop re-fetches with full room/guest/therapist names (a
// realtime payload only carries raw columns, not the joined display
// data). Each row pulses (pulseDanger, app/globals.css) for as long as
// it stays OPEN — this is meant to be impossible to miss, not a
// one-time flash that fades before someone looks up.
// ---------------------------------------------------------------------

export default function RoomAlertBanner({ outletId, alerts }: { outletId: string; alerts: OpenRoomAlert[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`room_alerts:${outletId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_alerts", filter: `outlet_id=eq.${outletId}` },
        () => router.refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outletId]);

  // A short beep on every render where the list grew — not on the first
  // mount (that would beep on every page load whenever an alert is
  // already open, which is noise, not a notification).
  const prevCount = useRef(alerts.length);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      prevCount.current = alerts.length;
      return;
    }
    if (alerts.length > prevCount.current) {
      try {
        const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
      } catch {
        // Audio can fail silently (autoplay policy, no audio device) —
        // the visual banner below is the real notification either way.
      }
    }
    prevCount.current = alerts.length;
  }, [alerts.length]);

  if (alerts.length === 0) return null;

  function resolve(id: string) {
    setResolvingId(id);
    startTransition(async () => {
      await resolveRoomAlert(id);
      setResolvingId(null);
    });
  }

  return (
    <div className="stack g2" style={{ marginBottom: 16 }}>
      {alerts.map((a) => (
        <div
          key={a.id}
          className="row between"
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            background: "rgba(239,68,68,0.16)",
            border: "1px solid var(--danger)",
            animation: "pulseDanger 1.1s ease-in-out infinite",
          }}
        >
          <div className="row g2" style={{ alignItems: "center" }}>
            <Icon name="hand" size={16} style={{ color: "var(--danger)" }} />
            <span className="small bold" style={{ color: "var(--text-1)" }}>
              {a.roomName} minta bantuan
            </span>
            <span className="tiny dim">
              {a.therapistName} · {a.customerName}
            </span>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            disabled={isPending && resolvingId === a.id}
            onClick={() => resolve(a.id)}
          >
            <Icon name="check" size={13} /> {isPending && resolvingId === a.id ? "..." : "Selesai"}
          </button>
        </div>
      ))}
    </div>
  );
}
