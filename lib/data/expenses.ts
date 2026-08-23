import { createClient } from "@/lib/supabase/server";
import { EXPENSES as MOCK_EXPENSES, PETTY_CASH as MOCK_PETTY_CASH } from "@/lib/mock/finance";
import type { ExpenseRec } from "@/lib/types";
// EXPENSE_CATEGORIES moved to lib/constants/expenseCategories.ts (2026-08-23)
// — see that file's header for why. Re-exported here so existing server-side
// importers of this module (app/manager/expenses/page.tsx) don't need to
// change; components/ExpenseEditor.tsx ("use client") imports the constants
// file directly instead, since importing it from here would still pull this
// whole server-only module (next/headers) into the client bundle.
export { EXPENSE_CATEGORIES } from "@/lib/constants/expenseCategories";

// ---------------------------------------------------------------------
// UPDATE 2026-08-23 — /manager/expenses was 100% mock. `expenses` table
// itself already existed since baseline 0001 (with RLS); only petty_cash
// / petty_cash_movements + expenses.approved_by/approved_at/created_at
// were missing, added by 0020_inventory_expenses.sql.
//
// Same session-check dual-mode convention as lib/data/inventory.ts: a
// signed-in staff session sees real data (including a real empty state),
// the demo "Ganti Role" viewer keeps the mock fixtures untouched.
// ---------------------------------------------------------------------

type ExpenseRow = {
  id: string;
  outlet_id: string;
  date: string;
  category: string;
  vendor: string;
  amount: number | string;
  tax: number | string;
  payment_method: string;
  description: string;
  status: ExpenseRec["status"];
  submitted_by: string | null;
  attachment_url: string | null;
};

type PettyCashRow = {
  outlet_id: string;
  balance: number | string;
  limit_amount: number | string;
  custodian_employee_id: string | null;
  last_top_up_at: string | null;
};

export type PettyCash = {
  outletId: string;
  balance: number;
  limit: number;
  custodianName: string;
  lastTopUp: string | null;
};

async function isSignedIn(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user;
}

async function fetchLiveExpenses(outletId: string): Promise<ExpenseRec[] | null> {
  if (!(await isSignedIn())) return null;
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("expenses")
    .select("*, employees:submitted_by(name)")
    .eq("outlet_id", outletId)
    .order("date", { ascending: false });
  if (error) return null;

  return (rows ?? []).map((r: any) => ({
    id: r.id,
    outletId: r.outlet_id,
    date: r.date,
    category: r.category,
    vendor: r.vendor,
    amount: Number(r.amount),
    tax: Number(r.tax),
    paymentMethod: r.payment_method,
    description: r.description,
    status: r.status,
    submittedBy: r.employees?.name ?? "—",
    attachment: !!r.attachment_url,
  }));
}

export async function getExpensesForOutlet(outletId: string): Promise<{ expenses: ExpenseRec[]; live: boolean }> {
  const live = await fetchLiveExpenses(outletId);
  if (live) return { expenses: live, live: true };
  return { expenses: MOCK_EXPENSES.filter((e) => e.outletId === outletId), live: false };
}

export function expenseByCategory(expenses: ExpenseRec[], period: string) {
  const list = expenses.filter((e) => e.date.startsWith(period) && e.status !== "REJECTED" && e.status !== "DRAFT");
  const map: Record<string, number> = {};
  list.forEach((e) => (map[e.category] = (map[e.category] ?? 0) + e.amount));
  return Object.entries(map)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export async function getPettyCash(outletId: string): Promise<{ pettyCash: PettyCash; live: boolean }> {
  if (await isSignedIn()) {
    const supabase = await createClient();
    const { data: row, error } = await supabase
      .from("petty_cash")
      .select("*, employees:custodian_employee_id(name)")
      .eq("outlet_id", outletId)
      .maybeSingle();
    if (!error) {
      const r = row as (PettyCashRow & { employees: { name: string } | null }) | null;
      return {
        pettyCash: {
          outletId,
          balance: r ? Number(r.balance) : 0,
          limit: r ? Number(r.limit_amount) : 0,
          custodianName: r?.employees?.name ?? "Belum ditentukan",
          lastTopUp: r?.last_top_up_at ?? null,
        },
        live: true,
      };
    }
  }

  const mock = MOCK_PETTY_CASH.find((p) => p.outletId === outletId);
  return {
    pettyCash: {
      outletId,
      balance: mock?.balance ?? 0,
      limit: mock?.limit ?? 0,
      custodianName: mock?.custodian ?? "—",
      lastTopUp: mock?.lastTopUp ?? null,
    },
    live: false,
  };
}
