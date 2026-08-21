import type {
  ServiceCategory,
  ServiceType,
  ServicePackage,
  ExtensionOption,
  AddOn,
  Promotion,
} from "../types";
import { OUTLETS } from "./org";

export const CATEGORIES: ServiceCategory[] = [
  { id: "CAT-01", tenantId: "TEN-001", name: "Massage", icon: "hand", description: "Pijat tubuh dengan berbagai teknik dan tekanan." },
  { id: "CAT-02", tenantId: "TEN-001", name: "Reflexology", icon: "footprints", description: "Terapi titik refleksi kaki dan tangan." },
  { id: "CAT-03", tenantId: "TEN-001", name: "Body Treatment", icon: "sparkles", description: "Scrub, masker, dan perawatan kulit tubuh." },
  { id: "CAT-04", tenantId: "TEN-001", name: "Signature Ritual", icon: "flower", description: "Rangkaian treatment khas Amethyst." },
];

export const SERVICE_TYPES: ServiceType[] = [
  { id: "ST-01", categoryId: "CAT-01", name: "Traditional Massage", requiredSkill: "Traditional Massage", description: "Pijat tradisional Indonesia dengan minyak hangat." },
  { id: "ST-02", categoryId: "CAT-01", name: "Thai Massage", requiredSkill: "Thai Massage", description: "Peregangan dan tekanan tanpa minyak." },
  { id: "ST-03", categoryId: "CAT-01", name: "Deep Tissue", requiredSkill: "Deep Tissue", description: "Tekanan dalam untuk otot tegang." },
  { id: "ST-04", categoryId: "CAT-01", name: "Aromatherapy", requiredSkill: "Aromatherapy", description: "Pijat lembut dengan essential oil pilihan." },
  { id: "ST-05", categoryId: "CAT-01", name: "Hot Stone", requiredSkill: "Hot Stone", description: "Batu basalt hangat untuk relaksasi mendalam." },
  { id: "ST-06", categoryId: "CAT-02", name: "Reflexology", requiredSkill: "Reflexology", description: "Titik refleksi telapak kaki." },
  { id: "ST-07", categoryId: "CAT-03", name: "Body Scrub", requiredSkill: "Body Scrub", description: "Eksfoliasi tubuh dengan scrub rempah." },
  { id: "ST-08", categoryId: "CAT-03", name: "Body Mask", requiredSkill: "Body Scrub", description: "Masker tubuh menutrisi setelah scrub." },
  { id: "ST-09", categoryId: "CAT-04", name: "Zen Signature Ritual", requiredSkill: "Aromatherapy", description: "Scrub + massage + hot compress." },
  { id: "ST-10", categoryId: "CAT-01", name: "Prenatal Massage", requiredSkill: "Prenatal", description: "Pijat aman untuk ibu hamil trimester 2–3." },
];

type PkgSeed = [
  typeId: string,
  name: string,
  dur: number,
  price: number,
  roomType: string,
  comm: number,
  pop: number,
];

const PKG_SEEDS: PkgSeed[] = [
  ["ST-01", "Traditional Massage 60", 60, 150_000, "Massage", 35_000, 94],
  ["ST-01", "Traditional Massage 90", 90, 200_000, "Massage", 50_000, 100],
  ["ST-01", "Traditional Massage 120", 120, 265_000, "Massage", 65_000, 61],
  ["ST-02", "Thai Massage 60", 60, 170_000, "Massage", 40_000, 78],
  ["ST-02", "Thai Massage 90", 90, 230_000, "Massage", 55_000, 72],
  ["ST-03", "Deep Tissue 60", 60, 195_000, "Massage", 45_000, 66],
  ["ST-03", "Deep Tissue 90", 90, 265_000, "Massage", 62_000, 49],
  ["ST-04", "Aromatherapy 60", 60, 185_000, "Massage", 42_000, 71],
  ["ST-04", "Aromatherapy 90", 90, 245_000, "Massage", 58_000, 83],
  ["ST-05", "Hot Stone 90", 90, 295_000, "VIP", 70_000, 44],
  ["ST-06", "Reflexology 45", 45, 110_000, "Reflexology Chair", 26_000, 88],
  ["ST-06", "Reflexology 60", 60, 140_000, "Reflexology Chair", 33_000, 69],
  ["ST-07", "Body Scrub 60", 60, 210_000, "Wet Room", 48_000, 52],
  ["ST-08", "Body Mask 45", 45, 175_000, "Wet Room", 40_000, 27],
  ["ST-09", "Zen Signature Ritual 150", 150, 495_000, "VIP", 120_000, 38],
  ["ST-10", "Prenatal Massage 60", 60, 205_000, "Massage", 50_000, 21],
];

const MATERIALS: Record<string, { name: string; qty: string }[]> = {
  "Traditional Massage": [
    { name: "Massage Oil Lemongrass", qty: "25 ml" },
    { name: "Tissue Roll", qty: "3 pcs" },
    { name: "Disposable Sheet", qty: "1 pcs" },
  ],
  "Thai Massage": [
    { name: "Thai Balm", qty: "10 gr" },
    { name: "Disposable Sheet", qty: "1 pcs" },
  ],
  "Deep Tissue": [
    { name: "Massage Oil Arnica", qty: "30 ml" },
    { name: "Disposable Sheet", qty: "1 pcs" },
  ],
  Aromatherapy: [
    { name: "Essential Oil Blend", qty: "8 ml" },
    { name: "Massage Oil Almond", qty: "25 ml" },
    { name: "Disposable Sheet", qty: "1 pcs" },
  ],
  "Hot Stone": [
    { name: "Massage Oil Almond", qty: "30 ml" },
    { name: "Basalt Stone Set", qty: "1 set" },
  ],
  Reflexology: [{ name: "Foot Balm", qty: "12 gr" }, { name: "Tissue Roll", qty: "2 pcs" }],
  "Body Scrub": [
    { name: "Body Scrub Rempah", qty: "40 gr" },
    { name: "Liquid Soap", qty: "20 ml" },
    { name: "Disposable Sheet", qty: "1 pcs" },
  ],
  "Body Mask": [{ name: "Body Mask Clay", qty: "50 gr" }, { name: "Disposable Sheet", qty: "1 pcs" }],
};

export const PACKAGES: ServicePackage[] = OUTLETS.flatMap((o, oi) =>
  PKG_SEEDS.map((s, i) => {
    const st = SERVICE_TYPES.find((t) => t.id === s[0])!;
    const priceMult = oi === 0 ? 1 : oi === 1 ? 0.94 : 0.9;
    const price = Math.round((s[3] * priceMult) / 5000) * 5000;
    const inactive = oi === 2 && (s[1].includes("Signature") || s[1].includes("Prenatal"));
    return {
      id: `PKG-${oi + 1}${String(i + 1).padStart(2, "0")}`,
      outletId: o.id,
      serviceTypeId: s[0],
      name: s[1],
      durationMin: s[2],
      listPrice: price,
      memberPrice: Math.round((price * 0.9) / 1000) * 1000,
      weekendPrice: Math.round((price * 1.1) / 5000) * 5000,
      roomType: s[4],
      requiredSkill: st.requiredSkill,
      bufferBefore: 0,
      bufferAfter: s[4] === "Wet Room" ? 20 : s[4] === "Reflexology Chair" ? 5 : 10,
      extensionAllowed: !s[1].includes("Signature"),
      allowedExtensionIds:
        s[2] >= 90 ? ["EXT-15", "EXT-30", "EXT-60"] : ["EXT-15", "EXT-30"],
      commissionType: "fixed" as const,
      commissionValue: Math.round((s[5] * priceMult) / 1000) * 1000,
      status: inactive ? ("INACTIVE" as const) : ("ACTIVE" as const),
      popularity: s[6],
      materials: MATERIALS[st.requiredSkill] ?? [],
    };
  }),
);

export const packagesOf = (outletId: string) => PACKAGES.filter((p) => p.outletId === outletId);
export const packageById = (id: string) => PACKAGES.find((p) => p.id === id);

export const EXTENSIONS: ExtensionOption[] = OUTLETS.flatMap((o) => [
  { id: `EXT-15`, outletId: o.id, name: "Extension +15", durationMin: 15, price: 40_000, commissionType: "fixed" as const, commission: 12_000, active: true },
  { id: `EXT-30`, outletId: o.id, name: "Extension +30", durationMin: 30, price: 70_000, commissionType: "fixed" as const, commission: 20_000, active: true },
  { id: `EXT-60`, outletId: o.id, name: "Extension +60", durationMin: 60, price: 120_000, commissionType: "fixed" as const, commission: 38_000, active: o.id !== "OUT-003" },
]);

export const extensionsOf = (outletId: string) => EXTENSIONS.filter((e) => e.outletId === outletId);

export const ADDONS: AddOn[] = OUTLETS.flatMap((o) => [
  { id: `ADD-HS`, outletId: o.id, name: "Hot Stone Add-on", price: 65_000, commissionType: "fixed" as const, commission: 15_000, durationMin: 0, active: true },
  { id: `ADD-AR`, outletId: o.id, name: "Aromatherapy Upgrade", price: 45_000, commissionType: "fixed" as const, commission: 12_000, durationMin: 0, active: true },
  { id: `ADD-HC`, outletId: o.id, name: "Hot Compress", price: 35_000, commissionType: "fixed" as const, commission: 9_000, durationMin: 0, active: true },
  { id: `ADD-GS`, outletId: o.id, name: "Ginger Foot Soak", price: 40_000, commissionType: "fixed" as const, commission: 10_000, durationMin: 10, active: o.id !== "OUT-002" },
  { id: `ADD-SC`, outletId: o.id, name: "Scalp Massage 15", price: 55_000, commissionType: "fixed" as const, commission: 14_000, durationMin: 15, active: true },
]);

export const addonsOf = (outletId: string) => ADDONS.filter((a) => a.outletId === outletId);

export const PROMOTIONS: Promotion[] = [
  { id: "PRM-001", outletId: "OUT-001", name: "Weekday Happy Hour", type: "Promo", value: "-20% jam 11:00–15:00", newCustomersOnly: false, validFrom: "2026-07-01", validTo: "2026-09-30", usageCount: 412, maxUsage: null, status: "ACTIVE" },
  { id: "PRM-002", outletId: "OUT-001", name: "WELCOME50", type: "Voucher", code: "WELCOME50", value: "Rp50.000 untuk kunjungan pertama", discountAmount: 50_000, newCustomersOnly: true, validFrom: "2026-01-01", validTo: "2026-12-31", usageCount: 186, maxUsage: 500, status: "ACTIVE" },
  { id: "PRM-009", outletId: "OUT-001", name: "Ajak Teman", type: "Voucher", code: "AJAKTEMAN30", value: "Rp30.000 untuk teman baru", discountAmount: 30_000, newCustomersOnly: true, validFrom: "2026-01-01", validTo: "2030-12-31", usageCount: 57, maxUsage: null, status: "ACTIVE" },
  { id: "PRM-003", outletId: "OUT-001", name: "Massage 60 × 10 Sesi", type: "Prepaid Package", value: "Rp1.250.000 (hemat Rp250.000)", newCustomersOnly: false, validFrom: "2026-03-01", validTo: "2026-12-31", usageCount: 74, maxUsage: null, status: "ACTIVE" },
  { id: "PRM-004", outletId: "OUT-001", name: "Gold Membership", type: "Membership", value: "Rp1.000.000/tahun · diskon 10%", newCustomersOnly: false, validFrom: "2026-01-01", validTo: "2026-12-31", usageCount: 128, maxUsage: null, status: "ACTIVE" },
  { id: "PRM-005", outletId: "OUT-001", name: "Loyalty Points", type: "Loyalty", value: "Rp10.000 = 1 poin", newCustomersOnly: false, validFrom: "2025-06-01", validTo: "2026-12-31", usageCount: 2_940, maxUsage: null, status: "ACTIVE" },
  { id: "PRM-006", outletId: "OUT-002", name: "Dormant 60 Hari", type: "Promo", value: "-15% untuk customer tidak aktif 60 hari", newCustomersOnly: false, validFrom: "2026-08-01", validTo: "2026-08-31", usageCount: 33, maxUsage: 200, status: "ACTIVE" },
  { id: "PRM-007", outletId: "OUT-001", name: "Ramadhan Serenity", type: "Promo", value: "-25% paket 90 menit", newCustomersOnly: false, validFrom: "2027-02-01", validTo: "2027-03-15", usageCount: 0, maxUsage: null, status: "SCHEDULED" },
  { id: "PRM-008", outletId: "OUT-003", name: "Grand Opening Pasteur", type: "Voucher", code: "PASTEUR100", value: "Rp100.000 min. belanja Rp350.000", discountAmount: 100_000, newCustomersOnly: false, validFrom: "2026-04-01", validTo: "2026-06-30", usageCount: 241, maxUsage: 250, status: "EXPIRED" },
];

export const promotionsOf = (outletId: string) => PROMOTIONS.filter((p) => p.outletId === outletId);
