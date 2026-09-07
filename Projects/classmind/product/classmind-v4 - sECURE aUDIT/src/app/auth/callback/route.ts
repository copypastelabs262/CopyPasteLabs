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

// A bare hostname, optionally with a port. Nothing else may become an origin.
//
// Tightened 2026-09-07 (security audit). The header was interpolated straight
// into a template, so a value like "evil.com/x" or "a@evil.com" produced an
// origin that is not what "host" means, and `new URL(path, origin)` then
// resolved somewhere nobody intended. The practical risk was low -- a browser
// will not let another site set X-Forwarded-Host on a navigation, so a forged
// value only ever misdirects the request that carried it, which is the point
// the comment below makes and it is correct -- but "low" is not "shaped like a
// host", and this is one regex.
const HOSTNAME = /^[a-z0-9.-]{1,253}(:\d{1,5})?$/i;

// Behind a proxy (Vercel, any load balancer) `request.url` carries the internal
// host, so a redirect built from it would send the user somewhere unreachable.
// The forwarded host is the one the browser actually asked for. A forged header
// only misdirects the request that carried it, and never off-origin, because
// the only thing ever appended to this origin is a same-site path.
function requestOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (!forwardedHost || !HOSTNAME.test(forwardedHost)) return new URL(request.url).origin;
  const proto = request.headers.get("x-forwarded-proto") === "http" ? "http" : "https";
  return `${proto}://${forwardedHost}`;
}

// The sign-in page renders whatever lands in ?error=, and this function is what
// puts it there -- from `error_description`, a query parameter on an
// unauthenticated endpoint that anyone can set to anything.
//
// React escapes it, so this is not XSS: SignInForm interpolates it as a text
// child (`{error}`), never as markup or an attribute, and I verified there is no
// dangerouslySetInnerHTML anywhere in the tree. What it IS is an unbounded
// attacker-controlled string on the product's own sign-in page, reachable by a
// link -- which is a phishing surface ("Your session expired. Email
// support@..."), and, unbounded, a way to make that page render megabytes.
//
// Bounded and single-lined (2026-09-07, security audit). Provider errors are
// short sentences; nothing legitimate is lost.
const MAX_ERROR_CHARS = 300;

function bounceToSignIn(origin: string, message: string): NextResponse {
  const signIn = new URL("/signin", origin);
  const safe = message.replace(/[\r\n]+/g, " ").trim().slice(0, MAX_ERROR_CHARS);
  signIn.searchParams.set("error", safe || "Sign-in did not complete. Please try again.");
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
