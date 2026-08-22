import type { Employee, AttendanceEvent, Customer, JobRole } from "../types";
import { makeRng, int, pick, chance, sample, TODAY } from "./rng";
import { toneFor, parseLocal } from "../format";

const SKILLS = [
  "Traditional Massage",
  "Thai Massage",
  "Deep Tissue",
  "Aromatherapy",
  "Hot Stone",
  "Reflexology",
  "Body Scrub",
  "Prenatal",
  "Sport Recovery",
  "Lymphatic Drainage",
];

export const SKILL_LIST = SKILLS;

type Seed = [name: string, outlet: string, role: JobRole, grade: string, join: string];

const PEOPLE: Seed[] = [
  // --- OUT-001 Dago ---
  ["Sinta Maharani", "OUT-001", "Manager", "M2", "2023-03-06"],
  ["Nurul Fadhilah", "OUT-001", "Kasir", "K2", "2024-01-15"],
  ["Bayu Ramadhan", "OUT-001", "Kasir", "K1", "2025-04-01"],
  ["Wawan Setiawan", "OUT-001", "Office Boy", "S1", "2024-07-19"],
  ["Melati Puspita", "OUT-001", "Terapis", "T3", "2022-08-11"],
  ["Ayu Lestari", "OUT-001", "Terapis", "T3", "2022-11-02"],
  ["Rina Kartika", "OUT-001", "Terapis", "T2", "2023-05-22"],
  ["Dewi Sartika", "OUT-001", "Terapis", "T2", "2023-09-04"],
  ["Putri Handayani", "OUT-001", "Terapis", "T2", "2024-02-13"],
  ["Sari Wulandari", "OUT-001", "Terapis", "T1", "2025-01-08"],
  ["Ningsih Rahayu", "OUT-001", "Terapis", "T2", "2023-12-01"],
  ["Fitri Ramadhani", "OUT-001", "Terapis", "T1", "2025-06-17"],
  ["Agus Firmansyah", "OUT-001", "Terapis", "T3", "2021-10-25"],
  ["Joko Purnomo", "OUT-001", "Terapis", "T2", "2024-04-09"],
  ["Indah Permata", "OUT-001", "Terapis", "T1", "2025-09-30"],
  ["Lina Marlina", "OUT-001", "Terapis", "T2", "2023-07-14"],
  // --- OUT-002 Setiabudi ---
  ["Yoga Saputra", "OUT-002", "Manager", "M1", "2023-08-21"],
  ["Citra Ayuningtyas", "OUT-002", "Kasir", "K2", "2024-05-06"],
  ["Hendi Kurniawan", "OUT-002", "Office Boy", "S1", "2025-02-24"],
  ["Maya Anggraini", "OUT-002", "Terapis", "T3", "2022-04-18"],
  ["Wulan Safitri", "OUT-002", "Terapis", "T2", "2023-10-30"],
  ["Ratih Purnamasari", "OUT-002", "Terapis", "T2", "2024-03-11"],
  ["Siti Aminah", "OUT-002", "Terapis", "T1", "2025-07-07"],
  ["Nanda Prasetyo", "OUT-002", "Terapis", "T2", "2024-08-19"],
  ["Rani Oktaviani", "OUT-002", "Terapis", "T1", "2025-11-03"],
  ["Vina Amelia", "OUT-002", "Terapis", "T2", "2023-06-26"],
  ["Bagus Hermawan", "OUT-002", "Terapis", "T3", "2022-01-17"],
  ["Tika Wijayanti", "OUT-002", "Terapis", "T1", "2026-01-12"],
  // --- OUT-003 Pasteur ---
  ["Ratna Kusumawati", "OUT-003", "Manager", "M1", "2024-02-05"],
  ["Dimas Aryo", "OUT-003", "Kasir", "K1", "2025-03-17"],
  ["Sri Mulyani", "OUT-003", "Admin Umum", "A1", "2024-09-09"],
  ["Kartika Sari", "OUT-003", "Terapis", "T3", "2022-06-13"],
  ["Endah Pratiwi", "OUT-003", "Terapis", "T2", "2024-01-29"],
  ["Yuni Astuti", "OUT-003", "Terapis", "T2", "2023-11-20"],
  ["Laras Wardhani", "OUT-003", "Terapis", "T1", "2025-08-25"],
  ["Bambang Sutrisno", "OUT-003", "Terapis", "T2", "2024-06-03"],
  ["Nia Kurniasih", "OUT-003", "Terapis", "T1", "2026-02-02"],
  ["Hesti Rahmawati", "OUT-003", "Terapis", "T2", "2023-04-15"],
  ["Farhan Maulana", "OUT-003", "Supervisor", "S2", "2023-01-23"],
];

const BASE_SALARY: Record<string, number> = {
  M1: 6_500_000, M2: 7_800_000, K1: 3_200_000, K2: 3_800_000,
  T1: 2_400_000, T2: 2_800_000, T3: 3_200_000, S1: 2_600_000, S2: 4_500_000, A1: 3_400_000,
};

const THERAPIST_GRADE: Record<string, "Junior" | "Senior" | "Master"> = {
  T1: "Junior", T2: "Senior", T3: "Master",
};

const SHIFTS = ["10:00–18:00", "12:00–20:00", "14:00–22:00", "09:00–17:00", "13:00–21:00"];

/**
 * Terapis yang dipromosikan Admin/Manager di halaman profil outlet —
 * terapis baru yang baru bergabung, dan terapis senior favorit tamu.
 * Ditampilkan di /customer/outlets/[id].
 */
const FEATURED: Record<string, { badge: string; bio: string }> = {
  "Indah Permata": {
    badge: "Baru Bergabung",
    bio: "Terapis baru di outlet Dago, bersertifikat Traditional & Thai Massage. Dikenal dengan sentuhan lembut dan komunikasi yang hangat ke tamu.",
  },
  "Melati Puspita": {
    badge: "Favorit Tamu",
    bio: "Terapis Master dengan pengalaman lebih dari 4 tahun. Spesialis Deep Tissue & Hot Stone, jadi favorit tamu VIP di outlet Dago.",
  },
  "Tika Wijayanti": {
    badge: "Baru Bergabung",
    bio: "Terapis baru di outlet Setiabudi, fokus pada Aromatherapy & Reflexology untuk relaksasi cepat di jam istirahat kerja.",
  },
  "Maya Anggraini": {
    badge: "Favorit Tamu",
    bio: "Terapis Master, andalan tamu corporate di area Setiabudi sejak 2022. Ahli Thai Massage & Sport Recovery.",
  },
  "Nia Kurniasih": {
    badge: "Baru Bergabung",
    bio: "Terapis baru bergabung di outlet Pasteur, membawa teknik Body Scrub & Milk Bath dengan sentuhan modern.",
  },
  "Kartika Sari": {
    badge: "Favorit Tamu",
    bio: "Terapis Master paling senior di Pasteur, spesialis Hot Stone & VIP treatment sejak outlet ini dibuka.",
  },
};

export const EMPLOYEES: Employee[] = PEOPLE.map((p, i) => {
  const r = makeRng(1000 + i * 37);
  const [name, outletId, jobRole, grade, join] = p;
  const isTherapist = jobRole === "Terapis";
  const tGrade = isTherapist ? THERAPIST_GRADE[grade] : undefined;
  const skillCount = tGrade === "Master" ? 6 : tGrade === "Senior" ? 4 : 3;
  const guestCount = isTherapist ? int(r, 42, 118) : 0;
  const treatmentMinutes = isTherapist ? guestCount * int(r, 62, 96) : 0;
  const revenue = isTherapist ? guestCount * int(r, 165_000, 285_000) : 0;

  let presence: Employee["presence"] = "AVAILABLE";
  if (isTherapist) {
    const roll = r();
    presence = roll < 0.3 ? "IN_SESSION" : roll < 0.42 ? "BREAK" : roll < 0.55 ? "OFF" : roll < 0.6 ? "LATE" : "AVAILABLE";
  } else {
    presence = chance(r, 0.12) ? "OFF" : "AVAILABLE";
  }

  return {
    id: `EMP-${String(i + 1).padStart(3, "0")}`,
    tenantId: "TEN-001",
    outletId,
    code: isTherapist ? `TRP-${String(i + 1).padStart(3, "0")}` : `${jobRole.slice(0, 3).toUpperCase()}-${String(i + 1).padStart(3, "0")}`,
    name,
    jobRole,
    grade,
    phone: `+62 8${int(r, 11, 59)}-${int(r, 1000, 9999)}-${int(r, 1000, 9999)}`,
    email: `${name.toLowerCase().split(" ")[0]}.${name.toLowerCase().split(" ")[1] ?? "zw"}@zenwellness.id`,
    joinDate: join,
    status: chance(r, 0.05) ? "SUSPENDED" : "ACTIVE",
    contractType: grade.startsWith("T") && THERAPIST_GRADE[grade] === "Junior" ? "Kontrak" : "Tetap",
    baseSalary: BASE_SALARY[grade] ?? 3_000_000,
    fixedAllowance: int(r, 3, 9) * 100_000,
    avatarTone: toneFor(name),
    isTherapist,
    skills: isTherapist ? sample(r, SKILLS, skillCount).sort() : [],
    therapistGrade: tGrade,
    maxSessionsPerDay: isTherapist ? (tGrade === "Master" ? 7 : 6) : undefined,
    rating: isTherapist ? Math.round((4.1 + r() * 0.85) * 10) / 10 : undefined,
    requestedCount: isTherapist ? int(r, 3, 46) : undefined,
    utilization: isTherapist ? Math.round((52 + r() * 39) * 10) / 10 : undefined,
    guestCount: isTherapist ? guestCount : undefined,
    treatmentMinutes: isTherapist ? treatmentMinutes : undefined,
    revenueGenerated: isTherapist ? revenue : undefined,
    commissionMTD: isTherapist ? Math.round(revenue * (0.16 + r() * 0.09) / 1000) * 1000 : undefined,
    savingsBalance: Math.round(int(r, 4, 68) * 125_000),
    shiftToday: presence === "OFF" ? "OFF" : pick(r, SHIFTS),
    presence,
    featured: isTherapist && FEATURED[name] !== undefined,
    featuredBadge: isTherapist ? FEATURED[name]?.badge : undefined,
    bio: isTherapist ? FEATURED[name]?.bio : undefined,
    galleryUrls: [],
  };
});

export const THERAPISTS = EMPLOYEES.filter((e) => e.isTherapist);
export const employeesOf = (outletId: string) => EMPLOYEES.filter((e) => e.outletId === outletId);
export const therapistsOf = (outletId: string) => THERAPISTS.filter((e) => e.outletId === outletId);
export const employeeById = (id: string) => EMPLOYEES.find((e) => e.id === id);
export const featuredTherapistsOf = (outletId: string) => THERAPISTS.filter((e) => e.outletId === outletId && e.featured);

// ------------------------------------------------------ per-day availability
export type DayStatus = "AVAILABLE" | "OFF" | "SICK";

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h || 1;
}

/**
 * Roster status for a therapist on a given date — independent of
 * `presence` (which models *today's* intraday state: in-session, break,
 * late…). A therapist gallery for a future date needs a day-level
 * "are they even working" answer instead, and it has to differ from one
 * date to the next (a fixed weekly day off + a small deterministic chance
 * of unscheduled sick/cuti), otherwise every day would look identical.
 *
 * For TODAY specifically, this reconciles with `presence` so the two
 * screens never contradict each other: OFF/ABSENT there maps to
 * OFF/SICK here.
 */
export function therapistDayStatus(therapistId: string, dateIso: string): DayStatus {
  if (dateIso === TODAY) {
    const t = EMPLOYEES.find((e) => e.id === therapistId);
    if (t?.presence === "OFF") return "OFF";
    if (t?.presence === "ABSENT") return "SICK";
    return "AVAILABLE";
  }
  const offDow = hashSeed(therapistId) % 7;
  const dow = parseLocal(dateIso).getDay();
  if (dow === offDow) return "OFF";
  const r = makeRng(hashSeed(`${therapistId}:${dateIso}`));
  return r() < 0.07 ? "SICK" : "AVAILABLE";
}

/** The therapist persona used by the Therapist app demo. */
export const ME_THERAPIST = THERAPISTS.find((t) => t.name === "Melati Puspita")!;

// ---------------------------------------------------------------- attendance
export const ATTENDANCE: AttendanceEvent[] = EMPLOYEES.flatMap((e, ei) => {
  const r = makeRng(5000 + ei * 91);
  const rows: AttendanceEvent[] = [];
  for (let d = 0; d < 7; d++) {
    const day = 18 - d;
    const date = `2026-08-${String(day).padStart(2, "0")}`;
    const shift = e.shiftToday === "OFF" && d === 0 ? "OFF" : pick(r, SHIFTS);
    if (shift === "OFF") continue;
    const [start] = shift.split("–");
    const roll = r();
    let status: AttendanceEvent["status"] = "CHECKED_OUT";
    let locationStatus: AttendanceEvent["locationStatus"] = "VALID";
    let lateMinutes = 0;
    let distance = int(r, 4, 68);
    let accuracy = int(r, 6, 32);

    if (roll < 0.06) {
      status = "ABSENT";
    } else if (roll < 0.2) {
      status = "LATE";
      lateMinutes = int(r, 3, 34);
    } else if (roll < 0.26) {
      status = "SUSPICIOUS";
      locationStatus = chance(r, 0.5) ? "SUSPICIOUS" : "OUTSIDE";
      distance = int(r, 140, 1_450);
      accuracy = int(r, 55, 210);
    } else if (d === 0) {
      status = "CHECKED_IN";
    }

    const [sh, sm] = start.split(":").map(Number);
    const inMin = sh * 60 + sm - int(r, 0, 12) + lateMinutes;
    const checkIn = status === "ABSENT" ? null : `${date}T${String(Math.floor(inMin / 60)).padStart(2, "0")}:${String(inMin % 60).padStart(2, "0")}`;
    const checkOut =
      status === "ABSENT" || status === "CHECKED_IN"
        ? null
        : `${date}T${shift.split("–")[1]}`;

    rows.push({
      id: `ATT-${ei}-${d}`,
      employeeId: e.id,
      employeeName: e.name,
      outletId: e.outletId,
      date,
      shift,
      checkInAt: checkIn,
      checkOutAt: checkOut,
      lat: -6.885_2 + (r() - 0.5) * 0.004,
      lng: 107.613_4 + (r() - 0.5) * 0.004,
      accuracy,
      distanceFromGeofence: distance,
      deviceId: `DVC-${String(ei * 7 + 100).padStart(4, "0")}`,
      appVersion: pick(r, ["2.4.1", "2.4.0", "2.3.8"]),
      locationStatus,
      lateMinutes,
      status,
      note:
        status === "SUSPICIOUS"
          ? pick(r, [
              "Mock location indicator terdeteksi",
              "Akurasi GPS di atas threshold outlet",
              "Lompatan lokasi antara check-in dan event",
              "Check-in dari luar radius geofence",
            ])
          : undefined,
    });
  }
  return rows;
});

export const attendanceToday = (outletId: string) =>
  ATTENDANCE.filter((a) => a.date === TODAY && a.outletId === outletId);

export const attendanceOf = (employeeId: string) =>
  ATTENDANCE.filter((a) => a.employeeId === employeeId).sort((a, b) => (a.date < b.date ? 1 : -1));

// ---------------------------------------------------------------- customers
const FIRST = ["Andini", "Bagas", "Cindy", "Dimas", "Erika", "Fajar", "Gita", "Hana", "Ilham", "Jasmine", "Kevin", "Lia", "Mira", "Nadia", "Oscar", "Prita", "Qori", "Rizky", "Sasha", "Tono", "Ulfa", "Vera", "Wira", "Yanti", "Zaki", "Bella", "Caca", "Doni", "Elsa", "Farid", "Gilang", "Hesti", "Intan", "Jefri", "Kirana", "Lukman", "Mega", "Nino", "Okta", "Puspa"];
const LAST = ["Nugroho", "Wijaya", "Santoso", "Halim", "Pranata", "Susanto", "Hartono", "Gunawan", "Setiadi", "Wibowo", "Kusuma", "Salim", "Tanuwijaya", "Iskandar", "Maulana", "Firdaus", "Hidayat", "Nasution", "Sitorus", "Pakpahan"];

const SERVICES_POP = ["Traditional Massage 90", "Thai Massage 60", "Aromatherapy 90", "Reflexology 45", "Body Scrub 60", "Hot Stone 90", "Deep Tissue 60"];

export const CUSTOMERS: Customer[] = Array.from({ length: 148 }, (_, i) => {
  const r = makeRng(7700 + i * 53);
  const name = `${pick(r, FIRST)} ${pick(r, LAST)}`;
  const visits = int(r, 1, 62);
  const avg = int(r, 145, 420) * 1000;
  const segment: Customer["segment"] =
    visits >= 30 ? "VIP" : visits >= 6 ? "Active" : visits <= 2 ? "New" : chance(r, 0.2) ? "Dormant" : "Active";
  const membership: Customer["membership"] =
    segment === "VIP" ? (chance(r, 0.5) ? "Platinum" : "Gold") : segment === "Active" ? (chance(r, 0.35) ? "Silver" : "None") : "None";
  const lastDay = segment === "Dormant" ? int(r, 1, 5) : int(r, 8, 18);
  const lastMonth = segment === "Dormant" ? int(r, 4, 6) : 8;
  return {
    id: `CUS-${String(i + 1).padStart(5, "0")}`,
    tenantId: "TEN-001",
    name,
    phone: `+62 8${int(r, 11, 59)}-${int(r, 1000, 9999)}-${int(r, 1000, 9999)}`,
    email: `${name.toLowerCase().replace(/\s/g, ".")}@mail.com`,
    segment,
    membership,
    visitCount: visits,
    lifetimeSpend: visits * avg,
    avgTicket: avg,
    firstVisit: `202${int(r, 4, 5)}-${String(int(r, 1, 12)).padStart(2, "0")}-${String(int(r, 1, 28)).padStart(2, "0")}`,
    lastVisit: `2026-${String(lastMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
    favoriteTherapist: pick(r, THERAPISTS).name,
    favoriteService: pick(r, SERVICES_POP),
    prepaidBalance: membership !== "None" && chance(r, 0.45) ? int(r, 1, 9) * 200_000 : 0,
    loyaltyPoints: Math.floor((visits * avg) / 10_000),
    marketingConsent: chance(r, 0.68),
    notes: chance(r, 0.3)
      ? pick(r, [
          "Tekanan sedang, hindari area bahu kanan.",
          "Alergi minyak kelapa — gunakan almond oil.",
          "Preferensi terapis wanita.",
          "Suka ruangan lebih hangat, musik pelan.",
          "Sedang program pemulihan cedera lutut.",
        ])
      : "",
    avatarTone: toneFor(name + i),
  };
});

export const customerById = (id: string) => CUSTOMERS.find((c) => c.id === id);

/** The customer persona used by the Customer PWA demo. */
export const ME_CUSTOMER = CUSTOMERS.find((c) => c.segment === "VIP" && c.prepaidBalance > 0) ?? CUSTOMERS[0];
