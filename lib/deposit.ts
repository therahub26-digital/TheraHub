import type { DepositPolicy } from "@/lib/types";

// ---------------------------------------------------------------------
// Pure deposit-math helpers, split out of lib/data/outlets.ts on
// 2026-08-24 so Client Components can import them directly.
//
// Why this file exists: lib/data/outlets.ts has a top-level import of
// lib/supabase/server.ts (next/headers), which only works in a Server
// Component. Any Client Component that imported calcDeposit/
// formatDepositLabel from lib/data/outlets.ts pulled that server-only
// import into its browser bundle and failed to build — this bit
// components/OutletSettingsEditor.tsx (Gelombang 2) and had already
// forced components/CustomerBookingForm.tsx to keep a hand-duplicated
// copy of the same two functions, with a comment warning it could drift.
//
// These two functions touch nothing but plain data, so they live here,
// in a module with zero server-only imports, and both call sites above
// now import from here instead of duplicating or reaching into
// lib/data/outlets.ts.
//
// Parameter type is deliberately a subset of the 4-5 fields these
// functions actually read (Pick<DepositPolicy, ...>) rather than the
// full DepositPolicy — that lets CustomerBookingForm.tsx's lighter
// DepositPolicyLite (no refundable/appliesTo) satisfy it structurally
// without a cast, while a real DepositPolicy still satisfies it too.
// ---------------------------------------------------------------------

type DepositMathInput = Pick<DepositPolicy, "enabled" | "type" | "value" | "minTicket">;

export function formatDepositLabel(deposit: Pick<DepositPolicy, "enabled" | "type" | "value">): string {
  if (!deposit.enabled) return "Tidak ada deposit";
  return deposit.type === "FIXED" ? `Rp${deposit.value.toLocaleString("id-ID")}` : `${deposit.value}% dari harga layanan`;
}

export function calcDeposit(deposit: DepositMathInput, ticketTotal: number): number {
  if (!deposit.enabled || ticketTotal < deposit.minTicket) return 0;
  const raw = deposit.type === "FIXED" ? deposit.value : (ticketTotal * deposit.value) / 100;
  return Math.round(raw / 1000) * 1000;
}
