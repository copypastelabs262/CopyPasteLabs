"use client";
import { createBrowserClient } from "@supabase/ssr";
import { sessionCookieOptions } from "./cookie-options";

// Sign-in / sign-up only. This client is deliberately powerless against product
// data: the anon role has no grants on any product table.
export function browserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    // The same attributes the server writes. Two halves of one session that
    // disagree about Secure or Max-Age produce a cookie whose lifetime depends
    // on which side last touched it.
    { cookieOptions: sessionCookieOptions() },
  );
}
