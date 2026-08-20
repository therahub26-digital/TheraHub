import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// Supabase client for use in Server Components, Server Actions, and Route
// Handlers. Reads the user's session from cookies, so queries still run
// under RLS as the signed-in user (not as an admin).
//
// NOTE: this must be created fresh per-request (it closes over `cookies()`),
// so call `await createClient()` at the top of each server function rather
// than caching the instance at module scope.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll was called from a Server Component (no response to
            // write cookies to). Safe to ignore as long as middleware.ts
            // refreshes the session on every request.
          }
        },
      },
    }
  );
}
