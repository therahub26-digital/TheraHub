// ============================================================
// TheraHub — role -> portal route mapping, shared by middleware.ts
// (server-side route guard) and app/login/page.tsx (post-login redirect).
//
// Added as the fix for Bug 5 (Fase 16/17 test cycle, 2026-08):
// previously there was ZERO role-based route enforcement anywhere in the
// app. middleware.ts only refreshed the Supabase session token; every
// role's layout.tsx rendered <Shell> unconditionally; therapist/ and
// customer/ had no layout at all. RLS was the only real defense — any
// signed-in staff member could type /owner/payroll or /super-admin into
// the address bar and the page would render (though most data fetches
// would then come back empty/error under RLS, since RLS is scoped to
// the signer's own role/outlet, not to which portal route they're on).
// ============================================================

export const ROLE_HOME: Record<string, string> = {
  "super-admin": "/super-admin",
  admin: "/admin",
  owner: "/owner",
  manager: "/manager",
  kasir: "/kasir",
  therapist: "/therapist",
  customer: "/customer",
};

const PROTECTED_BASES = Object.keys(ROLE_HOME);

// Returns the role required to access `pathname`, or null if this path is
// not one of the seven role-portal sections. The landing page, /login, and
// everything under /api/* are intentionally left unguarded here — API
// routes enforce their own access (service-role scripts, the Midtrans
// webhook, dev-only seed endpoints) and must not be blocked by this.
export function roleForPath(pathname: string): string | null {
  for (const base of PROTECTED_BASES) {
    if (pathname === `/${base}` || pathname.startsWith(`/${base}/`)) {
      return base;
    }
  }
  return null;
}
