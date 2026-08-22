import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Called from middleware.ts on every request. Refreshes the Supabase auth
// session (rotates the access token via the refresh token in cookies)
// before the request reaches a Server Component — Server Components can't
// write cookies themselves, so without this, sessions would silently expire.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: do not run any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to
  // debug users being randomly logged out.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Also hand back the request-scoped client itself: middleware.ts's
  // route guard (lib/route-guard.ts) needs to read this signed-in
  // user's own app_users/customers row under their own RLS context —
  // same pattern already used client-side in app/login/page.tsx.
  return { supabaseResponse, user, supabase };
}
