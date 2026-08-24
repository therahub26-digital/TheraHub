import type { Outlet, Room } from "../types";

export const OUTLETS: Outlet[] = [
  {
    id: "OUT-001",
    tenantId: "TEN-001",
    code: "AMY-CKW",
    name: "Amethyst — Cikawao",
    address: "Komplek Ruko, Jl. Cikawao Permai No. Kav. C 9, Paledang, Lengkong",
    city: "Bandung",
    phone: "0877-8811-6565",
    lat: -6.9273663,
    lng: 107.6155589,
    geofenceRadius: 120,
    accuracyThreshold: 45,
    openHours: "Setiap hari · 10:00–21:30",
    status: "ACTIVE",
    roomCount: 12,
    // Jumlah terapis dari "SQUAD TODAY" absen 20 Agustus 2026 (data nyata).
    therapistCount: 11,
    managerName: "Sinta Maharani",
    latePolicy: "FULL_DURATION",
    gracePeriodMin: 10,
    taxPct: 10,
    serviceChargePct: 5,
    receiptPrefix: "CKW",
    deposit: {
      enabled: true,
      type: "FIXED",
      value: 50_000,
      minTicket: 150_000,
      expiryMin: 60,
      refundable: true,
      appliesTo: ["Customer App", "WhatsApp", "Phone"],
      note: "Deposit dipotong dari total tagihan saat pembayaran akhir.",
    },
    profile: {
      published: true,
      tagline: "Pijatan berkualitas, bisa diandalkan, selalu uenaak",
      cover: "/img/outlets/out-001/cover.jpg",
      description:
        "Outlet Amethyst di Cikawao — pijat tradisional & refleksi dengan terapis profesional dan standar teknik yang konsisten di setiap sesi. Cocok untuk tamu yang mencari pijatan berkualitas dengan harga terjangkau di kawasan Lengkong.",
      highlights: [
        "Terapis profesional & bersertifikat",
        "Teknik pijat konsisten di setiap sesi (standar SPBU)",
        "Ruang pijat privat & nyaman",
        "Buka setiap hari, 10:00–21:30",
      ],
      facilities: [
        { name: "Lobby & Resepsionis", icon: "sparkles", desc: "Ruang tunggu nyaman di komplek ruko Cikawao Permai." },
        { name: "Ruang Pijat Privat", icon: "gem", desc: "Ruang pijat tertutup untuk kenyamanan tamu." },
        { name: "Reflexology Corner", icon: "footprints", desc: "Area khusus refleksi kaki." },
        { name: "Parkir Ruko", icon: "car", desc: "Parkir tersedia di area komplek ruko." },
      ],
      gallery: [
        { label: "Lobby & Resepsionis", src: "/img/outlets/out-001/gallery-1.jpg" },
        { label: "Ruang Pijat Privat", src: "/img/outlets/out-001/gallery-2.jpg" },
        { label: "Ruang Pijat", src: "/img/outlets/out-001/gallery-3.jpg" },
        { label: "Reflexology Corner", src: "/img/outlets/out-001/gallery-4.jpg" },
        { label: "Area Depan Ruko", src: "/img/outlets/out-001/gallery-5.jpg" },
        { label: "Area Parkir", src: "/img/outlets/out-001/gallery-6.jpg" },
      ],
    },
  },
  // Amethyst punya persis DUA cabang nyata: Cikawao & Mekarwangi (dikonfirmasi
  // via screenshot Telegram absen/skill terapis + listing Google Maps,
  // 2026-08-20). "Setiabudi" dan "Pasteur" adalah nama cabang placeholder sisa
  // dari demo fiktif "Zen Wellness" lama dan tidak pernah nyata — Setiabudi
  // di-rename jadi Mekarwangi (data asli), Pasteur dihapus dari daftar.
  {
    id: "OUT-002",
    tenantId: "TEN-001",
    code: "AMY-MKW",
    name: "Amethyst — Mekarwangi",
    address: "Jl. Mekar Agung No. 109, Mekarwangi, Kec. Bojongloa Kidul",
    city: "Bandung",
    phone: "0877-8811-6767",
    lat: -6.995_222_1,
    lng: 107.607_558_9,
    geofenceRadius: 120,
    accuracyThreshold: 45,
    // Google Maps: tutup 22:00; jam buka belum dikonfirmasi, diasumsikan sama
    // seperti Cikawao (10:00) sampai ada data pasti.
    openHours: "Setiap hari · 10:00–22:00",
    status: "ACTIVE",
    roomCount: 12,
    // Jumlah terapis dari "SQUAD TODAY" absen 20 Agustus 2026 (data nyata).
    therapistCount: 11,
    managerName: "", // belum ada data asli — sengaja dikosongkan, bukan ditebak
    latePolicy: "FULL_DURATION",
    gracePeriodMin: 10,
    taxPct: 10,
    serviceChargePct: 5,
    receiptPrefix: "MKW",
    deposit: {
      enabled: true,
      type: "FIXED",
      value: 50_000,
      minTicket: 150_000,
      expiryMin: 60,
      refundable: true,
      appliesTo: ["Customer App", "WhatsApp", "Phone"],
      note: "Deposit dipotong dari total tagihan saat pembayaran akhir.",
    },
    // Profil publik belum ada foto/copy asli — sengaja dibiarkan draft
    // (published: false, highlights/facilities/gallery kosong) daripada
    // mengarang salinan marketing, sama seperti versi Supabase sungguhannya.
    profile: {
      published: false,
      tagline: "Amethyst — Mekarwangi, Bandung",
      cover: "",
      description: "Outlet Amethyst di Mekarwangi, Bandung — pijat tradisional & refleksi.",
      highlights: [],
      facilities: [],
      gallery: [],
    },
  },
];

export const PRIMARY_OUTLET = OUTLETS[0];

export const outletOf = (id: string) => OUTLETS.find((o) => o.id === id) ?? PRIMARY_OUTLET;
export const outletName = (id: string) => outletOf(id).name.replace("Amethyst — ", "");

/**
 * Hitung nominal deposit (rupiah) untuk sebuah booking di outlet tertentu.
 * Mengembalikan 0 bila deposit tidak berlaku untuk transaksi ini.
 */
export function depositFor(outletId: string, ticketTotal: number): number {
  const d = outletOf(outletId).deposit;
  if (!d.enabled || ticketTotal < d.minTicket) return 0;
  const raw = d.type === "FIXED" ? d.value : (ticketTotal * d.value) / 100;
  return Math.round(raw / 1000) * 1000;
}

/** Label ringkas kebijakan deposit outlet, mis. "Rp50.000" atau "30% dari harga". */
export function depositLabel(outletId: string): string {
  const d = outletOf(outletId).deposit;
  if (!d.enabled) return "Tidak ada deposit";
  return d.type === "FIXED"
    ? `Rp${d.value.toLocaleString("id-ID")}`
    : `${d.value}% dari harga layanan`;
}

const ROOM_DEFS: { outletId: string; rooms: [string, Room["type"], number, Room["status"]][] }[] = [
  {
    outletId: "OUT-001",
    // 12 room (jumlah nyata dari Amethyst Cikawao) — tipe Couple/VIP/Wet Room
    // di bawah ini masih ilustratif untuk demo (belum ada breakdown tipe room
    // yang dikonfirmasi asli), total 12 sudah sesuai data nyata.
    rooms: [
      ["Massage Room 01", "Massage", 1, "ACTIVE"],
      ["Massage Room 02", "Massage", 1, "ACTIVE"],
      ["Massage Room 03", "Massage", 1, "ACTIVE"],
      ["Massage Room 04", "Massage", 1, "ACTIVE"],
      ["Massage Room 05", "Massage", 1, "MAINTENANCE"],
      ["Massage Room 06", "Massage", 1, "ACTIVE"],
      ["Massage Room 07", "Massage", 1, "ACTIVE"],
      ["Couple Suite A", "Couple", 2, "ACTIVE"],
      ["Couple Suite B", "Couple", 2, "ACTIVE"],
      ["Reflexology Lounge", "Reflexology Chair", 6, "ACTIVE"],
      ["VIP Sanctuary", "VIP", 2, "ACTIVE"],
      ["Wet Room Scrub", "Wet Room", 1, "ACTIVE"],
    ],
  },
  {
    outletId: "OUT-002",
    // 12 room (jumlah nyata dari Amethyst Mekarwangi) — sama seperti di atas,
    // tipe room masih ilustratif untuk demo.
    rooms: [
      ["Massage Room 01", "Massage", 1, "ACTIVE"],
      ["Massage Room 02", "Massage", 1, "ACTIVE"],
      ["Massage Room 03", "Massage", 1, "ACTIVE"],
      ["Massage Room 04", "Massage", 1, "ACTIVE"],
      ["Massage Room 05", "Massage", 1, "ACTIVE"],
      ["Massage Room 06", "Massage", 1, "ACTIVE"],
      ["Couple Suite", "Couple", 2, "ACTIVE"],
      ["Reflexology Lounge", "Reflexology Chair", 4, "ACTIVE"],
      ["VIP Room", "VIP", 2, "ACTIVE"],
      ["Wet Room", "Wet Room", 1, "INACTIVE"],
      ["Massage Room 07", "Massage", 1, "ACTIVE"],
      ["Massage Room 08", "Massage", 1, "ACTIVE"],
    ],
  },
];

const SUPPORTED: Record<Room["type"], string[]> = {
  Massage: ["Traditional Massage", "Thai Massage", "Aromatherapy", "Deep Tissue", "Hot Stone"],
  Couple: ["Traditional Massage", "Aromatherapy", "Body Scrub"],
  "Reflexology Chair": ["Reflexology", "Foot Massage"],
  VIP: ["Traditional Massage", "Thai Massage", "Hot Stone", "Body Scrub", "Aromatherapy"],
  "Wet Room": ["Body Scrub", "Body Mask", "Milk Bath"],
};

export const ROOMS: Room[] = ROOM_DEFS.flatMap((g, gi) =>
  g.rooms.map((r, i) => ({
    id: `RM-${gi + 1}${String(i + 1).padStart(2, "0")}`,
    outletId: g.outletId,
    code: `RM-${String(i + 1).padStart(2, "0")}`,
    name: r[0],
    type: r[1],
    capacity: r[2],
    supportedServices: SUPPORTED[r[1]],
    status: r[3],
    cleanupBuffer: r[1] === "Wet Room" ? 20 : r[1] === "Reflexology Chair" ? 5 : 10,
  })),
);

export const roomsOf = (outletId: string) => ROOMS.filter((r) => r.outletId === outletId);

export const BUSINESS_PROFILE = {
  brandName: "Amethyst",
  legalName: "Amethyst", // TODO: ganti dengan nama badan usaha resmi (PT/CV) begitu ada
  npwp: "31.284.991.7-423.000", // placeholder — belum data asli
  email: "hello@amethyst.test", // placeholder — belum data asli
  phone: "0877-8811-6565",
  whatsapp: "0877-8811-6565",
  website: "", // belum ada
  address: "Komplek Ruko, Jl. Cikawao Permai No. Kav. C 9, Paledang, Lengkong, Bandung 40261",
  instagram: "", // belum ada
  invoiceFooter: "Terima kasih atas kunjungan Anda. Simpan struk ini sebagai bukti pembayaran.",
  logoTone: "teal",
  tagline: "Pijatan Berkualitas",
};

export const SETUP_STEPS = [
  { key: "profile", label: "Business Profile", desc: "Logo, nama brand, kontak, identitas invoice", done: true, owner: "Admin" },
  { key: "outlet", label: "Outlet", desc: "Nama, alamat, phone/WA, timezone, maps, jam buka", done: true, owner: "Admin" },
  { key: "geofence", label: "Geofence & Attendance", desc: "Latitude/longitude, radius, accuracy threshold", done: true, owner: "Admin" },
  { key: "users", label: "Users & Assignment", desc: "Owner, Manager, Kasir, Terapis, Karyawan", done: true, owner: "Admin" },
  { key: "rooms", label: "Rooms", desc: "Room name/type/capacity/status per outlet", done: true, owner: "Admin" },
  { key: "master", label: "Master Initial", desc: "Kategori layanan, starter package, therapist import", done: true, owner: "Admin" },
  { key: "payment", label: "Payments & Printer", desc: "Metode bayar, numbering, printer profile", done: false, owner: "Admin" },
  { key: "policy", label: "Policy Defaults", desc: "Booking lead time, late arrival, no-show, tax", done: false, owner: "Admin" },
];

// UPDATE 2026-08-24 — four of these six used to say "Connected" with a
// green tick and a plausible "last sync" timestamp. Not one integration
// exists: there is no Midtrans code in the repo, no WhatsApp sender, the
// map on /admin/geofence is a hand-drawn graphic rather than Google Maps,
// and there is no printer or print-job table in the schema at all. The
// audit flagged this as the single most misleading screen in the product
// — someone reading it would reasonably conclude payments were already
// wired up and plan around that. A mock page is fine; a mock page that
// asserts a specific false fact about production is not. Statuses are
// now uniformly "Not connected", which is simply true, and `desc` says
// what each one is *planned* to do.
export const INTEGRATIONS = [
  { key: "wa", name: "WhatsApp Business API", provider: "Qontak", status: "Not connected", desc: "Rencana: booking confirmation, reminder, receipt digital. Belum ada integrasi.", lastSync: "—" },
  { key: "payment", name: "Payment Gateway", provider: "Midtrans", status: "Not connected", desc: "Rencana: QRIS, kartu, e-wallet + webhook reconciliation. Belum ada integrasi.", lastSync: "—" },
  { key: "maps", name: "Maps & Geocoding", provider: "Google Maps", status: "Not connected", desc: "Rencana: setup outlet, geofence, jarak absensi. Peta di halaman Geofence masih gambar buatan sendiri.", lastSync: "—" },
  { key: "print", name: "Print Bridge", provider: "TheraHub Device Bridge", status: "Not connected", desc: "Rencana: Bluetooth ESC/POS 58 mm & 80 mm LAN. Cetak struk belum dibangun.", lastSync: "—" },
  { key: "accounting", name: "Accounting Export", provider: "Accurate Online", status: "Not connected", desc: "Rencana: export jurnal penjualan, biaya, dan payroll.", lastSync: "—" },
  { key: "biometric", name: "Biometric / Device Integrity", provider: "—", status: "Not connected", desc: "Rencana: verifikasi device untuk absensi terapis.", lastSync: "—" },
];
