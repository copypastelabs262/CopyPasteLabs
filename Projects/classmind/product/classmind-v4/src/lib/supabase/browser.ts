"use client";
import { createBrowserClient } from "@supabase/ssr";

// Sign-in / sign-up only. This client is deliberately powerless against product
// data: the anon role has no grants on any product table.
export function browserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
