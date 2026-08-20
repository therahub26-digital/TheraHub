"use client";

// ============================================================
// Session-level brand/background override.
//
// Brand colour + ambient background are normally fixed per tenant
// (ACTIVE_TENANT.logoTone / bgTone, threaded server-side into Shell /
// MobileShell as brandKey / bgKey props). This adds an *optional*
// client-side override on top of that, purely so the "Tema Siap Pakai"
// picker on Admin > Business Profile can genuinely re-paint the whole
// demo live — the same trick ThemeProvider already uses for dark/light,
// just for the colour + background layer instead of the light/dark layer.
//
// No pre-paint script here (unlike theme.tsx): this only ever changes an
// inline `style` object on an already-hydrated client component, so a
// brief flash to the tenant default before the saved override loads is
// an acceptable, non-breaking cosmetic trade-off — there is no SSR
// attribute to mismatch against, so no hydration warning risk.
// ============================================================

import { createContext, useContext, useEffect, useState, useCallback } from "react";

const BRAND_KEY = "therahub-brand-override";
const BG_KEY = "therahub-bg-override";

export interface BrandOverride {
  brandKey: string | null;
  bgKey: string | null;
}

const BrandOverrideContext = createContext<{
  override: BrandOverride;
  setOverride: (brandKey: string | null, bgKey: string | null) => void;
  clearOverride: () => void;
}>({
  override: { brandKey: null, bgKey: null },
  setOverride: () => {},
  clearOverride: () => {},
});

export function BrandOverrideProvider({ children }: { children: React.ReactNode }) {
  const [override, setOverrideState] = useState<BrandOverride>({ brandKey: null, bgKey: null });

  useEffect(() => {
    try {
      const brandKey = window.localStorage.getItem(BRAND_KEY);
      const bgKey = window.localStorage.getItem(BG_KEY);
      if (brandKey || bgKey) setOverrideState({ brandKey, bgKey });
    } catch {
      // localStorage unavailable — just stays on the tenant default
    }
  }, []);

  const setOverride = useCallback((brandKey: string | null, bgKey: string | null) => {
    setOverrideState({ brandKey, bgKey });
    try {
      if (brandKey) window.localStorage.setItem(BRAND_KEY, brandKey);
      else window.localStorage.removeItem(BRAND_KEY);
      if (bgKey) window.localStorage.setItem(BG_KEY, bgKey);
      else window.localStorage.removeItem(BG_KEY);
    } catch {
      // localStorage unavailable — override still works for this page view
    }
  }, []);

  const clearOverride = useCallback(() => setOverride(null, null), [setOverride]);

  return (
    <BrandOverrideContext.Provider value={{ override, setOverride, clearOverride }}>
      {children}
    </BrandOverrideContext.Provider>
  );
}

export function useBrandOverride() {
  return useContext(BrandOverrideContext);
}
