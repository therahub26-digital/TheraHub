"use client";

// Supabase client for use inside Client Components ("use client" files).
// Runs in the browser, respects the signed-in user's session + Row Level
// Security policies. Never put the service_role key here.
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
