import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  PRODUCTS as MOCK_PRODUCTS,
  STOCK_MOVEMENTS as MOCK_MOVEMENTS,
  PURCHASE_ORDERS as MOCK_PURCHASE_ORDERS,
  STOCK_OPNAMES as MOCK_STOCK_OPNAMES,
  TRANSFERS as MOCK_TRANSFERS,
} from "@/lib/mock/commerce";
import type { Product, StockMovement } from "@/lib/types";
import { todayIsoDate } from "@/lib/wallclock";

// ---------------------------------------------------------------------
// UPDATE 2026-08-23 — /manager/inventory was 100% mock (PRODUCTS,
// movementsOf, lowStock, PURCHASE_ORDERS, STOCK_OPNAMES, TRANSFERS all
// from lib/mock), flagged by the user. Schema for the "core 4" tables
// (products/product_stocks/stock_movements/expenses) turned out to
// already exist in production since baseline 0001 — only
// purchase_orders/stock_transfers/stock_opnames/petty_cash were missing,
// added by supabase/migrations/0020_inventory_expenses.sql.
//
// Same dual-mode convention as the therapist portal: a signed-in staff
// session (manager/kasir/admin/owner) sees real data — including a
// genuinely empty state if the tenant hasn't recorded anything yet, NOT
// mock — while the demo "Ganti Role" viewer keeps seeing the original
// mock fixtures untouched. This is a session check (not a row-count
// check like lib/data/outlets.ts), because unlike outlets/rooms this
// data starts genuinely empty on a live tenant and an empty real state
// must never silently show mock numbers instead.
// ---------------------------------------------------------------------

type ProductRow = {
  id: string;
  tenant_id: string;
  sku: string;
  name: string;
  category: Product["category"];
  uom: string;
  cost_price: number | string;
  sell_price: number | string | null;
  track_stock: boolean;
  min_stock: number;
};

type StockRow = { product_id: string; outlet_id: string; qty: number | string };

type MovementRow = {
  id: string;
  outlet_id: string;
  product_id: string;
  type: StockMovement["type"];
  qty: number | string;
  unit_cost: number | string;
  ref_type: string;
  ref_id: string;
  posted_at: string;
  posted_by: string | null;
};

export type PurchaseOrder = {
  id: string;
  outletId: string;
  code: string;
  supplier: string;
  status: "DRAFT" | "ORDERED" | "PARTIAL" | "RECEIVED" | "CANCELLED";
  orderDate: string;
  expectedDate: string | null;
  receivedAt: string | null;
  totalAmount: number;
  itemCount: number;
  notes: string | null;
};

export type PurchaseOrderItem = {
  id: string;
  productId: string;
  productName: string;
  qtyOrdered: number;
  qtyReceived: number;
  unitCost: number;
};

export type StockTransfer = {
  id: string;
  code: string;
  fromOutletId: string;
  fromOutletName: string;
  toOutletId: string;
  toOutletName: string;
  status: "DRAFT" | "IN_TRANSIT" | "COMPLETED" | "CANCELLED";
  note: string | null;
  itemCount: number;
  totalQty: number;
  createdAt: string;
};

export type StockOpname = {
  id: string;
  outletId: string;
  code: string;
  scope: string;
  status: "DRAFT" | "COUNTED" | "POSTED" | "CANCELLED";
  opnameDate: string;
  itemCount: number;
  varianceQty: number;
  varianceValue: number;
  postedBy: string | null;
};

function mapProduct(row: ProductRow, stocksByProduct: Map<string, Record<string, number>>, usedThisMonth: Map<string, number>): Product {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    sku: row.sku,
    name: row.name,
    category: row.category,
    uom: row.uom,
    costPrice: Number(row.cost_price),
    sellPrice: row.sell_price === null ? null : Number(row.sell_price),
    trackStock: row.track_stock,
    stocks: stocksByProduct.get(row.id) ?? {},
    minStock: row.min_stock,
    usedThisMonth: usedThisMonth.get(row.id) ?? 0,
  };
}

async function isSignedIn(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user;
}

async function fetchLiveProducts(): Promise<Product[] | null> {
  if (!(await isSignedIn())) return null;
  const supabase = await createClient();

  const { data: rows, error } = await supabase.from("products").select("*").order("sku");
  if (error) return null;
  const productRows = (rows ?? []) as ProductRow[];

  const productIds = productRows.map((p) => p.id);
  const { data: stockRows } = productIds.length
    ? await supabase.from("product_stocks").select("product_id, outlet_id, qty").in("product_id", productIds)
    : { data: [] as StockRow[] };

  const stocksByProduct = new Map<string, Record<string, number>>();
  for (const s of (stockRows ?? []) as StockRow[]) {
    const rec = stocksByProduct.get(s.product_id) ?? {};
    rec[s.outlet_id] = Number(s.qty);
    stocksByProduct.set(s.product_id, rec);
  }

  // "Terpakai bulan ini" = sum of TREATMENT_USAGE + SALE movement qty
  // (both stored negative) this calendar month, across all outlets.
  // Bulan WIB, bukan bulan UTC: ini server component (Vercel = UTC), jadi
  // tiap tanggal 1 antara 00:00-06:59 WIB batas ini masih menunjuk bulan
  // lalu, dan pemakaian sebulan penuh yang lalu ikut terhitung "bulan ini".
  const monthStart = `${todayIsoDate().slice(0, 7)}-01`;
  const { data: usageRows } = productIds.length
    ? await supabase
        .from("stock_movements")
        .select("product_id, qty, type")
        .in("product_id", productIds)
        .in("type", ["TREATMENT_USAGE", "SALE"])
        .gte("posted_at", monthStart)
    : { data: [] as { product_id: string; qty: number | string; type: string }[] };

  const usedThisMonth = new Map<string, number>();
  for (const u of usageRows ?? []) {
    usedThisMonth.set(u.product_id, (usedThisMonth.get(u.product_id) ?? 0) + Math.abs(Number(u.qty)));
  }

  return productRows.map((p) => mapProduct(p, stocksByProduct, usedThisMonth));
}

const loadProductsData = cache(async () => {
  const live = await fetchLiveProducts();
  if (live) return { products: live, live: true };
  return { products: MOCK_PRODUCTS, live: false };
});

export async function getProducts(): Promise<Product[]> {
  return (await loadProductsData()).products;
}

export async function isLiveInventoryData(): Promise<boolean> {
  return (await loadProductsData()).live;
}

export async function getLowStockForOutlet(outletId: string): Promise<Product[]> {
  const products = await getProducts();
  return products
    .filter((p) => p.trackStock && (p.stocks[outletId] ?? 0) < p.minStock)
    .sort((a, b) => (a.stocks[outletId] ?? 0) / a.minStock - (b.stocks[outletId] ?? 0) / b.minStock);
}

export async function getMovementsForOutlet(outletId: string, limit = 10): Promise<StockMovement[]> {
  const live = await loadProductsData();
  if (!live.live) {
    return MOCK_MOVEMENTS.filter((m) => m.outletId === outletId).slice(0, limit);
  }

  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("stock_movements")
    .select("*")
    .eq("outlet_id", outletId)
    .order("posted_at", { ascending: false })
    .limit(limit);
  if (error || !rows) return [];

  const productMap = new Map(live.products.map((p) => [p.id, p.name]));

  // posted_by references app_users(id), not employees(id) directly — an
  // extra hop (app_users -> employees) is needed to show a real name
  // instead of a raw uuid. Same two-step join pattern as lib/data/alerts.ts.
  const appUserIds = [...new Set((rows as MovementRow[]).map((m) => m.posted_by).filter((v): v is string => !!v))];
  const byMap = new Map<string, string>();
  if (appUserIds.length) {
    const { data: appUsers } = await supabase.from("app_users").select("id, employee_id").in("id", appUserIds);
    const employeeIds = [...new Set((appUsers ?? []).map((a) => a.employee_id).filter((v): v is string => !!v))];
    const { data: employeeRows } = employeeIds.length
      ? await supabase.from("employees").select("id, name").in("id", employeeIds)
      : { data: [] as { id: string; name: string }[] };
    const employeeNameById = new Map((employeeRows ?? []).map((e) => [e.id, e.name]));
    for (const a of appUsers ?? []) {
      if (a.employee_id) byMap.set(a.id, employeeNameById.get(a.employee_id) ?? "Staff");
    }
  }

  return (rows as MovementRow[]).map((m) => ({
    id: m.id,
    outletId: m.outlet_id,
    productId: m.product_id,
    productName: productMap.get(m.product_id) ?? "Produk?",
    type: m.type,
    qty: Number(m.qty),
    unitCost: Number(m.unit_cost),
    refType: m.ref_type,
    refId: m.ref_id,
    postedAt: m.posted_at,
    by: (m.posted_by && byMap.get(m.posted_by)) || "System",
  }));
}

// ---------------------------------------------------------------------
// Tipe baris hasil query (2026-08-24) — sebelumnya ketiga mapper di bawah
// memakai `(r: any)`, jadi salah ketik nama kolom snake_case tidak
// ketahuan sampai nilainya muncul undefined di layar. Bentuk tiap tipe
// mengikuti persis daftar kolom .select() query yang bersangkutan,
// termasuk tabel hasil join. Konvensi penamaan sama dengan *Row di file
// lib/data lainnya.
// ---------------------------------------------------------------------

type PurchaseOrderRow = {
  id: string;
  outlet_id: string;
  code: string;
  supplier: string;
  status: PurchaseOrder["status"];
  order_date: string;
  expected_date: string | null;
  received_at: string | null;
  total_amount: number | string;
  notes: string | null;
  purchase_order_items: { id: string }[] | null;
};

/**
 * Embed relasi many-to-one PostgREST (mis. `products(name)` di bawah)
 * mengembalikan SATU objek saat dijalankan, tapi tipe hasil generate
 * supabase-js kadang menyebutnya array. Helper ini menerima kedua bentuk
 * sehingga kodenya benar apa pun yang datang — dipilih daripada
 * `as unknown as ...` yang hanya membungkam TypeScript tanpa menjamin
 * bentuk datanya. Ditemukan 2026-08-24 saat mengganti `any` dengan tipe
 * sungguhan: `r.products?.name` diam-diam bisa selalu undefined (jatuh ke
 * "Produk?") kalau ternyata yang datang array.
 */
function embeddedOne<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

type PurchaseOrderItemRow = {
  id: string;
  product_id: string;
  qty_ordered: number | string;
  qty_received: number | string;
  unit_cost: number | string;
  products: { name: string } | { name: string }[] | null;
};

type StockOpnameRow = {
  id: string;
  outlet_id: string;
  code: string;
  scope: string;
  status: StockOpname["status"];
  opname_date: string;
  stock_opname_items: { variance_qty: number | string; variance_value: number | string }[] | null;
  employees: { name: string } | null;
};

type StockTransferRow = {
  id: string;
  code: string;
  from_outlet_id: string;
  to_outlet_id: string;
  status: StockTransfer["status"];
  note: string | null;
  created_at: string;
  stock_transfer_items: { qty: number | string }[] | null;
};

export async function getPurchaseOrdersForOutlet(outletId: string): Promise<PurchaseOrder[]> {
  const live = await loadProductsData();
  if (!live.live) {
    return MOCK_PURCHASE_ORDERS.filter((p) => p.outletId === outletId).map((p) => ({
      id: p.id, outletId: p.outletId, code: p.id, supplier: p.supplier,
      status: p.status as PurchaseOrder["status"], orderDate: p.date, expectedDate: null, receivedAt: null,
      totalAmount: p.total, itemCount: p.items, notes: null,
    }));
  }

  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("purchase_orders")
    .select("*, purchase_order_items(id)")
    .eq("outlet_id", outletId)
    .order("order_date", { ascending: false });
  if (error || !rows) return [];

  return (rows as PurchaseOrderRow[]).map((r) => ({
    id: r.id, outletId: r.outlet_id, code: r.code, supplier: r.supplier, status: r.status,
    orderDate: r.order_date, expectedDate: r.expected_date, receivedAt: r.received_at,
    totalAmount: Number(r.total_amount), itemCount: (r.purchase_order_items ?? []).length, notes: r.notes,
  }));
}

export async function getPurchaseOrderItems(poId: string): Promise<PurchaseOrderItem[]> {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("purchase_order_items")
    .select("id, product_id, qty_ordered, qty_received, unit_cost, products(name)")
    .eq("purchase_order_id", poId);
  if (error || !rows) return [];
  return (rows as PurchaseOrderItemRow[]).map((r) => ({
    id: r.id, productId: r.product_id, productName: embeddedOne(r.products)?.name ?? "Produk?",
    qtyOrdered: Number(r.qty_ordered), qtyReceived: Number(r.qty_received), unitCost: Number(r.unit_cost),
  }));
}

export async function getStockOpnamesForOutlet(outletId: string): Promise<StockOpname[]> {
  const live = await loadProductsData();
  if (!live.live) {
    return MOCK_STOCK_OPNAMES.filter((o) => o.outletId === outletId).map((o) => ({
      id: o.id, outletId: o.outletId, code: o.id, scope: o.scope, status: o.status as StockOpname["status"],
      opnameDate: o.date, itemCount: o.items, varianceQty: o.variance, varianceValue: o.varianceValue, postedBy: o.by,
    }));
  }

  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("stock_opnames")
    .select("*, stock_opname_items(variance_qty, variance_value), employees:posted_by(name)")
    .eq("outlet_id", outletId)
    .order("opname_date", { ascending: false });
  if (error || !rows) return [];

  return (rows as StockOpnameRow[]).map((r) => {
    const items = r.stock_opname_items ?? [];
    return {
      id: r.id, outletId: r.outlet_id, code: r.code, scope: r.scope, status: r.status, opnameDate: r.opname_date,
      itemCount: items.length,
      varianceQty: items.reduce((sum, i) => sum + Number(i.variance_qty), 0),
      varianceValue: items.reduce((sum, i) => sum + Number(i.variance_value), 0),
      postedBy: r.employees?.name ?? null,
    };
  });
}

export async function getStockTransfersForOutlet(outletId: string): Promise<StockTransfer[]> {
  const live = await loadProductsData();
  const outlets = await (await import("@/lib/data/outlets")).getOutlets();
  const outletName = (id: string) => outlets.find((o) => o.id === id)?.name ?? "Outlet?";

  if (!live.live) {
    return MOCK_TRANSFERS.filter((t) => t.from === outletId || t.to === outletId).map((t) => ({
      id: t.id, code: t.id, fromOutletId: t.from, fromOutletName: outletName(t.from), toOutletId: t.to,
      toOutletName: outletName(t.to), status: t.status as StockTransfer["status"], note: t.note,
      itemCount: t.items, totalQty: t.qty, createdAt: t.date,
    }));
  }

  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("stock_transfers")
    .select("*, stock_transfer_items(qty)")
    .or(`from_outlet_id.eq.${outletId},to_outlet_id.eq.${outletId}`)
    .order("created_at", { ascending: false });
  if (error || !rows) return [];

  return (rows as StockTransferRow[]).map((r) => {
    const items = r.stock_transfer_items ?? [];
    return {
      id: r.id, code: r.code, fromOutletId: r.from_outlet_id, fromOutletName: outletName(r.from_outlet_id),
      toOutletId: r.to_outlet_id, toOutletName: outletName(r.to_outlet_id), status: r.status, note: r.note,
      itemCount: items.length, totalQty: items.reduce((sum, i) => sum + Number(i.qty), 0), createdAt: r.created_at,
    };
  });
}
