// ---------------------------------------------------------------------
// Client-safe constant, split out of lib/data/expenses.ts on 2026-08-23.
//
// BUG FIX: components/ExpenseEditor.tsx ("use client") imported
// EXPENSE_CATEGORIES directly from lib/data/expenses.ts — but that file
// also imports createClient from lib/supabase/server (which pulls in
// next/headers, a server-only API). Next.js bundles a client component's
// entire import graph for the browser, so this broke the build outright
// the first time /manager/expenses was opened ("Ecmascript file had an
// error ... next/headers ... That only works in a Server Component").
// EXPENSE_CATEGORIES itself is plain static data with no server
// dependency, so it now lives in its own file both the server-side
// lib/data/expenses.ts and the client-side ExpenseEditor.tsx can import
// without dragging next/headers into the browser bundle.
// ---------------------------------------------------------------------

export const EXPENSE_CATEGORIES = [
  { key: "Rent", example: "Sewa outlet", icon: "building" },
  { key: "Utilities", example: "Listrik, air, internet", icon: "zap" },
  { key: "Payroll", example: "Gaji dan allowance", icon: "wallet" },
  { key: "Commission", example: "Komisi terapis", icon: "percent" },
  { key: "Consumables", example: "Oil, soap, tissue", icon: "droplet" },
  { key: "Laundry", example: "Laundry linen/towel", icon: "shirt" },
  { key: "Marketing", example: "Ads, promo, influencer", icon: "megaphone" },
  { key: "Maintenance", example: "Repair room/equipment", icon: "wrench" },
  { key: "Petty Cash", example: "Transport, ATK", icon: "coins" },
  { key: "Other", example: "Kategori custom tenant", icon: "circle-ellipsis" },
];
