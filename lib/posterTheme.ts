// ---------------------------------------------------------------------
// Konstanta & helper warna poster "Our Squad Today" — modul biasa (bukan
// "use client") supaya bisa dipakai server component (ScheduleCheckPage),
// komponen client (RosterPosterButton, PosterSettingsCard), dan seed demo.
// ---------------------------------------------------------------------

export const POSTER_DEFAULT_TITLE = "OUR SQUAD TODAY";
export const POSTER_DEFAULT_ACCENT = "#D4B26A";

function rgb(hex: string): [number, number, number] {
  const m = hex.replace("#", "");
  const n = parseInt(m.length === 3 ? m.split("").map((c) => c + c).join("") : m, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Campur dua warna hex; t=0 → a, t=1 → b. */
export function mixHex(a: string, b: string, t: number): string {
  const A = rgb(a), B = rgb(b);
  return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

/** Warna pita default: aksen brand aplikasi digelapkan. */
export function defaultPosterBg(brandAccent: string): string {
  return mixHex(brandAccent, "#000000", 0.72);
}
