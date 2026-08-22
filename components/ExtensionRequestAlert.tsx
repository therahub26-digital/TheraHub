"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------
// Real-time awareness for kasir/manager when a therapist submits a new
// extension request — requested directly by the user: "kalau butuh
// approval seperti extend waktu harus muncul notifikasi di kasir, supaya
// aware." Mirrors components/RoomAlertBanner.tsx's pattern, with one
// difference forced by the schema: `extension_requests` has no
// `outlet_id` column (see supabase/migrations/0002_rls_policies.sql —
// its RLS scopes SELECT by joining session_id -> sessions.outlet_id
// instead), so this subscribes to the table WITHOUT a `filter:` clause.
// That's still outlet-safe: Supabase Realtime enforces the table's RLS
// per connection (extension_requests_staff), so a kasir/manager only
// ever receives events for requests whose session belongs to their own
// outlet — same guarantee a filtered subscription would give, just
// enforced server-side by RLS instead of by a Realtime column filter.
//
// On any INSERT: router.refresh() so the server-rendered pending list
// and count update without a manual reload. Beeps only when the pending
// count actually grew since the last render (not on first mount — that
// would beep on every page load whenever a request was already
// pending, which is noise). Renders a pulsing banner whenever
// pendingCount > 0 so it stays visible even to someone who wasn't
// looking at this page when the realtime event fired.
// ---------------------------------------------------------------------

export default function ExtensionRequestAlert({ outletId, pendingCount }: { outletId: string; pendingCount: number }) {
  const router = useRouter();
  const isFirstRender = useRef(true);
  const prevCount = useRef(pendingCount);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`extension_requests:${outletId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "extension_requests" }, () => router.refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outletId]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      prevCount.current = pendingCount;
      return;
    }
    if (pendingCount > prevCount.current) {
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AC();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 740;
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
      } catch {
        // Audio can fail silently (autoplay policy, no audio device) —
        // the pulsing banner below is the notification either way.
      }
    }
    prevCount.current = pendingCount;
  }, [pendingCount]);

  if (pendingCount === 0) return null;

  return (
    <div
      className="row g2"
      style={{
        alignItems: "center",
        padding: "10px 14px",
        borderRadius: 10,
        background: "var(--warning-soft)",
        border: "1px solid var(--warning)",
        animation: "pulseDanger 1.4s ease-in-out infinite",
        marginBottom: 16,
      }}
    >
      <Icon name="hourglass" size={16} style={{ color: "var(--warning)" }} />
      <span className="small bold" style={{ color: "var(--text-1)" }}>
        {pendingCount} permintaan extension menunggu persetujuan
      </span>
    </div>
  );
}
