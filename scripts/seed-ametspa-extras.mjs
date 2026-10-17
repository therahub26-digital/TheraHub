// =====================================================================
// Data contoh tambahan tenant demo "Amet Spa" untuk Laporan Bulanan
// (Bagian 02 F&B, 06 Pendapatan vs Biaya, 07 Inventory & Pemakaian Bahan).
//
//   node scripts/seed-ametspa-extras.mjs          -> isi data contoh
//   node scripts/seed-ametspa-extras.mjs --clear  -> hapus data contoh ini saja
//
// Butuh NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (dari .env.local)
// dan migrasi 0041 (products.guests_per_unit). Deterministik: hasilnya sama
// setiap dijalankan. Menolak jalan dua kali tanpa --clear.
//
// Yang dibuat (hanya untuk transaksi/booking riwayat demo yang sudah ada):
//   1. Penjualan makanan & minuman di ±40% transaksi (+ stok SALE, total
//      transaksi dihitung ulang: service 5%, pajak 10% seperti kasir).
//   2. Pengeluaran bulanan per cabang (sewa, listrik, laundry, promosi,
//      perawatan) berstatus APPROVED, deskripsi diawali [demo-seed].
//   3. Pembelian barang mingguan (PURCHASE_RECEIPT).
//   4. Takaran bahan (1 unit ≈ N tamu) + pemakaian ke ruang treatment per
//      minggu sesuai jumlah tamu; Body Lotion di Buah Batu sengaja boros.
//   5. Stok opname 30 Sep dengan sedikit selisih.
//   6. Saldo stok akhir yang wajar (2 item sengaja di bawah minimum).
// =====================================================================

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum diset");
const CLEAR = process.argv.includes("--clear");
const MARK = "[demo-seed]";
const REF = "DEMO_SEED";

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
async function api(method, path, body, extra = {}) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { method, headers: { ...headers, ...extra }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
const get = (path) => api("GET", path);
async function getAll(path) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${URL_}/rest/v1/${path}`, { headers: { ...headers, Range: `${from}-${from + 999}` } });
    if (!res.ok) throw new Error(`GET ${path} -> ${res.status} ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}
const insert = (table, rows) => rows.length ? api("POST", table, rows, { Prefer: "return=minimal" }) : null;
const chunk = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ts = (date, time = "09:00") => `${date}T${time}:00+00:00`;
const addDays = (date, days) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const pricing = (subtotal, discount) => {
  const service = Math.round(subtotal * 0.05);
  const tax = Math.round((subtotal - discount + service) * 0.10);
  return { subtotal, service_charge: service, tax, total: subtotal - discount + service + tax };
};

const outlets = await get("outlets?select=id,code,name,tenant_id&code=in.(AMY-CKW,AMY-MKW)");
if (outlets.length !== 2) throw new Error("Outlet demo Amet Spa tidak ditemukan");
const outletIds = outlets.map((o) => o.id);
const inOutlets = `outlet_id=in.(${outletIds.join(",")})`;
const products = await get(`products?select=*&tenant_id=eq.${outlets[0].tenant_id}`);
const byName = new Map(products.map((p) => [p.name, p]));
const tx = await getAll(`transactions?select=id,outlet_id,subtotal,discount,paid_at&status=eq.PAID&${inOutlets}&order=paid_at`);
const txIds = new Set(tx.map((t) => t.id));
const allItems = (await Promise.all(chunk([...txIds], 150).map((ids) =>
  getAll(`transaction_items?select=id,transaction_id,item_type,name,qty,unit_price&transaction_id=in.(${ids.join(",")})`)))).flat();
// Kasir mencatat produk katalog (termasuk F&B) sebagai item_type PRODUCT.
const fnbNames = new Set(products.filter((p) => p.category === "Food & Beverage").map((p) => p.name));
const isFnb = (i) => i.item_type === "FOOD" || i.item_type === "BEVERAGE" || (i.item_type === "PRODUCT" && fnbNames.has(i.name));
const fnbItems = allItems.filter(isFnb);

// ------------------------------------------------------------------ CLEAR
if (CLEAR) {
  const affected = [...new Set(fnbItems.map((i) => i.transaction_id))];
  for (const ids of chunk(fnbItems.map((i) => i.id), 150)) await api("DELETE", `transaction_items?id=in.(${ids.join(",")})`);
  for (const ids of chunk(affected, 150)) {
    await api("DELETE", `stock_movements?type=eq.SALE&ref_type=eq.TRANSACTION&ref_id=in.(${ids.join(",")})`);
  }
  for (const id of affected) {
    const t = tx.find((row) => row.id === id);
    const rest = allItems.filter((i) => i.transaction_id === id && !isFnb(i));
    const subtotal = rest.reduce((s, i) => s + Number(i.qty) * Number(i.unit_price), 0);
    await api("PATCH", `transactions?id=eq.${id}`, pricing(subtotal, Number(t.discount)), { Prefer: "return=minimal" });
  }
  await api("DELETE", `stock_movements?ref_type=eq.${REF}&${inOutlets}`);
  await api("DELETE", `expenses?description=like.${encodeURIComponent(MARK)}*&${inOutlets}`);
  console.log(`Dihapus: ${fnbItems.length} item F&B (${affected.length} transaksi dihitung ulang), pergerakan stok & pengeluaran demo.`);
  process.exit(0);
}

const existingExpenses = await get(`expenses?select=id&description=like.${encodeURIComponent(MARK)}*&${inOutlets}&limit=1`);
if (fnbItems.length || existingExpenses.length) {
  throw new Error("Data contoh sudah ada. Jalankan dengan --clear dulu bila ingin mengulang.");
}
const log = [];

// ------------------------------------------------- 4a. takaran bahan
const TAKARAN = { "Minyak Pijat (Oil Treatment)": 20, "Body Lotion / Pelembab": 30, "Sabun Cair": 60, "Shampoo": 60 };
for (const [name, gpu] of Object.entries(TAKARAN)) {
  const p = byName.get(name);
  if (!p) continue;
  await api("PATCH", `products?id=eq.${p.id}`, { guests_per_unit: gpu }, { Prefer: "return=minimal" });
}
log.push(`takaran diatur: ${Object.entries(TAKARAN).map(([n, g]) => `${n} 1≈${g}`).join(", ")}`);

// ------------------------------------------------- 1. penjualan F&B
const DRINKS = ["Kopi Hitam", "Wedang Jahe Hangat", "Teh Hangat", "Air Mineral 600ml", "Infused Water Lemon"];
const FOODS = ["Kurma 5 Butir", "Biskuit Gandum", "Buah Potong Segar", "Kacang Panggang 50g"];
const rand = rng(20261017);
const newItems = [];
const saleMoves = [];
const txUpdates = [];
const soldQty = new Map(); // `${outlet}|${product}` -> qty
for (const t of tx) {
  if (rand() >= 0.4) continue;
  const lines = [];
  const pick = (list) => byName.get(list[Math.floor(rand() * list.length)]);
  lines.push({ product: pick(DRINKS), type: "PRODUCT", qty: rand() < 0.2 ? 2 : 1 });
  if (rand() < 0.45) lines.push({ product: pick(FOODS), type: "PRODUCT", qty: 1 });
  let added = 0;
  for (const line of lines) {
    if (!line.product) continue;
    const price = Number(line.product.sell_price);
    added += price * line.qty;
    newItems.push({ transaction_id: t.id, item_type: line.type, name: line.product.name, qty: line.qty, unit_price: price, therapist_id: null });
    saleMoves.push({
      outlet_id: t.outlet_id, product_id: line.product.id, type: "SALE", qty: -line.qty, unit_cost: Number(line.product.cost_price),
      ref_type: "TRANSACTION", ref_id: t.id, posted_at: t.paid_at, posted_by: null,
    });
    const key = `${t.outlet_id}|${line.product.id}`;
    soldQty.set(key, (soldQty.get(key) ?? 0) + line.qty);
  }
  if (added) txUpdates.push({ id: t.id, ...pricing(Number(t.subtotal) + added, Number(t.discount)) });
}
for (const rows of chunk(newItems, 200)) await insert("transaction_items", rows);
for (const rows of chunk(saleMoves, 200)) await insert("stock_movements", rows);
for (const u of txUpdates) {
  const { id, ...values } = u;
  await api("PATCH", `transactions?id=eq.${id}`, values, { Prefer: "return=minimal" });
}
log.push(`F&B: ${newItems.length} item di ${txUpdates.length} dari ${tx.length} transaksi`);

// ------------------------------------------------- 2. pengeluaran
const firstDay = tx[0].paid_at.slice(0, 10).slice(0, 8) + "01";
const lastDay = tx[tx.length - 1].paid_at.slice(0, 10);
const months = [...new Set(tx.map((t) => t.paid_at.slice(0, 7)))];
const EXPENSE_PLAN = {
  "AMY-CKW": { rent: 6_000_000, utilities: 1_850_000, laundry: 300_000, marketing: 900_000 },
  "AMY-MKW": { rent: 7_000_000, utilities: 1_600_000, laundry: 240_000, marketing: 600_000 },
};
const expenses = [];
for (const outlet of outlets) {
  const plan = EXPENSE_PLAN[outlet.code];
  for (const month of months) {
    const row = (day, category, amount, vendor, description, method = "Bank Transfer") => {
      const date = `${month}-${String(day).padStart(2, "0")}`;
      if (date > lastDay) return;
      expenses.push({
        outlet_id: outlet.id, date, category, vendor, amount, tax: 0, payment_method: method,
        description: `${MARK} ${description}`, status: "APPROVED", approved_at: ts(date, "17:00"), created_at: ts(date, "16:00"),
      });
    };
    row(1, "Rent", plan.rent, "Pemilik Ruko", `Sewa outlet ${month}`);
    row(5, "Utilities", plan.utilities, "PLN & PDAM", `Listrik, air, internet ${month}`);
    for (const day of [7, 14, 21, 28]) row(day, "Laundry", plan.laundry, "Laundry Bersih Jaya", `Laundry handuk & linen minggu tgl ${day}`, "Cash");
    row(10, "Marketing", plan.marketing, "Meta Ads", `Iklan Instagram ${month}`);
    if (outlet.code === "AMY-CKW") row(18, "Maintenance", 250_000, "Teknisi AC", "Servis AC Room 03");
  }
}
await insert("expenses", expenses);
log.push(`pengeluaran: ${expenses.length} baris`);

// ------------------------------------------------- 3 & 4b. pembelian + pemakaian
const bookings = await getAll(`bookings?select=outlet_id,date,status&status=eq.PAID&${inOutlets}`);
const FACTOR = { "AMY-CKW": { "Sabun Cair": 0.75 }, "AMY-MKW": { "Body Lotion / Pelembab": 1.45 } };
const moves = [];
const usedQty = new Map();
for (const outlet of outlets) {
  let weekStart = firstDay;
  const cumulative = new Map();
  while (weekStart <= lastDay) {
    const weekEnd = addDays(weekStart, 6);
    const visits = bookings.filter((b) => b.outlet_id === outlet.id && b.date >= weekStart && b.date <= weekEnd).length;
    const issueDate = weekStart > lastDay ? lastDay : weekStart;
    // pemakaian bahan treatment, mengikuti jumlah tamu
    for (const [name, gpu] of Object.entries(TAKARAN)) {
      const p = byName.get(name);
      if (!p || !visits) continue;
      const factor = FACTOR[outlet.code]?.[name] ?? 1.05;
      const before = cumulative.get(name) ?? 0;
      const after = before + visits / gpu * factor;
      cumulative.set(name, after);
      const units = Math.floor(after) - Math.floor(before);
      if (!units) continue;
      moves.push({ outlet_id: outlet.id, product_id: p.id, type: "TREATMENT_USAGE", qty: -units, unit_cost: Number(p.cost_price), ref_type: REF, ref_id: null, posted_at: ts(issueDate, "10:00"), posted_by: null });
      const key = `${outlet.id}|${p.id}`;
      usedQty.set(key, (usedQty.get(key) ?? 0) + units);
    }
    weekStart = addDays(weekStart, 7);
  }
  // pembelian mingguan: F&B sebanyak yang terjual + bahan sebanyak yang dipakai, dibulatkan per pak
  weekStart = firstDay;
  const weeks = [];
  while (weekStart <= lastDay) { weeks.push(weekStart); weekStart = addDays(weekStart, 7); }
  for (const p of products) {
    const key = `${outlet.id}|${p.id}`;
    const need = (soldQty.get(key) ?? 0) + (usedQty.get(key) ?? 0);
    if (!need) continue;
    const perWeek = Math.ceil(need / weeks.length);
    for (const week of weeks) {
      moves.push({ outlet_id: outlet.id, product_id: p.id, type: "PURCHASE_RECEIPT", qty: perWeek, unit_cost: Number(p.cost_price), ref_type: REF, ref_id: null, posted_at: ts(week, "08:30"), posted_by: null });
    }
  }
}
// ------------------------------------------------- 5. stok opname 30 Sep
const OPNAME = [["AMY-CKW", "Minyak Pijat (Oil Treatment)", -1], ["AMY-CKW", "Air Mineral 600ml", -2], ["AMY-MKW", "Body Lotion / Pelembab", -2], ["AMY-MKW", "Kopi Hitam", -3]];
const opnameDate = months.length > 1 ? `${months[0]}-30` : lastDay;
for (const [code, name, qty] of OPNAME) {
  const outlet = outlets.find((o) => o.code === code);
  const p = byName.get(name);
  if (!outlet || !p) continue;
  moves.push({ outlet_id: outlet.id, product_id: p.id, type: "STOCK_OPNAME", qty, unit_cost: Number(p.cost_price), ref_type: REF, ref_id: null, posted_at: ts(opnameDate, "21:00"), posted_by: null });
}
for (const rows of chunk(moves, 200)) await insert("stock_movements", rows);
log.push(`pergerakan stok: ${moves.length} (pembelian, pemakaian, opname) + ${saleMoves.length} penjualan`);

// ------------------------------------------------- 6. saldo awal + saldo akhir
// Saldo stok WAJIB sama dengan jumlah buku besar (stock_movements). Satu
// baris ADJUSTMENT "saldo awal" per produk per cabang di hari pertama,
// cukup supaya saldo berjalan tidak pernah minus, lalu product_stocks =
// total buku besar. Dua item sengaja berakhir di bawah minimum.
const LOW = new Set(["AMY-CKW|Body Lotion / Pelembab", "AMY-MKW|Handuk Kecil"]);
const ledger = [...saleMoves, ...moves].sort((a, b) => a.posted_at.localeCompare(b.posted_at));
const openingMoves = [];
const stocks = [];
for (const outlet of outlets) {
  for (const p of products) {
    let running = 0;
    let lowest = 0;
    for (const m of ledger) {
      if (m.outlet_id !== outlet.id || m.product_id !== p.id) continue;
      running += Number(m.qty);
      lowest = Math.min(lowest, running);
    }
    const buffer = LOW.has(`${outlet.code}|${p.name}`) ? 1 : Math.max(Number(p.min_stock), 6);
    const opening = -lowest + buffer;
    openingMoves.push({ outlet_id: outlet.id, product_id: p.id, type: "ADJUSTMENT", qty: opening, unit_cost: Number(p.cost_price), ref_type: REF, ref_id: null, posted_at: ts(addDays(firstDay, -1), "23:00"), posted_by: null });
    stocks.push({ outlet_id: outlet.id, product_id: p.id, qty: opening + running });
  }
}
await insert("stock_movements", openingMoves);
await api("POST", "product_stocks?on_conflict=outlet_id,product_id", stocks, { Prefer: "resolution=merge-duplicates,return=minimal" });
log.push(`saldo awal: ${openingMoves.length} baris; saldo akhir = total buku besar (${stocks.filter((r) => LOW.has(`${outlets.find((o) => o.id === r.outlet_id).code}|${byName.get([...byName.keys()].find((n) => byName.get(n).id === r.product_id)).name}`)).length} item sengaja menipis)`);

console.log(log.map((line) => `- ${line}`).join("\n"));
