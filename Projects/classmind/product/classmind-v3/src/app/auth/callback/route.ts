import { NextResponse, type NextRequest } from "next/server";
import { authClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";

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

// `next` arrives from the query string, so it is attacker-controlled. A bare
// startsWith("/") test is not enough: "//evil.com" and "/\evil.com" both begin
// with a slash and both leave the site, which is a textbook open redirect on
// exactly this kind of endpoint. Accept a single leading slash and nothing else.
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/")) return "/courses";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/courses";
  return raw;
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

  // A Google user never saw the faculty/student toggle at sign-up, so the
  // profile row has to be created here. Insert only when absent: this route
  // runs on EVERY Google sign-in, and a blind upsert would overwrite a name or
  // role the user has since changed with whatever Google last told us.
  const svc = serviceClient();
  const { data: existing } = await svc
    .from("profiles")
    .select("id")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!existing) {
    const metadata = data.user.user_metadata as
      | { full_name?: string; name?: string }
      | null;
    const roleParam = url.searchParams.get("role");
    // The sign-in page forwards whichever role the user had selected. Anything
    // else in this param is ignored rather than trusted -- it is query string,
    // and "faculty" is what currentUser() already defaults to.
    const role =
      roleParam === "faculty" || roleParam === "student" ? roleParam : "faculty";

    // Not fatal if it fails: the session is already established, and
    // currentUser() treats a missing profile as a faculty account rather than
    // an error. Bouncing an authenticated user back to /signin would be worse.
    await svc.from("profiles").upsert(
      {
        id: data.user.id,
        full_name: metadata?.full_name?.trim() || metadata?.name?.trim() || null,
        role,
      },
      { onConflict: "id" },
    );
  }

  return NextResponse.redirect(new URL(safeNext(url.searchParams.get("next")), origin));
}
