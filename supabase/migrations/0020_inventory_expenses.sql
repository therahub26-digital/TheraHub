-- ---------------------------------------------------------------------
-- 0020_inventory_expenses.sql   ***DRAFT — BELUM DITERAPKAN***
--
-- Melengkapi skema untuk /manager/inventory dan /manager/expenses, dua
-- halaman yang sampai sekarang masih 100% mock.
--
-- PENTING — hasil introspeksi production (2026-08-23, lewat SQL Editor):
-- sebagian besar skemanya SUDAH ADA sejak baseline 0001 (baseline itu
-- diterapkan lewat dashboard, tidak pernah tercatat sebagai file migrasi
-- di repo, makanya tidak kelihatan). Yang sudah ada dan TIDAK disentuh
-- file ini:
--
--   products         (id, tenant_id, sku, name, category, uom,
--                     cost_price, sell_price, track_stock, min_stock)
--   product_stocks   (product_id, outlet_id, qty)
--   stock_movements  (id, outlet_id, product_id, type, qty, unit_cost,
--                     ref_type, ref_id, posted_at, posted_by)
--   expenses         (id, outlet_id, date, category, vendor, amount,
--                     tax, payment_method, description, status,
--                     submitted_by, attachment_url)
--
-- Enum yang sudah ada dan dipakai lagi di sini (persis sama dengan tipe
-- TypeScript di lib/types.ts, tidak perlu diubah sama sekali):
--   stock_movement_type = PURCHASE_RECEIPT, SALE, TREATMENT_USAGE,
--                         TRANSFER_OUT, TRANSFER_IN, ADJUSTMENT,
--                         STOCK_OPNAME, RETURN_TO_SUPPLIER, WASTE_DAMAGE
--   product_category    = Retail Product, Food & Beverage,
--                         Treatment Consumable, Operational Supply,
--                         Reusable Asset
--   expense_status      = DRAFT, SUBMITTED, APPROVED, PAID, REJECTED
--   payment_method      = Cash, QRIS, Debit Card, Credit Card, Transfer,
--                         E-Wallet, Split, Midtrans
--
-- Jadi file ini HANYA menambah yang benar-benar belum ada (dikonfirmasi
-- kosong lewat information_schema.tables):
--   1. purchase_orders + purchase_order_items
--   2. stock_transfers + stock_transfer_items
--   3. stock_opnames   + stock_opname_items
--   4. petty_cash      + petty_cash_movements
--   5. kolom jejak approval di expenses (approved_by / approved_at /
--      created_at) — enum-nya sudah punya APPROVED tapi tidak ada
--      catatan siapa & kapan menyetujui.
--
-- Konvensi yang diikuti (sama dengan 0014 & 0017):
--   - status pakai `text ... check (...)`, BUKAN enum baru — lebih mudah
--     ditambah nilainya nanti tanpa migrasi ALTER TYPE.
--   - RLS: `_is_outlet_staff(outlet_id)` untuk operasional gudang
--     (manager + kasir, konsisten dengan policy product_stocks &
--     stock_movements yang sudah ada), `_is_manager_here(outlet_id)`
--     untuk yang sifatnya finansial (petty cash, konsisten dengan
--     policy expenses yang sudah ada), `_is_admin_or_owner()` selalu
--     tenant-wide.
--   - Semua tabel dokumen (PO/transfer/opname) TIDAK menyimpan stok.
--     Stok tetap satu-satunya sumber kebenaran di product_stocks, dan
--     setiap perubahannya wajib lewat stock_movements. Dokumen di sini
--     nyambung ke stock_movements lewat kolom generik ref_type/ref_id
--     yang sudah ada ('PURCHASE_ORDER' / 'STOCK_TRANSFER' /
--     'STOCK_OPNAME' + id dokumennya). Itu sebabnya tidak ada satupun
--     trigger yang menulis stok di file ini — posting stok dikerjakan
--     server action supaya bisa divalidasi & diaudit seperti aksi lain.
-- ---------------------------------------------------------------------


-- ============================================================ 1. PURCHASE ORDER

create table if not exists purchase_orders (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references outlets(id),
  code text not null,
  supplier text not null,
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'ORDERED', 'PARTIAL', 'RECEIVED', 'CANCELLED')),
  order_date date not null,
  expected_date date,
  received_at timestamptz,
  -- Nilai yang disepakati saat order. Sengaja disimpan (bukan dihitung
  -- ulang dari item) karena harga bisa berubah setelah PO dibuat, dan
  -- nilai PO adalah fakta bisnis pada saat pemesanan.
  total_amount numeric not null default 0,
  notes text,
  created_by uuid references employees(id),
  created_at timestamptz not null default now(),
  unique (outlet_id, code)
);

create table if not exists purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  product_id uuid not null references products(id),
  qty_ordered numeric not null check (qty_ordered > 0),
  qty_received numeric not null default 0 check (qty_received >= 0),
  unit_cost numeric not null default 0,
  unique (purchase_order_id, product_id)
);

create index if not exists purchase_orders_outlet_idx on purchase_orders (outlet_id, order_date desc);
create index if not exists purchase_order_items_po_idx on purchase_order_items (purchase_order_id);

alter table purchase_orders enable row level security;
alter table purchase_order_items enable row level security;

create policy purchase_orders_read on purchase_orders
  for select to authenticated
  using (
    outlet_id in (select id from outlets where tenant_id = _current_tenant_id())
  );

create policy purchase_orders_write on purchase_orders
  for all to authenticated
  using (
    _is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id())
    or _is_outlet_staff(outlet_id)
  )
  with check (
    _is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id())
    or _is_outlet_staff(outlet_id)
  );

-- Item ikut izin dokumen induknya.
create policy purchase_order_items_read on purchase_order_items
  for select to authenticated
  using (
    purchase_order_id in (
      select id from purchase_orders
      where outlet_id in (select id from outlets where tenant_id = _current_tenant_id())
    )
  );

create policy purchase_order_items_write on purchase_order_items
  for all to authenticated
  using (
    purchase_order_id in (
      select id from purchase_orders
      where _is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id())
         or _is_outlet_staff(outlet_id)
    )
  )
  with check (
    purchase_order_id in (
      select id from purchase_orders
      where _is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id())
         or _is_outlet_staff(outlet_id)
    )
  );


-- ========================================================= 2. TRANSFER ANTAR OUTLET

create table if not exists stock_transfers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  code text not null,
  from_outlet_id uuid not null references outlets(id),
  to_outlet_id uuid not null references outlets(id),
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED')),
  note text,
  sent_at timestamptz,
  received_at timestamptz,
  created_by uuid references employees(id),
  created_at timestamptz not null default now(),
  unique (tenant_id, code),
  -- Transfer ke outlet yang sama tidak masuk akal dan akan membuat
  -- pasangan TRANSFER_OUT/TRANSFER_IN saling meniadakan.
  check (from_outlet_id <> to_outlet_id)
);

create table if not exists stock_transfer_items (
  id uuid primary key default gen_random_uuid(),
  stock_transfer_id uuid not null references stock_transfers(id) on delete cascade,
  product_id uuid not null references products(id),
  qty numeric not null check (qty > 0),
  unique (stock_transfer_id, product_id)
);

create index if not exists stock_transfers_from_idx on stock_transfers (from_outlet_id, created_at desc);
create index if not exists stock_transfers_to_idx on stock_transfers (to_outlet_id, created_at desc);
create index if not exists stock_transfer_items_transfer_idx on stock_transfer_items (stock_transfer_id);

alter table stock_transfers enable row level security;
alter table stock_transfer_items enable row level security;

-- Transfer menyentuh DUA outlet, jadi staff di kedua sisi harus bisa
-- melihat & memprosesnya (yang mengirim dan yang menerima).
create policy stock_transfers_read on stock_transfers
  for select to authenticated
  using (tenant_id = _current_tenant_id());

create policy stock_transfers_write on stock_transfers
  for all to authenticated
  using (
    _is_admin_or_owner() and tenant_id = _current_tenant_id()
    or _is_outlet_staff(from_outlet_id)
    or _is_outlet_staff(to_outlet_id)
  )
  with check (
    _is_admin_or_owner() and tenant_id = _current_tenant_id()
    or _is_outlet_staff(from_outlet_id)
    or _is_outlet_staff(to_outlet_id)
  );

create policy stock_transfer_items_read on stock_transfer_items
  for select to authenticated
  using (
    stock_transfer_id in (select id from stock_transfers where tenant_id = _current_tenant_id())
  );

create policy stock_transfer_items_write on stock_transfer_items
  for all to authenticated
  using (
    stock_transfer_id in (
      select id from stock_transfers
      where _is_admin_or_owner() and tenant_id = _current_tenant_id()
         or _is_outlet_staff(from_outlet_id)
         or _is_outlet_staff(to_outlet_id)
    )
  )
  with check (
    stock_transfer_id in (
      select id from stock_transfers
      where _is_admin_or_owner() and tenant_id = _current_tenant_id()
         or _is_outlet_staff(from_outlet_id)
         or _is_outlet_staff(to_outlet_id)
    )
  );


-- ============================================================= 3. STOCK OPNAME

create table if not exists stock_opnames (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references outlets(id),
  code text not null,
  -- Cakupan hitungan, mis. "Consumable Room", "Retail Display".
  scope text not null,
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'COUNTED', 'POSTED', 'CANCELLED')),
  opname_date date not null,
  counted_by uuid references employees(id),
  posted_at timestamptz,
  posted_by uuid references employees(id),
  notes text,
  created_at timestamptz not null default now(),
  unique (outlet_id, code)
);

create table if not exists stock_opname_items (
  id uuid primary key default gen_random_uuid(),
  stock_opname_id uuid not null references stock_opnames(id) on delete cascade,
  product_id uuid not null references products(id),
  -- Stok menurut sistem, DIBEKUKAN saat opname dimulai. Disimpan (bukan
  -- dibaca ulang dari product_stocks) supaya selisihnya tetap bisa
  -- diaudit belakangan walau stok sudah bergerak lagi sesudahnya.
  system_qty numeric not null,
  counted_qty numeric not null,
  unit_cost numeric not null default 0,
  variance_qty numeric generated always as (counted_qty - system_qty) stored,
  variance_value numeric generated always as ((counted_qty - system_qty) * unit_cost) stored,
  note text,
  unique (stock_opname_id, product_id)
);

create index if not exists stock_opnames_outlet_idx on stock_opnames (outlet_id, opname_date desc);
create index if not exists stock_opname_items_opname_idx on stock_opname_items (stock_opname_id);

alter table stock_opnames enable row level security;
alter table stock_opname_items enable row level security;

create policy stock_opnames_read on stock_opnames
  for select to authenticated
  using (outlet_id in (select id from outlets where tenant_id = _current_tenant_id()));

create policy stock_opnames_write on stock_opnames
  for all to authenticated
  using (
    _is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id())
    or _is_outlet_staff(outlet_id)
  )
  with check (
    _is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id())
    or _is_outlet_staff(outlet_id)
  );

create policy stock_opname_items_read on stock_opname_items
  for select to authenticated
  using (
    stock_opname_id in (
      select id from stock_opnames
      where outlet_id in (select id from outlets where tenant_id = _current_tenant_id())
    )
  );

create policy stock_opname_items_write on stock_opname_items
  for all to authenticated
  using (
    stock_opname_id in (
      select id from stock_opnames
      where _is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id())
         or _is_outlet_staff(outlet_id)
    )
  )
  with check (
    stock_opname_id in (
      select id from stock_opnames
      where _is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id())
         or _is_outlet_staff(outlet_id)
    )
  );


-- ============================================================== 4. PETTY CASH

-- Satu baris per outlet: saldo kas kecil berjalan + limit + custodian.
create table if not exists petty_cash (
  outlet_id uuid primary key references outlets(id),
  balance numeric not null default 0,
  -- "limit" itu kata kunci SQL, jadi dinamai limit_amount.
  limit_amount numeric not null default 0,
  custodian_employee_id uuid references employees(id),
  last_top_up_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists petty_cash_movements (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references outlets(id),
  type text not null check (type in ('TOP_UP', 'DISBURSEMENT', 'ADJUSTMENT', 'RETURN')),
  -- Positif menambah saldo (TOP_UP/RETURN), negatif mengurangi
  -- (DISBURSEMENT). ADJUSTMENT bisa dua-duanya.
  amount numeric not null,
  -- Kalau pengeluarannya dibayar dari kas kecil, baris ini menunjuk ke
  -- expense-nya supaya tidak ada dobel pencatatan.
  expense_id uuid references expenses(id) on delete set null,
  note text,
  at timestamptz not null default now(),
  by_employee_id uuid references employees(id)
);

create index if not exists petty_cash_movements_outlet_idx on petty_cash_movements (outlet_id, at desc);

alter table petty_cash enable row level security;
alter table petty_cash_movements enable row level security;

-- Kas kecil = finansial, jadi ikut pola `expenses`: manager di outlet
-- itu sendiri, atau admin/owner tenant-wide. Kasir TIDAK dapat akses.
create policy petty_cash_read on petty_cash
  for select to authenticated
  using (
    _is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id())
    or _is_manager_here(outlet_id)
  );

create policy petty_cash_write on petty_cash
  for all to authenticated
  using (
    _is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id())
    or _is_manager_here(outlet_id)
  )
  with check (
    _is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id())
    or _is_manager_here(outlet_id)
  );

create policy petty_cash_movements_read on petty_cash_movements
  for select to authenticated
  using (
    _is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id())
    or _is_manager_here(outlet_id)
  );

create policy petty_cash_movements_write on petty_cash_movements
  for all to authenticated
  using (
    _is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id())
    or _is_manager_here(outlet_id)
  )
  with check (
    _is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id())
    or _is_manager_here(outlet_id)
  );


-- ================================================== 5. JEJAK APPROVAL DI EXPENSES

-- expense_status sudah punya APPROVED/REJECTED sejak baseline, tapi
-- tidak ada catatan siapa yang menyetujui dan kapan — jadi kartu
-- "Butuh Approval" di /manager/expenses tidak akan pernah bisa
-- menampilkan riwayat keputusan yang jujur. Tiga kolom ini menutup itu.
alter table expenses add column if not exists approved_by uuid references employees(id);
alter table expenses add column if not exists approved_at timestamptz;
alter table expenses add column if not exists created_at timestamptz not null default now();

create index if not exists expenses_outlet_date_idx on expenses (outlet_id, date desc);
create index if not exists expenses_outlet_status_idx on expenses (outlet_id, status);


-- ---------------------------------------------------------------------
-- CATATAN LANJUTAN (bukan bagian migrasi, untuk pengerjaan sesudah ini)
--
-- 1. Kategori expense saat ini kolom `text` bebas. Daftar 10 kategori di
--    lib/mock/finance.ts (rent, utilities, payroll, ...) bisa tetap jadi
--    konstanta di kode. Kalau nanti mau bisa diatur per tenant, itu
--    tabel `expense_categories` tersendiri — sengaja TIDAK dimasukkan
--    ke sini supaya migrasi ini tetap sempit dan mudah di-review.
--
-- 2. `usedThisMonth` di UI Inventory tidak butuh kolom baru — itu hasil
--    sum(qty) dari stock_movements bertipe TREATMENT_USAGE + SALE pada
--    bulan berjalan.
--
-- 3. `lowStock` juga tidak butuh kolom baru — product_stocks.qty
--    dibanding products.min_stock.
--
-- 4. Belum ada tabel supplier tersendiri; `purchase_orders.supplier`
--    masih text bebas, sama seperti `expenses.vendor` yang sudah ada.
--    Konsisten, dan bisa dinormalkan belakangan kalau memang perlu.
-- ---------------------------------------------------------------------
