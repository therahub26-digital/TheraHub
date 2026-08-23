"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nowIso, todayIsoDate } from "@/lib/wallclock";
import type { Product } from "@/lib/types";

// ---------------------------------------------------------------------
// Write side for /manager/inventory — new 2026-08-23, paired with
// lib/data/inventory.ts. Requires migration 0020_inventory_expenses.sql
// for purchase_orders/stock_transfers/stock_opnames (products/
// product_stocks/stock_movements already existed since baseline 0001).
//
// Every action here runs via createClient() (the signed-in user's
// client, RLS-enforced), never the service-role client — same rule as
// every other action file in this codebase.
//
// Stock is ALWAYS moved through two writes together: a stock_movements
// row (the audit trail) and a product_stocks upsert (the current
// balance). Never one without the other — see each action's comment for
// exactly which pair it writes.
// ---------------------------------------------------------------------

export type ActionResult = { ok: true } | { ok: false; error: string };

// stock_movements.posted_by references app_users(id); purchase_orders/
// stock_transfers/stock_opnames.created_by|counted_by|posted_by (this
// migration's own tables) reference employees(id) — two DIFFERENT ids
// for the same signed-in person, same pattern lib/actions/payroll.ts
// already uses for payroll_adjustments vs app_users. Resolved together
// here so every action below does one lookup instead of two.
async function resolveIdentity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  authUserId: string
): Promise<{ appUserId: string | null; employeeId: string | null }> {
  const { data } = await supabase.from("app_users").select("id, employee_id").eq("auth_user_id", authUserId).maybeSingle();
  return { appUserId: data?.id ?? null, employeeId: data?.employee_id ?? null };
}

async function nextCode(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  scopeColumn: string,
  scopeValue: string,
  prefix: string
): Promise<string> {
  const { count } = await supabase.from(table).select("id", { count: "exact", head: true }).eq(scopeColumn, scopeValue);
  const n = (count ?? 0) + 1;
  const ym = todayIsoDate().slice(0, 7).replace("-", "");
  return `${prefix}-${ym}-${String(n).padStart(3, "0")}`;
}

async function adjustStock(
  supabase: Awaited<ReturnType<typeof createClient>>,
  outletId: string,
  productId: string,
  deltaQty: number
): Promise<void> {
  const { data: existing } = await supabase
    .from("product_stocks")
    .select("qty")
    .eq("outlet_id", outletId)
    .eq("product_id", productId)
    .maybeSingle();
  const newQty = Number(existing?.qty ?? 0) + deltaQty;
  await supabase
    .from("product_stocks")
    .upsert({ outlet_id: outletId, product_id: productId, qty: newQty }, { onConflict: "outlet_id,product_id" });
}

// ============================================================= PRODUCT

export type CreateProductInput = {
  tenantId: string;
  sku: string;
  name: string;
  category: Product["category"];
  uom: string;
  costPrice: number;
  sellPrice: number | null;
  minStock: number;
};

export async function createProduct(input: CreateProductInput): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  if (!input.sku.trim() || !input.name.trim()) return { ok: false, error: "SKU dan nama produk wajib diisi." };
  if (input.costPrice < 0 || (input.sellPrice !== null && input.sellPrice < 0)) {
    return { ok: false, error: "Harga tidak boleh negatif." };
  }

  const { error } = await supabase.from("products").insert({
    tenant_id: input.tenantId,
    sku: input.sku.trim().toUpperCase(),
    name: input.name.trim(),
    category: input.category,
    uom: input.uom.trim() || "pcs",
    cost_price: input.costPrice,
    sell_price: input.sellPrice,
    track_stock: true,
    min_stock: input.minStock,
  });
  if (error) {
    const dup = error.code === "23505";
    return { ok: false, error: dup ? "SKU sudah dipakai produk lain." : "Gagal menyimpan produk." };
  }

  revalidatePath("/manager/inventory");
  return { ok: true };
}

// ======================================================= PURCHASE ORDER

export type CreatePurchaseOrderInput = {
  outletId: string;
  supplier: string;
  orderDate: string;
  expectedDate: string | null;
  notes: string;
  items: { productId: string; qty: number; unitCost: number }[];
};

export async function createPurchaseOrder(input: CreatePurchaseOrderInput): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  if (!input.supplier.trim()) return { ok: false, error: "Nama supplier wajib diisi." };
  const items = input.items.filter((i) => i.productId && i.qty > 0);
  if (items.length === 0) return { ok: false, error: "Tambahkan minimal 1 item dengan qty > 0." };

  const { employeeId } = await resolveIdentity(supabase, user.id);
  const code = await nextCode(supabase, "purchase_orders", "outlet_id", input.outletId, "PO");
  const totalAmount = items.reduce((s, i) => s + i.qty * i.unitCost, 0);

  const { data: po, error } = await supabase
    .from("purchase_orders")
    .insert({
      outlet_id: input.outletId,
      code,
      supplier: input.supplier.trim(),
      status: "ORDERED",
      order_date: input.orderDate,
      expected_date: input.expectedDate || null,
      total_amount: totalAmount,
      notes: input.notes.trim() || null,
      created_by: employeeId,
    })
    .select("id")
    .single();
  if (error || !po) return { ok: false, error: "Gagal membuat purchase order." };

  const { error: itemsError } = await supabase.from("purchase_order_items").insert(
    items.map((i) => ({
      purchase_order_id: po.id,
      product_id: i.productId,
      qty_ordered: i.qty,
      unit_cost: i.unitCost,
    }))
  );
  if (itemsError) return { ok: false, error: "PO tersimpan tapi item gagal disimpan — hubungi admin." };

  revalidatePath("/manager/inventory");
  return { ok: true };
}

/**
 * Menerima PO sepenuhnya (qty_received = qty_ordered untuk semua item).
 * Posts PURCHASE_RECEIPT ke stock_movements + menambah product_stocks,
 * per item. Penerimaan sebagian (partial) belum didukung UI — bisa
 * ditambah nanti dengan input qty per item, skema sudah siap
 * (qty_received terpisah dari qty_ordered).
 */
export async function receivePurchaseOrder(poId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  const { data: po, error: poError } = await supabase
    .from("purchase_orders")
    .select("id, outlet_id, status")
    .eq("id", poId)
    .single();
  if (poError || !po) return { ok: false, error: "Purchase order tidak ditemukan." };
  if (po.status === "RECEIVED") return { ok: false, error: "PO ini sudah diterima." };
  if (po.status === "CANCELLED") return { ok: false, error: "PO ini sudah dibatalkan." };

  const { data: items, error: itemsError } = await supabase
    .from("purchase_order_items")
    .select("id, product_id, qty_ordered, unit_cost")
    .eq("purchase_order_id", poId);
  if (itemsError || !items || items.length === 0) return { ok: false, error: "PO tidak punya item." };

  const { appUserId } = await resolveIdentity(supabase, user.id);
  const postedAt = nowIso();
  for (const item of items) {
    const qty = Number(item.qty_ordered);
    await supabase.from("stock_movements").insert({
      outlet_id: po.outlet_id,
      product_id: item.product_id,
      type: "PURCHASE_RECEIPT",
      qty,
      unit_cost: Number(item.unit_cost),
      ref_type: "PURCHASE_ORDER",
      ref_id: poId,
      posted_at: postedAt,
      posted_by: appUserId,
    });
    await adjustStock(supabase, po.outlet_id, item.product_id, qty);
    await supabase.from("purchase_order_items").update({ qty_received: qty }).eq("id", item.id);
  }

  await supabase.from("purchase_orders").update({ status: "RECEIVED", received_at: postedAt }).eq("id", poId);

  revalidatePath("/manager/inventory");
  return { ok: true };
}

// ================================================================ TRANSFER

export type CreateStockTransferInput = {
  tenantId: string;
  fromOutletId: string;
  toOutletId: string;
  note: string;
  items: { productId: string; qty: number }[];
};

export async function createAndCompleteStockTransfer(input: CreateStockTransferInput): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  if (input.fromOutletId === input.toOutletId) return { ok: false, error: "Outlet asal dan tujuan tidak boleh sama." };
  const items = input.items.filter((i) => i.productId && i.qty > 0);
  if (items.length === 0) return { ok: false, error: "Tambahkan minimal 1 item dengan qty > 0." };

  const { appUserId, employeeId } = await resolveIdentity(supabase, user.id);
  const code = await nextCode(supabase, "stock_transfers", "tenant_id", input.tenantId, "TRF");
  const postedAt = nowIso();

  const { data: transfer, error } = await supabase
    .from("stock_transfers")
    .insert({
      tenant_id: input.tenantId,
      code,
      from_outlet_id: input.fromOutletId,
      to_outlet_id: input.toOutletId,
      status: "COMPLETED",
      note: input.note.trim() || null,
      sent_at: postedAt,
      received_at: postedAt,
      created_by: employeeId,
    })
    .select("id")
    .single();
  if (error || !transfer) return { ok: false, error: "Gagal membuat transfer." };

  const { error: itemsError } = await supabase
    .from("stock_transfer_items")
    .insert(items.map((i) => ({ stock_transfer_id: transfer.id, product_id: i.productId, qty: i.qty })));
  if (itemsError) return { ok: false, error: "Transfer tersimpan tapi item gagal disimpan — hubungi admin." };

  // Langsung diselesaikan (bukan DRAFT -> IN_TRANSIT -> COMPLETED
  // bertahap) untuk menyederhanakan alur — sesuai kartu "Transfer Antar
  // Outlet" yang hanya menampilkan riwayat, bukan status berjalan yang
  // diproses staff lain di outlet tujuan.
  for (const item of items) {
    await supabase.from("stock_movements").insert([
      {
        outlet_id: input.fromOutletId, product_id: item.productId, type: "TRANSFER_OUT", qty: -item.qty,
        unit_cost: 0, ref_type: "STOCK_TRANSFER", ref_id: transfer.id, posted_at: postedAt, posted_by: appUserId,
      },
      {
        outlet_id: input.toOutletId, product_id: item.productId, type: "TRANSFER_IN", qty: item.qty,
        unit_cost: 0, ref_type: "STOCK_TRANSFER", ref_id: transfer.id, posted_at: postedAt, posted_by: appUserId,
      },
    ]);
    await adjustStock(supabase, input.fromOutletId, item.productId, -item.qty);
    await adjustStock(supabase, input.toOutletId, item.productId, item.qty);
  }

  revalidatePath("/manager/inventory");
  return { ok: true };
}

// ============================================================= STOCK OPNAME

export type CreateStockOpnameInput = {
  outletId: string;
  scope: string;
  opnameDate: string;
  items: { productId: string; systemQty: number; countedQty: number; unitCost: number }[];
};

/**
 * Dibuat langsung berstatus POSTED (bukan DRAFT -> COUNTED -> POSTED
 * bertahap) — form ini SATU langkah: manager mengisi hasil hitung fisik
 * dan langsung submit, sama seperti "Purchase Order" langsung berstatus
 * ORDERED. Selisih (counted - system) langsung diposkan sebagai
 * ADJUSTMENT ke stock_movements, dan product_stocks disetel ke
 * counted_qty (bukan ditambah/dikurangi selisih — opname MENGGANTIKAN
 * angka sistem dengan hasil hitung fisik).
 */
export async function createStockOpnameAndPost(input: CreateStockOpnameInput): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  if (!input.scope.trim()) return { ok: false, error: "Cakupan opname wajib diisi." };
  const items = input.items.filter((i) => i.productId);
  if (items.length === 0) return { ok: false, error: "Tambahkan minimal 1 produk untuk dihitung." };

  const { appUserId, employeeId } = await resolveIdentity(supabase, user.id);
  const code = await nextCode(supabase, "stock_opnames", "outlet_id", input.outletId, "OPN");
  const postedAt = nowIso();

  const { data: opname, error } = await supabase
    .from("stock_opnames")
    .insert({
      outlet_id: input.outletId,
      code,
      scope: input.scope.trim(),
      status: "POSTED",
      opname_date: input.opnameDate,
      counted_by: employeeId,
      posted_at: postedAt,
      posted_by: employeeId,
    })
    .select("id")
    .single();
  if (error || !opname) return { ok: false, error: "Gagal membuat stock opname." };

  const { error: itemsError } = await supabase.from("stock_opname_items").insert(
    items.map((i) => ({
      stock_opname_id: opname.id,
      product_id: i.productId,
      system_qty: i.systemQty,
      counted_qty: i.countedQty,
      unit_cost: i.unitCost,
    }))
  );
  if (itemsError) return { ok: false, error: "Opname tersimpan tapi item gagal disimpan — hubungi admin." };

  for (const item of items) {
    const variance = item.countedQty - item.systemQty;
    if (variance === 0) continue;
    await supabase.from("stock_movements").insert({
      outlet_id: input.outletId, product_id: item.productId, type: "STOCK_OPNAME", qty: variance,
      unit_cost: item.unitCost, ref_type: "STOCK_OPNAME", ref_id: opname.id, posted_at: postedAt, posted_by: appUserId,
    });
    await supabase
      .from("product_stocks")
      .upsert({ outlet_id: input.outletId, product_id: item.productId, qty: item.countedQty }, { onConflict: "outlet_id,product_id" });
  }

  revalidatePath("/manager/inventory");
  return { ok: true };
}
