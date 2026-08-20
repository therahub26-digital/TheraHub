import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Admin client — uses the service_role key, which BYPASSES Row Level
// Security entirely. Only import this file from trusted server-side code
// that never runs in the browser: Route Handlers (e.g. Midtrans webhooks),
// Server Actions that need cross-tenant platform-admin access, or one-off
// scripts.
//
// NEVER import this from a Client Component, and never let
// SUPABASE_SERVICE_ROLE_KEY leak into anything sent to the browser (it has
// no NEXT_PUBLIC_ prefix specifically so Next.js keeps it server-only).
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
