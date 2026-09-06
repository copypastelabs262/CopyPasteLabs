import { NextResponse, type NextRequest } from "next/server";
import { authClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { ensureProfile } from "@/lib/profile";
import { parseRole, PENDING_ROLE_COOKIE } from "@/lib/profile-role";
import { safeNext } from "@/lib/safe-next";

// Where Supabase sends the browser back after Google consent. Everything this
// route does has to happen on a redirect response, because the user is mid-
// navigation: there is no UI here to show an error in, so every failure path
// ends at /signin?error=... rather than at a blank page or a 500.

// Behind a proxy (Vercel, any load balancer) `request.url` carries the internal
// host, so a redirect built from it would send the user somewhere unreachable.
// The forwarded host is the one the browser actually asked for. A forged header
// only misdirects the request that carried it, and never off-origin, because
// the only thing ever appended to this origin is a same-site path.
function requestOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (!forwardedHost) return new URL(request.url).origin;
  return `${request.headers.get("x-forwarded-proto") ?? "https"}://${forwardedHost}`;
}

function bounceToSignIn(origin: string, message: string): NextResponse {
  const signIn = new URL("/signin", origin);
  signIn.searchParams.set("error", message);
  return NextResponse.redirect(signIn);
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const origin = requestOrigin(request);

  // The provider reports refusal by redirecting back with an error and no code
  // -- cancelled consent, a blocked app, a misconfigured client. Prefer the
  // human-readable description; `error` alone is a slug like "access_denied".
  const providerError =
    url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (providerError) return bounceToSignIn(origin, providerError);

  const code = url.searchParams.get("code");
  if (!code) {
    return bounceToSignIn(origin, "Sign-in did not complete. Please try again.");
  }

  // Must be the cookie-bound client: exchangeCodeForSession is what writes the
  // session cookies, and it can only do that through the store this client
  // holds. A fresh client here would succeed and leave the user signed out.
  const supabase = await authClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return bounceToSignIn(
      origin,
      error?.message ?? "Could not complete sign-in. Please try again.",
    );
  }

  // The role selected on the sign-in page travels as a short-lived cookie set
  // just before the OAuth handoff -- NOT a query param. Supabase glob-matches
  // the whole redirect URL against its allow-list, and a non-matching query
  // string silently rerouted the sign-in to the Site URL, dropping the param
  // (recorded 2026-08-31): that drop is what created students as faculty. A
  // cookie on this origin survives the provider round trip regardless.
  const pendingRole = parseRole(request.cookies.get(PENDING_ROLE_COOKIE)?.value);

  // One provisioning path for every account shape. Insert-only: an existing
  // profile's role is untouched no matter what the cookie or metadata say, so
  // signing in again can never rewrite who someone is.
  const ensured = await ensureProfile(serviceClient(), data.user, pendingRole);

  // No explicit role selection has ever happened for this account: do NOT
  // guess. The account is sent to choose -- "faculty" as a silent fallback is
  // exactly the bug this route used to have.
  const next = safeNext(url.searchParams.get("next"));
  const dest = ensured.role ? next : `/choose-role?next=${encodeURIComponent(next)}`;

  const response = NextResponse.redirect(new URL(dest, origin));
  // Single-use either way: consumed, invalid, or superseded by an existing row.
  response.cookies.delete(PENDING_ROLE_COOKIE);
  return response;
}
