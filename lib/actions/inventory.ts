"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

/**
 * Klien Supabase milik pemanggil. Diturunkan dari createClient() sendiri
 * (2026-08-24, sebelumnya `any` dengan eslint-disable) supaya tetap ikut
 * kalau tipe klien itu berubah, tanpa perlu meng-import generik
 * SupabaseClient<Database> ke file ini.
 */
type Db = Awaited<ReturnType<typeof createClient>>;

async function adjustStock(
  supabase: Db,
  outletId: string,
  productId: string,
  deltaQty: number
): Promise<boolean> {
  const { data: existing } = await supabase
    .from("product_stocks")
    .select("qty")
    .eq("outlet_id", outletId)
    .eq("product_id", productId)
    .maybeSingle();
  const newQty = Number(existing?.qty ?? 0) + deltaQty;
  const { error } = await supabase
    .from("product_stocks")
    .upsert({ outlet_id: outletId, product_id: productId, qty: newQty }, { onConflict: "outlet_id,product_id" });
  return !error;
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
  guestsPerUnit?: number | null;
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
    ...(input.guestsPerUnit ? { guests_per_unit: input.guestsPerUnit } : {}),
  });
  if (error) {
    // 23505 = unique violation (SKU already taken).
    // 42501 = RLS refused the insert. Worth naming explicitly instead of
    // hiding behind a generic failure: without migration 0021 (status
    // unconfirmed — see that file's header) `products_write` only admits
    // admin/owner, so a manager pressing this button gets a refusal that
    // has nothing to do with what they typed. Telling them the real
    // reason is the difference between "the app is broken" and "my role
    // cannot do this yet".
    if (error.code === "23505") return { ok: false, error: "SKU sudah dipakai produk lain." };
    if (error.code === "42501") {
      return {
        ok: false,
        error: "Role kamu belum diizinkan menambah produk. Perlu migrasi 0021 diterapkan, atau tambahkan produk lewat akun admin/owner.",
      };
    }
    return { ok: false, error: "Gagal menyimpan produk." };
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
    const { error: moveError } = await supabase.from("stock_movements").insert({
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
    if (moveError) return { ok: false, error: "Gagal mencatat pergerakan stok — penerimaan dibatalkan." };
    const stockOk = await adjustStock(supabase, po.outlet_id, item.product_id, qty);
    if (!stockOk) return { ok: false, error: "Gagal memperbarui saldo stok — hubungi admin." };
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

  // Both outlets must belong to the caller's own tenant — verified here via
  // the normal RLS session client (outlets_read is tenant-scoped), BEFORE
  // any privileged write below. This is what stops a tampered toOutletId
  // from being used to move stock into another tenant once we switch to
  // the admin client.
  const { data: outletsCheck } = await supabase
    .from("outlets")
    .select("id")
    .in("id", [input.fromOutletId, input.toOutletId]);
  if ((outletsCheck ?? []).length !== 2) return { ok: false, error: "Outlet asal/tujuan tidak valid." };

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
  if (itemsError) {
    await supabase.from("stock_transfers").delete().eq("id", transfer.id);
    return { ok: false, error: "Transfer tersimpan tapi item gagal disimpan — hubungi admin." };
  }

  // Langsung diselesaikan (bukan DRAFT -> IN_TRANSIT -> COMPLETED
  // bertahap) untuk menyederhanakan alur — sesuai kartu "Transfer Antar
  // Outlet" yang hanya menampilkan riwayat, bukan status berjalan yang
  // diproses staff lain di outlet tujuan.
  //
  // BUG FIX 2026-08-23 (caught live during self-testing): a transfer
  // touches stock_movements/product_stocks rows for BOTH outlets, but
  // `_is_outlet_staff` RLS only authorizes the signed-in manager/kasir's
  // OWN outlet — so with the normal session client, the destination-side
  // insert/upsert was silently rejected by RLS while the source-side
  // deduction still went through (and the old code never checked the
  // error), destroying stock: -3 at Cikawao, +0 at Mekarwangi, transfer
  // shown as "COMPLETED". Business rules (same-tenant outlets, qty > 0,
  // fromOutlet ≠ toOutlet) are already enforced above with the normal
  // session client, so it's safe to finish the actual movement with the
  // admin client — same bypass-RLS-after-validating pattern already used
  // by lib/actions/customerBookings.ts. Any failure here rolls back the
  // transfer + item rows instead of leaving stock half-moved.
  const admin = createAdminClient();
  for (const item of items) {
    const { error: moveError } = await admin.from("stock_movements").insert([
      {
        outlet_id: input.fromOutletId, product_id: item.productId, type: "TRANSFER_OUT", qty: -item.qty,
        unit_cost: 0, ref_type: "STOCK_TRANSFER", ref_id: transfer.id, posted_at: postedAt, posted_by: appUserId,
      },
      {
        outlet_id: input.toOutletId, product_id: item.productId, type: "TRANSFER_IN", qty: item.qty,
        unit_cost: 0, ref_type: "STOCK_TRANSFER", ref_id: transfer.id, posted_at: postedAt, posted_by: appUserId,
      },
    ]);
    const outOk = !moveError && (await adjustStock(admin, input.fromOutletId, item.productId, -item.qty));
    const inOk = !moveError && (await adjustStock(admin, input.toOutletId, item.productId, item.qty));
    if (moveError || !outOk || !inOk) {
      await supabase.from("stock_transfer_items").delete().eq("stock_transfer_id", transfer.id);
      await supabase.from("stock_transfers").delete().eq("id", transfer.id);
      return { ok: false, error: "Gagal memindahkan stok antar outlet — transfer dibatalkan, tidak ada perubahan tersimpan." };
    }
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
    const { error: moveError } = await supabase.from("stock_movements").insert({
      outlet_id: input.outletId, product_id: item.productId, type: "STOCK_OPNAME", qty: variance,
      unit_cost: item.unitCost, ref_type: "STOCK_OPNAME", ref_id: opname.id, posted_at: postedAt, posted_by: appUserId,
    });
    if (moveError) return { ok: false, error: "Opname tersimpan tapi pergerakan stok gagal dicatat — hubungi admin." };
    const { error: stockError } = await supabase
      .from("product_stocks")
      .upsert({ outlet_id: input.outletId, product_id: item.productId, qty: item.countedQty }, { onConflict: "outlet_id,product_id" });
    if (stockError) return { ok: false, error: "Opname tersimpan tapi saldo stok gagal diperbarui — hubungi admin." };
  }

  revalidatePath("/manager/inventory");
  return { ok: true };
}

// ======================================================= PEMAKAIAN BAHAN

export type IssueForTreatmentInput = {
  outletId: string;
  note: string;
  items: { productId: string; qty: number }[];
};

/**
 * "Keluarkan ke Ruang Treatment": unit bahan (botol lotion, minyak,
 * handuk sekali pakai, …) diambil dari gudang untuk dipakai melayani
 * tamu. Inilah pemakaian SEBENARNYA yang dibandingkan Laporan Bulanan
 * dengan perkiraan dari jumlah tamu (products.guests_per_unit, 0041).
 *
 * Pasangan tulisan sama seperti aksi stok lain: satu baris
 * stock_movements (TREATMENT_USAGE, qty negatif, unit_cost = harga
 * pokok produk) + satu upsert product_stocks. Stok tidak boleh minus.
 */
export async function issueStockForTreatment(input: IssueForTreatmentInput): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  const items = input.items.filter((item) => item.productId && item.qty > 0);
  if (items.length === 0) return { ok: false, error: "Pilih minimal 1 bahan dan jumlahnya." };

  const productIds = [...new Set(items.map((item) => item.productId))];
  const [{ data: products }, { data: stocks }] = await Promise.all([
    supabase.from("products").select("id, name, cost_price").in("id", productIds),
    supabase.from("product_stocks").select("product_id, qty").eq("outlet_id", input.outletId).in("product_id", productIds),
  ]);
  const productById = new Map((products ?? []).map((row) => [row.id as string, row]));
  const stockById = new Map((stocks ?? []).map((row) => [row.product_id as string, Number(row.qty)]));

  const totals = new Map<string, number>();
  for (const item of items) totals.set(item.productId, (totals.get(item.productId) ?? 0) + item.qty);
  for (const [productId, qty] of totals) {
    const product = productById.get(productId);
    if (!product) return { ok: false, error: "Ada bahan yang tidak ditemukan — muat ulang halaman." };
    const available = stockById.get(productId) ?? 0;
    if (qty > available) {
      return { ok: false, error: `Stok ${product.name} tidak cukup: tersedia ${available}, diminta ${qty}.` };
    }
  }

  const { appUserId } = await resolveIdentity(supabase, user.id);
  const postedAt = nowIso();
  for (const [productId, qty] of totals) {
    const product = productById.get(productId)!;
    const { error: moveError } = await supabase.from("stock_movements").insert({
      outlet_id: input.outletId,
      product_id: productId,
      type: "TREATMENT_USAGE",
      qty: -qty,
      unit_cost: Number(product.cost_price),
      ref_type: "TREATMENT_ISSUE",
      ref_id: null,
      posted_at: postedAt,
      posted_by: appUserId,
    });
    if (moveError) return { ok: false, error: `Gagal mencatat pemakaian ${product.name}.` };
    const { error: stockError } = await supabase
      .from("product_stocks")
      .upsert({ outlet_id: input.outletId, product_id: productId, qty: (stockById.get(productId) ?? 0) - qty }, { onConflict: "outlet_id,product_id" });
    if (stockError) return { ok: false, error: `Pemakaian ${product.name} tercatat tapi saldo stok gagal diperbarui — hubungi admin.` };
  }

  revalidatePath("/manager/inventory");
  return { ok: true };
}

/** Ubah takaran perkiraan "1 unit ≈ N tamu" sebuah produk (null = hapus). */
export async function updateProductGuestsPerUnit(productId: string, guestsPerUnit: number | null): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };
  if (guestsPerUnit !== null && !(guestsPerUnit > 0)) return { ok: false, error: "Takaran harus lebih dari 0." };

  const { error } = await supabase.from("products").update({ guests_per_unit: guestsPerUnit }).eq("id", productId);
  if (error) {
    if (error.code === "42703") return { ok: false, error: "Migrasi 0041 belum dijalankan — kolom takaran belum ada." };
    if (error.code === "42501") return { ok: false, error: "Role kamu belum diizinkan mengubah produk." };
    return { ok: false, error: "Gagal menyimpan takaran." };
  }
  revalidatePath("/manager/inventory");
  return { ok: true };
}
