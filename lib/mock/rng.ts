// Deterministic PRNG so server & client render identical mock data.

export function makeRng(seed: number) {
  let s = seed >>> 0 || 1;
  return function rng(): number {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

export type Rng = () => number;

export const pick = <T,>(r: Rng, arr: readonly T[]): T => arr[Math.floor(r() * arr.length)];

export const int = (r: Rng, min: number, max: number): number =>
  min + Math.floor(r() * (max - min + 1));

export const chance = (r: Rng, p: number): boolean => r() < p;

export function shuffle<T>(r: Rng, arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function sample<T>(r: Rng, arr: readonly T[], n: number): T[] {
  return shuffle(r, [...arr]).slice(0, n);
}

/** Fixed "now" for the demo so every screen is coherent. */
export const TODAY = "2026-08-18";
export const NOW_HHMM = "15:20";
export const CURRENT_PERIOD = "2026-08";
