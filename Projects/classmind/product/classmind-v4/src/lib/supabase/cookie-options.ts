// The session cookie's attributes, in one place, for both clients.
//
// Added 2026-09-07 (security audit). Neither client passed `cookieOptions`, so
// both took @supabase/ssr's defaults verbatim -- verify them yourself in
// node_modules/@supabase/ssr/dist/main/utils/constants.js:
//
//     { path: "/", sameSite: "lax", httpOnly: false, maxAge: 400 days }
//
// Two of those four are worth changing, and one is not changeable here. Saying
// which is which matters more than the diff:
//
//   secure    NOT SET by default, so the browser would send the session cookie
//             over plain http. In production that is a session handed to
//             anything that can see the connection. Set here for production
//             only: localhost is http, and `secure` on localhost means the
//             browser silently discards the cookie and sign-in stops working
//             with no error anywhere.
//
//   maxAge    400 days is the browser's ceiling, not a decision. A stolen
//             cookie is a valid session for as long as it lives, and this one
//             lived longer than an academic year. 30 days costs an ACTIVE user
//             nothing -- @supabase/ssr refreshes the session on every request
//             through the middleware, so the window only ever closes on someone
//             who has not opened the product for a month.
//
//   sameSite  STAYS "lax", deliberately. Strict would be better against
//             cross-site requests, and it would also break Google OAuth: the
//             provider returns the browser to /auth/callback as a cross-site
//             top-level navigation, and a Strict cookie is not sent on one, so
//             the callback would never see the session it just created. The
//             cross-site risk Lax leaves open is handled in src/middleware.ts,
//             which refuses navigations and cross-site requests to /api/*.
//
//   httpOnly  STAYS false, and this one is not a choice. The browser client
//             reads the session directly -- SignOutButton calls
//             browserClient().auth.signOut(), which needs to see the cookie --
//             so httpOnly:true would break sign-out. The consequence is real
//             and is recorded rather than hidden: any script execution on this
//             origin can read the session token, which is why the CSP added in
//             the same pass is a session-integrity control here and not merely
//             defence in depth.

export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function sessionCookieOptions() {
  return {
    // `secure` is meaningless-to-harmful on http://localhost and essential
    // everywhere else, so it follows the build rather than being hardcoded.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}
