import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { UserMenu } from "./_components/SignOutButton";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClassMind",
  description: "Verified academic information, extracted from your lectures.",
};

// The shell every screen is seen through.
//
// It is deliberately the quietest thing on the page. A header that competes for
// attention is a header that answers the wrong question -- the screen inside it
// is supposed to say what you are here to do, and chrome that shouts makes that
// harder on every single route. So: one wordmark, one destination, one menu.
//
// Server component on purpose. It reads the session, and pushing that read into
// the client would mean every page paints signed-out and then corrects itself.

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();

  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-surface text-ink antialiased">
        {/* First in the DOM so it is the first thing Tab reaches. Parked
            off-screen with a transform rather than `sr-only`, because the
            hidden and visible states then differ by one property and cannot
            fight each other over `position`. */}
        <a
          href="#content"
          className="absolute top-3 left-4 z-50 -translate-y-20 rounded-lg border border-line bg-surface-raised px-4 py-2 text-sm font-medium text-ink shadow-lift transition-transform focus:translate-y-0"
        >
          Skip to content
        </a>

        <header className="sticky top-0 z-40 border-b border-line bg-surface/80 backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-6 sm:px-8">
            {/* Signed in, the wordmark is the way back to your courses; signed
                out it is the way back to the landing page. Same affordance,
                and neither audience is sent somewhere it cannot go. */}
            <Link
              href={user ? "/courses" : "/"}
              className="rounded-lg text-[15px] font-semibold tracking-tight text-ink"
            >
              ClassMind
            </Link>

            {user ? (
              <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
                <Link
                  href="/courses"
                  className="rounded-lg px-2.5 py-1.5 text-sm text-ink-soft transition-colors hover:text-ink"
                >
                  Courses
                </Link>
                <UserMenu email={user.email} fullName={user.fullName} role={user.role} />
              </nav>
            ) : (
              <Link
                href="/signin"
                className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-ink transition-colors hover:text-accent"
              >
                Sign in
              </Link>
            )}
          </div>
        </header>

        {/* `tabIndex={-1}` so activating the skip link actually moves focus
            here rather than only scrolling; the ring is suppressed because a
            two-pixel outline around the entire page reads as breakage, not as
            feedback. Every real control keeps its ring. */}
        <main
          id="content"
          tabIndex={-1}
          className="mx-auto w-full max-w-5xl flex-1 px-6 py-12 focus:outline-none sm:px-8 sm:py-16 lg:py-20"
        >
          {children}
        </main>

        {/* Both links must be reachable from every page without signing in:
            Google's OAuth consent review checks that the policy and terms URLs
            it was given actually resolve for an anonymous visitor. */}
        <footer className="border-t border-line">
          <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-8 text-xs text-ink-faint sm:px-8">
            <span>ClassMind &middot; CopyPasteLabs</span>
            <Link href="/privacy" className="rounded transition-colors hover:text-ink-soft">
              Privacy Policy
            </Link>
            <Link href="/terms" className="rounded transition-colors hover:text-ink-soft">
              Terms of Service
            </Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
