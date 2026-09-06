import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { sessionCookieOptions } from "@/lib/supabase/cookie-options";

// ---------------------------------------------------------------------------
// THE CROSS-SITE GATE (added 2026-09-07, security audit)
// ---------------------------------------------------------------------------
//
// Supabase's session cookies are SameSite=Lax -- verify it yourself in
// node_modules/@supabase/ssr/dist/main/utils/constants.js. Lax means the
// browser DOES attach them to cross-site TOP-LEVEL NAVIGATIONS: a link click, a
// window.open, a meta refresh, a 302 from any page on the internet.
//
// /api/ask already knew this. Its own comment says a GET that answers questions
// "is a GET that spends money and writes rows on a top-level navigation", and
// it returns 405 for exactly that reason. The reasoning was never carried
// across to /api/courses/[id]/ask, which still answers GET and still bills the
// reasoning provider -- so a crafted link, clicked by a signed-in student, spent
// the operator's money. That is the whole class this block closes, once, rather
// than route by route:
//
//   NAVIGATION  Nothing in this app ever navigates to /api/*. Every client call
//               is fetch() (17 of them; grep confirms zero href/src/action
//               pointing at /api). So `Sec-Fetch-Mode: navigate` on an API path
//               is by definition not this application asking -- it is a browser
//               being steered somewhere by someone else's page.
//   CROSS-SITE  `Sec-Fetch-Site: cross-site` -- and `same-site`, which is a
//               sibling subdomain -- on an API path is another origin's page
//               issuing the request with our cookies attached. Only
//               `same-origin` is this application asking.
//
// Requests carrying NO Sec-Fetch headers are ALLOWED. That is deliberate, not
// an oversight: node's fetch sends none, and every verify:/test: script plus the
// Bearer-token path in @/lib/auth depends on reaching these routes. Those
// requests are not browsers and carry no ambient cookie authority. The Origin
// check below covers the browser cases Sec-Fetch would miss.
//
// This is defence in depth, not the primary control. Authorization still lives
// in each route, and POST-only remains the right shape for anything that spends.

const API_PREFIX = "/api/";

// ---------------------------------------------------------------------------
// SECURITY HEADERS (added 2026-09-07, security audit)
// ---------------------------------------------------------------------------
//
// The application shipped with none. next.config.ts sets outputFileTracing and
// devIndicators and nothing else, so every response went out with no CSP, no
// frame protection, no referrer policy and no permissions policy.
//
// Why each one is here, for this product specifically -- a header added because
// a scanner asked for it is a header nobody can safely change later:
//
//   frame-ancestors 'none'  /choose-role writes the role and the lecture page
//     + X-Frame-Options     carries a delete action. Both are one click, both
//                           are privileged-or-destructive, and neither is worth
//                           defending against clickjacking with a UI change when
//                           a header does it completely. Nothing here is framed.
//
//   Permissions-Policy      microphone=() is the notable one: this product
//                           records lectures, so any injected frame or script
//                           that could reach getUserMedia would reach a
//                           microphone. Nothing in the current tree calls it --
//                           upload is a file picker -- so denying it costs
//                           nothing today and makes adding recording a
//                           deliberate act rather than an available one.
//
//   Referrer-Policy         GET /api/lectures/{id} returns a SIGNED STORAGE URL
//                           with an hour of life, and lecture/course/conversation
//                           ids sit in the path of most pages. same-origin stops
//                           all of that riding along in Referer to any external
//                           link a student clicks.
//
//   CSP                     The second line of defence for the one thing this
//                           product does that no amount of authorization makes
//                           safe: it renders MODEL-GENERATED prose, composed
//                           from transcripts a course owner controls.
//                           MarkdownAnswer.tsx builds every node as React and
//                           uses no dangerouslySetInnerHTML -- verified -- so
//                           there is no known injection today. CSP is what stops
//                           a future one becoming account takeover, and the
//                           stakes are unusually high here because @supabase/ssr
//                           sets httpOnly:false on the session cookie: any
//                           script execution reads the session directly.
//
// THE CSP IS NONCE-BASED, NOT 'unsafe-inline'. Next injects inline bootstrap
// scripts, so a policy without a nonce would have to allow all inline script --
// which is the same as having no script policy at all. The nonce is generated
// per request here and handed to Next through the REQUEST headers, which is the
// documented mechanism: Next reads it back out and stamps it on what it emits.
//
// style-src keeps 'unsafe-inline'. Tailwind v4 and Next both emit inline style
// blocks and there is no nonce path for them that does not break the render.
// Style injection is a defacement risk, not a session-theft one; the trade is
// stated rather than quietly taken.

// Supabase is the one external origin this app talks to: the browser client for
// auth, and the storage host for signed audio URLs. Read from the same variable
// the client is built from, so the policy cannot drift from the configuration.
function supabaseOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return "";
  try {
    return new URL(raw).origin;
  } catch {
    return "";
  }
}

function contentSecurityPolicy(nonce: string, dev: boolean): string {
  const supabase = supabaseOrigin();
  // Dev needs eval: the Next dev runtime and React Refresh both use it. It is
  // NEVER emitted in a production build -- that difference is the whole reason
  // this is computed rather than written out once.
  const scriptSrc = dev
    ? "'self' 'unsafe-inline' 'unsafe-eval'"
    : `'nonce-${nonce}' 'strict-dynamic' 'self'`;
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    // Signed lecture audio is served from the Supabase storage host.
    `media-src 'self' blob: ${supabase}`.trim(),
    "font-src 'self' data:",
    // The browser Supabase client (auth) and this app's own fetches. Dev also
    // needs the HMR websocket.
    `connect-src 'self' ${supabase}${dev ? " ws: wss:" : ""}`.trim(),
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

function applySecurityHeaders(
  response: NextResponse,
  csp: string,
  secure: boolean,
): NextResponse {
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  // HSTS only where the connection is already TLS. Sending it over plain http
  // on a developer machine would pin localhost to https and break the dev
  // server in a way that outlives the change that caused it.
  if (secure) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }
  return response;
}

// The host the BROWSER asked for. Behind a proxy request.url carries the
// internal host, so comparing Origin against it would reject every legitimate
// same-origin request in production. Same reasoning as auth/callback's
// requestOrigin(), and a forged header only ever loosens the check for the
// request that carried it -- it cannot make one origin look like another to a
// different user.
// HOST FIRST, forwarded host second (2026-09-07, security audit -- second pass).
//
// The Origin check compares the claimed origin against what this request thinks
// its own host is. Reading that from `x-forwarded-host` first meant the same
// request that forged the Origin could forge the thing it was compared against,
// which makes the comparison decorative.
//
// `Host` is set by the browser and cannot be chosen by a cross-site page, so it
// is the trustworthy side of the comparison wherever it is present -- which is
// every real request. `x-forwarded-host` stays as a fallback for a proxy that
// rewrites Host, and `request.url` last.
//
// This is the FALLBACK control in any case: the Sec-Fetch checks above are the
// primary one, and they cannot be forged by a page at all.
function expectedHost(request: NextRequest): string {
  return (
    request.headers.get("host") ??
    request.headers.get("x-forwarded-host") ??
    new URL(request.url).host
  );
}

function crossSiteRefusal(request: NextRequest): NextResponse | null {
  if (!request.nextUrl.pathname.startsWith(API_PREFIX)) return null;

  const mode = request.headers.get("sec-fetch-mode");
  const dest = request.headers.get("sec-fetch-dest");
  const site = request.headers.get("sec-fetch-site");

  // A top-level or framed navigation to an API route. Never this application.
  if (mode === "navigate" || dest === "document" || dest === "iframe" || dest === "frame") {
    return NextResponse.json(
      { error: "This endpoint is not a page. Call it with fetch from the application." },
      { status: 403 },
    );
  }
  // "same-site" IS REFUSED TOO, not just "cross-site".
  //
  // same-site means a different origin that shares a registrable domain -- a
  // sibling subdomain. SameSite=Lax cookies are sent to those, so if this
  // product is ever served from a custom domain that has any other subdomain,
  // a compromise or takeover of that sibling reaches these APIs with the
  // victim's session attached. (On *.vercel.app it cannot happen: vercel.app is
  // on the Public Suffix List, so two apps there are cross-site to each other.
  // The custom-domain case is the one worth defending, and it is the one a
  // deployment is most likely to end up in.)
  //
  // This costs nothing: every request this application makes to its own API is
  // fetch() from its own origin, which is `same-origin`, never `same-site`.
  if (site === "cross-site" || site === "same-site") {
    return NextResponse.json(
      { error: "Cross-site requests are not accepted." },
      { status: 403 },
    );
  }

  // A REQUEST THAT WANTS HTML IS A NAVIGATION, whatever it says about itself.
  //
  // Everything above depends on Sec-Fetch-*, and a browser old enough not to
  // send those headers also sends no Origin on a top-level GET navigation -- so
  // the one shape this gate exists to stop (a crafted link, clicked by a
  // signed-in student, billing the reasoning provider through
  // GET /api/courses/{id}/ask) had no check left covering it on exactly the
  // browsers least able to defend themselves.
  //
  // `Accept` closes it with no dependency on any modern header at all. A
  // top-level navigation asks for `text/html`; fetch() asks for */* unless
  // told otherwise, and every script in scripts/ uses fetch defaults. Nothing
  // that legitimately calls this API wants an HTML document back, so preferring
  // HTML is a reliable statement of intent -- and it is the browser making it,
  // not a page.
  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("text/html")) {
    return NextResponse.json(
      { error: "This endpoint is not a page. Call it with fetch from the application." },
      { status: 403 },
    );
  }

  // Origin, for browsers that send it but not Sec-Fetch-*. Absent is allowed
  // (server-to-server, and same-origin GETs do not send it); present and
  // foreign is refused.
  const origin = request.headers.get("origin");
  if (origin && origin !== "null") {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return NextResponse.json({ error: "Malformed Origin." }, { status: 403 });
    }
    if (originHost !== expectedHost(request)) {
      return NextResponse.json(
        { error: "Cross-site requests are not accepted." },
        { status: 403 },
      );
    }
  }

  return null;
}

// Refreshes the Supabase session cookie on each request. Without this a signed-in
// user is silently signed out when the access token expires mid-session.
export async function middleware(request: NextRequest) {
  const dev = process.env.NODE_ENV !== "production";
  const secure =
    (request.headers.get("x-forwarded-proto") ??
      request.nextUrl.protocol.replace(":", "")) === "https";
  // crypto.randomUUID is available in the middleware runtime and is a
  // cryptographically strong source. The nonce only has to be unguessable and
  // unique per response.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce, dev);

  const refused = crossSiteRefusal(request);
  // Refused BEFORE the session is touched: a request we will not serve should
  // not cost a round trip to Supabase, and refreshing a session for an
  // attacker-steered navigation is work done on the attacker's behalf.
  if (refused) return applySecurityHeaders(refused, csp, secure);

  // The nonce reaches Next through the REQUEST headers -- that is how the
  // framework learns which value to stamp on the scripts it emits. Setting it
  // only on the response would produce a policy that blocks Next's own
  // bootstrap.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  applySecurityHeaders(response, csp, secure);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Same attributes as every other client. The middleware is what REFRESHES
      // the session on each request, so if it wrote different options it would
      // quietly widen back whatever the others narrowed.
      cookieOptions: sessionCookieOptions(),
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: [
    // /api IS ALWAYS MATCHED, as its own entry (2026-09-07, security audit --
    // second pass). The single pattern below excludes any path ending in an
    // image or audio extension, and that exclusion is not path-aware: a request
    // to /api/lectures/<anything>.mp3 skipped the middleware entirely, taking
    // the cross-site gate AND every security header with it. Whether a route
    // behind it would have refused the malformed id is not the point -- a
    // perimeter with a hole shaped like a file extension is not a perimeter.
    "/api/:path*",
    // Everything else. `\\.` and not `\.`: this is a string, not a regex
    // literal, so `\.` collapses to a bare `.` and the extension test silently
    // becomes "any character".
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp3)$).*)",
  ],
};
