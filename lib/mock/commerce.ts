import type { Product, StockMovement, Transaction, TransactionItem } from "../types";
import { makeRng, int, pick, chance, TODAY } from "./rng";
import { OUTLETS } from "./org";
import { BOOKINGS } from "./ops";
import { employeesOf } from "./people";
import { addDays } from "../format";

type PSeed = [sku: string, name: string, cat: Product["category"], uom: string, cost: number, sell: number | null, min: number];

const PRODUCT_SEEDS: PSeed[] = [
  ["RTL-001", "Zen Body Lotion 200 ml", "Retail Product", "botol", 48_000, 95_000, 12],
  ["RTL-002", "Essential Oil Lemongrass 30 ml", "Retail Product", "botol", 62_000, 125_000, 10],
  ["RTL-003", "Essential Oil Lavender 30 ml", "Retail Product", "botol", 68_000, 135_000, 10],
  ["RTL-004", "Herbal Compress Ball", "Retail Product", "pcs", 35_000, 75_000, 8],
  ["RTL-005", "Zen Tote Bag", "Retail Product", "pcs", 28_000, 65_000, 6],
  ["FNB-001", "Air Mineral 600 ml", "Food & Beverage", "botol", 3_500, 10_000, 48],
  ["FNB-002", "Wedang Jahe", "Food & Beverage", "cup", 6_000, 18_000, 30],
  ["FNB-003", "Teh Serai Hangat", "Food & Beverage", "cup", 4_500, 15_000, 30],
  ["FNB-004", "Kopi Susu Zen", "Food & Beverage", "cup", 9_000, 25_000, 24],
  ["FNB-005", "Snack Kacang Panggang", "Food & Beverage", "pack", 5_500, 15_000, 24],
  ["FNB-006", "Buah Potong Segar", "Food & Beverage", "porsi", 8_000, 22_000, 15],
  ["CSM-001", "Massage Oil Lemongrass 1 L", "Treatment Consumable", "liter", 145_000, null, 6],
  ["CSM-002", "Massage Oil Almond 1 L", "Treatment Consumable", "liter", 168_000, null, 6],
  ["CSM-003", "Massage Oil Arnica 1 L", "Treatment Consumable", "liter", 182_000, null, 4],
  ["CSM-004", "Essential Oil Blend 100 ml", "Treatment Consumable", "botol", 210_000, null, 4],
  ["CSM-005", "Body Scrub Rempah 1 kg", "Treatment Consumable", "kg", 125_000, null, 5],
  ["CSM-006", "Body Mask Clay 1 kg", "Treatment Consumable", "kg", 138_000, null, 4],
  ["CSM-007", "Thai Balm 500 gr", "Treatment Consumable", "pcs", 95_000, null, 4],
  ["CSM-008", "Foot Balm 500 gr", "Treatment Consumable", "pcs", 78_000, null, 5],
  ["CSM-009", "Disposable Sheet", "Treatment Consumable", "pcs", 2_800, null, 200],
  ["CSM-010", "Tissue Roll", "Treatment Consumable", "roll", 6_500, null, 60],
  ["CSM-011", "Liquid Soap 5 L", "Treatment Consumable", "jerigen", 72_000, null, 3],
  ["OPS-001", "Deterjen Laundry 5 kg", "Operational Supply", "sak", 88_000, null, 3],
  ["OPS-002", "Cleaning Chemical 5 L", "Operational Supply", "jerigen", 96_000, null, 2],
  ["OPS-003", "Sarung Tangan Latex", "Operational Supply", "box", 42_000, null, 6],
  ["OPS-004", "Pengharum Ruangan Refill", "Operational Supply", "botol", 34_000, null, 8],
  ["AST-001", "Handuk Besar Putih", "Reusable Asset", "pcs", 55_000, null, 40],
  ["AST-002", "Kimono Spa", "Reusable Asset", "pcs", 120_000, null, 20],
  ["AST-003", "Basalt Stone Set", "Reusable Asset", "set", 850_000, null, 2],
];

export const PRODUCTS: Product[] = PRODUCT_SEEDS.map((p, i) => {
  const r = makeRng(60_000 + i * 43);
  const stocks: Record<string, number> = {};
  OUTLETS.forEach((o, oi) => {
    const base = p[6] * (oi === 0 ? 2.4 : oi === 1 ? 1.8 : 1.4);
    const low = chance(r, 0.16);
    stocks[o.id] = Math.max(0, Math.round(low ? p[6] * (0.2 + r() * 0.5) : base * (0.7 + r() * 0.9)));
  });
  return {
    id: `PRD-${String(i + 1).padStart(3, "0")}`,
    tenantId: "TEN-001",
    sku: p[0],
    name: p[1],
    category: p[2],
    uom: p[3],
    costPrice: p[4],
    sellPrice: p[5],
    trackStock: true,
    stocks,
    minStock: p[6],
    usedThisMonth: int(r, 4, 180),
  };
});

export const productById = (id: string) => PRODUCTS.find((p) => p.id === id);
export const sellableProducts = PRODUCTS.filter((p) => p.sellPrice !== null);
export const lowStock = (outletId: string) =>
  PRODUCTS.filter((p) => p.stocks[outletId] < p.minStock).sort(
    (a, b) => a.stocks[outletId] / a.minStock - b.stocks[outletId] / b.minStock,
  );

const MOVE_TYPES: StockMovement["type"][] = [
  "PURCHASE_RECEIPT", "SALE", "TREATMENT_USAGE", "TRANSFER_OUT", "TRANSFER_IN",
  "ADJUSTMENT", "STOCK_OPNAME", "WASTE_DAMAGE",
];

export const STOCK_MOVEMENTS: StockMovement[] = (() => {
  const r = makeRng(70_707);
  const out: StockMovement[] = [];
  for (let i = 0; i < 140; i++) {
    const p = pick(r, PRODUCTS);
    const o = pick(r, OUTLETS);
    const type = pick(r, MOVE_TYPES);
    const sign = ["PURCHASE_RECEIPT", "TRANSFER_IN"].includes(type) ? 1 : type === "STOCK_OPNAME" || type === "ADJUSTMENT" ? (chance(r, 0.5) ? 1 : -1) : -1;
    const qty = sign * int(r, 1, type === "PURCHASE_RECEIPT" ? 60 : 14);
    const day = addDays(TODAY, -int(r, 0, 21));
    out.push({
      id: `STM-${5000 + i}`,
      outletId: o.id,
      productId: p.id,
      productName: p.name,
      type,
      qty,
      unitCost: p.costPrice,
      refType: type === "SALE" ? "transaction" : type === "TREATMENT_USAGE" ? "session" : type === "PURCHASE_RECEIPT" ? "goods_receipt" : "manual",
      refId: `${type.slice(0, 3)}-${int(r, 1000, 9999)}`,
      postedAt: `${day}T${String(int(r, 8, 21)).padStart(2, "0")}:${String(int(r, 0, 59)).padStart(2, "0")}`,
      by: pick(r, ["Sinta Maharani", "Yoga Saputra", "Nurul Fadhilah", "Ratna Kusumawati", "System"]),
    });
  }
  return out.sort((a, b) => (a.postedAt < b.postedAt ? 1 : -1));
})();

export const movementsOf = (outletId: string) => STOCK_MOVEMENTS.filter((m) => m.outletId === outletId);

export const PURCHASE_ORDERS = [
  { id: "PO-2026-0412", outletId: "OUT-001", supplier: "PT Aroma Nusantara", date: "2026-08-16", items: 8, total: 4_280_000, status: "RECEIVED" },
  { id: "PO-2026-0415", outletId: "OUT-001", supplier: "CV Linen Bersih", date: "2026-08-17", items: 3, total: 2_150_000, status: "PARTIAL" },
  { id: "PO-2026-0418", outletId: "OUT-001", supplier: "Toko Sembako Jaya", date: "2026-08-18", items: 6, total: 890_000, status: "ORDERED" },
  { id: "PO-2026-0409", outletId: "OUT-002", supplier: "PT Aroma Nusantara", date: "2026-08-14", items: 5, total: 3_120_000, status: "RECEIVED" },
  { id: "PO-2026-0420", outletId: "OUT-003", supplier: "CV Herbal Sejahtera", date: "2026-08-18", items: 4, total: 1_640_000, status: "DRAFT" },
];

export const STOCK_OPNAMES = [
  { id: "OPN-2026-08-A", outletId: "OUT-001", date: "2026-08-15", scope: "Treatment Consumable", items: 11, variance: -6, varianceValue: -184_000, status: "POSTED", by: "Sinta Maharani" },
  { id: "OPN-2026-08-B", outletId: "OUT-001", date: "2026-08-01", scope: "Food & Beverage", items: 6, variance: -3, varianceValue: -41_500, status: "POSTED", by: "Nurul Fadhilah" },
  { id: "OPN-2026-07-A", outletId: "OUT-001", date: "2026-07-31", scope: "Semua kategori", items: 29, variance: 2, varianceValue: 58_000, status: "POSTED", by: "Sinta Maharani" },
  { id: "OPN-2026-08-C", outletId: "OUT-002", date: "2026-08-16", scope: "Retail Product", items: 5, variance: -1, varianceValue: -48_000, status: "DRAFT", by: "Yoga Saputra" },
];

export const TRANSFERS = [
  { id: "TRF-0091", from: "OUT-001", to: "OUT-002", date: "2026-08-17", items: 3, qty: 24, status: "COMPLETED", note: "Disposable sheet + tissue" },
  { id: "TRF-0092", from: "OUT-003", to: "OUT-001", date: "2026-08-18", items: 1, qty: 4, status: "IN_TRANSIT", note: "Massage oil almond" },
  { id: "TRF-0090", from: "OUT-002", to: "OUT-003", date: "2026-08-12", items: 2, qty: 12, status: "COMPLETED", note: "Body scrub rempah" },
];

// ------------------------------------------------------------- transactions
const PAY_METHODS: Transaction["paymentMethod"][] = ["Cash", "QRIS", "Debit Card", "Credit Card", "Transfer", "E-Wallet", "Split"];

export const TRANSACTIONS: Transaction[] = BOOKINGS.filter((b) => b.status === "PAID")
  .map((b, i) => {
    const r = makeRng(80_000 + i * 61);
    const outlet = OUTLETS.find((o) => o.id === b.outletId)!;
    const cashiers = employeesOf(b.outletId).filter((e) => e.jobRole === "Kasir");
    const items: TransactionItem[] = [
      { id: `TI-${i}-1`, itemType: "SERVICE", name: b.packageName, qty: 1, unitPrice: b.price, therapistName: b.therapistName },
    ];
    if (chance(r, 0.18)) {
      const ext = pick(r, [
        { n: "Extension +15", p: 40_000 },
        { n: "Extension +30", p: 70_000 },
        { n: "Extension +60", p: 120_000 },
      ]);
      items.push({ id: `TI-${i}-2`, itemType: "EXTENSION", name: ext.n, qty: 1, unitPrice: ext.p, therapistName: b.therapistName });
    }
    b.addOns.forEach((a, ai) =>
      items.push({ id: `TI-${i}-a${ai}`, itemType: "ADD_ON", name: a, qty: 1, unitPrice: pick(r, [35_000, 45_000, 55_000, 65_000]), therapistName: b.therapistName }),
    );
    if (chance(r, 0.42)) {
      const bev = pick(r, PRODUCTS.filter((p) => p.category === "Food & Beverage"));
      items.push({ id: `TI-${i}-b`, itemType: bev.name.includes("Snack") || bev.name.includes("Buah") ? "FOOD" : "BEVERAGE", name: bev.name, qty: int(r, 1, 2), unitPrice: bev.sellPrice! });
    }
    if (chance(r, 0.09)) {
      const prod = pick(r, PRODUCTS.filter((p) => p.category === "Retail Product"));
      items.push({ id: `TI-${i}-p`, itemType: "PRODUCT", name: prod.name, qty: 1, unitPrice: prod.sellPrice! });
    }

    const subtotal = items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
    const hasDiscount = chance(r, 0.2);
    const discount = hasDiscount ? Math.round((subtotal * pick(r, [0.05, 0.1, 0.15, 0.2])) / 1000) * 1000 : 0;
    const net = subtotal - discount;
    const serviceCharge = Math.round((net * outlet.serviceChargePct) / 100);
    const tax = Math.round(((net + serviceCharge) * outlet.taxPct) / 100);
    const total = net + serviceCharge + tax;

    return {
      id: `TRX-${9000 + i}`,
      receiptNo: `${outlet.receiptPrefix}/2608/${String(1000 + i).slice(-4)}`,
      outletId: b.outletId,
      bookingCode: b.code,
      customerName: b.customerName,
      cashierName: cashiers.length ? pick(r, cashiers).name : "Kasir Outlet",
      items,
      subtotal,
      discount,
      discountReason: hasDiscount ? pick(r, ["Happy hour weekday", "Member Gold", "Voucher WELCOME50", "Kompensasi keterlambatan", "Approval manager"]) : undefined,
      tax,
      serviceCharge,
      total,
      paymentMethod: pick(r, PAY_METHODS),
      status: chance(r, 0.03) ? (chance(r, 0.5) ? "PARTIALLY_REFUNDED" : "VOID") : "PAID",
      paidAt: `${b.date}T${b.scheduledEnd}`,
      printedCount: int(r, 1, 3),
    };
  });

export const transactionsOf = (outletId: string, date?: string) =>
  TRANSACTIONS.filter((t) => t.outletId === outletId && (!date || t.paidAt.startsWith(date))).sort((a, b) =>
    a.paidAt < b.paidAt ? 1 : -1,
  );

export function salesBreakdown(outletId: string, date = TODAY) {
  const list = transactionsOf(outletId, date).filter((t) => t.status === "PAID");
  const byType: Record<string, number> = {};
  list.forEach((t) =>
    t.items.forEach((it) => {
      byType[it.itemType] = (byType[it.itemType] ?? 0) + it.qty * it.unitPrice;
    }),
  );
  const byMethod: Record<string, number> = {};
  list.forEach((t) => (byMethod[t.paymentMethod] = (byMethod[t.paymentMethod] ?? 0) + t.total));
  return { byType, byMethod, count: list.length, total: list.reduce((s, t) => s + t.total, 0) };
}

export const CASHIER_SHIFTS = [
  { id: "CSH-0221", outletId: "OUT-001", cashier: "Nurul Fadhilah", openedAt: "2026-08-18T09:45", closedAt: null, openingFloat: 500_000, expectedCash: 3_240_000, countedCash: null, variance: null, status: "OPEN" },
  { id: "CSH-0220", outletId: "OUT-001", cashier: "Bayu Ramadhan", openedAt: "2026-08-17T09:50", closedAt: "2026-08-17T22:14", openingFloat: 500_000, expectedCash: 5_180_000, countedCash: 5_165_000, variance: -15_000, status: "CLOSED" },
  { id: "CSH-0219", outletId: "OUT-001", cashier: "Nurul Fadhilah", openedAt: "2026-08-16T09:41", closedAt: "2026-08-16T22:06", openingFloat: 500_000, expectedCash: 6_420_000, countedCash: 6_420_000, variance: 0, status: "CLOSED" },
];

export const PRINTER_PROFILES = [
  { id: "PRN-001", outletId: "OUT-001", name: "Kasir Depan — EPSON TM-T82", type: "LAN/Wi-Fi ESC/POS", width: 80, address: "192.168.1.51:9100", active: true, lastJob: "2026-08-18T15:07", status: "Online" },
  { id: "PRN-002", outletId: "OUT-001", name: "Mobile — RPP02N Bluetooth", type: "Bluetooth thermal", width: 58, address: "DC:0D:30:11:AB:22", active: true, lastJob: "2026-08-18T13:22", status: "Online" },
  { id: "PRN-003", outletId: "OUT-001", name: "Backup — Browser Print", type: "Browser fallback", width: 80, address: "—", active: false, lastJob: "2026-08-11T18:40", status: "Standby" },
];

export const PRINT_JOBS = [
  { id: "PJ-88412", receiptNo: "DGO/2608/1039", printer: "Kasir Depan — EPSON TM-T82", at: "2026-08-18T15:07", type: "Receipt", status: "Success", by: "Nurul Fadhilah" },
  { id: "PJ-88409", receiptNo: "DGO/2608/1038", printer: "Kasir Depan — EPSON TM-T82", at: "2026-08-18T14:51", type: "Receipt", status: "Success", by: "Nurul Fadhilah" },
  { id: "PJ-88405", receiptNo: "DGO/2608/1036", printer: "Mobile — RPP02N Bluetooth", at: "2026-08-18T14:12", type: "Reprint", status: "Success", by: "Sinta Maharani" },
  { id: "PJ-88401", receiptNo: "DGO/2608/1033", printer: "Kasir Depan — EPSON TM-T82", at: "2026-08-18T13:38", type: "Receipt", status: "Failed", by: "Bayu Ramadhan" },
  { id: "PJ-88400", receiptNo: "DGO/2608/1033", printer: "Kasir Depan — EPSON TM-T82", at: "2026-08-18T13:39", type: "Retry", status: "Success", by: "Bayu Ramadhan" },
];
