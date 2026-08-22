import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";

// Bypasses RLS. Every product table has RLS on with zero policies, so this is
// the ONLY client that can read or write them -- which is what makes "students
// cannot reach extraction_candidates" structural rather than a convention.
// Never import this outside a server route or server component.
export function serviceClient(): SupabaseClient {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
