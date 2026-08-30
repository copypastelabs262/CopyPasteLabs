import type { Metadata } from "next";
import Link from "next/link";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import { currentUser } from "@/lib/auth";
import { UserMenu } from "./_components/SignOutButton";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClassMind",
  description: "Verified academic information, extracted from your lectures.",
};

// The three voices of the interface (see globals.css). Loaded here, once, as
// CSS variables so the token layer owns the actual font-family declarations.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz"],
});
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

// The shell every screen is seen through.
//
// It is deliberately the quietest thing on the page — the screen inside it is
// supposed to say what you are here to do. But quiet is not absent: the shell
// owns the atmosphere (the fixed ground plane every surface sits on) and the
// one always-on blur in the product (the sticky header, L1). Nothing else in
// the chrome competes with the content plane.
//
// Server component on purpose. It reads the session, and pushing that read
// into the client would mean every page paints signed-out and then corrects
// itself.

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();

  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} ${jetbrains.variable}`}>
      <body className="flex min-h-screen flex-col bg-surface text-ink antialiased">
        {/* L0 — the ground plane. Fixed, behind everything, unclickable. */}
        <div className="cm-atmosphere" aria-hidden="true" />

        {/* First in the DOM so it is the first thing Tab reaches. */}
        <a
          href="#content"
          className="glass-overlay absolute top-3 left-4 z-50 -translate-y-20 rounded-lg px-4 py-2 text-sm font-medium text-ink transition-transform focus:translate-y-0"
        >
          Skip to content
        </a>

        {/* L1 — structural chrome. The one always-on backdrop blur. */}
        <header
          className="sticky top-0 z-40 border-b border-line"
          style={{
            background: "rgba(13, 18, 30, 0.72)",
            backdropFilter: "blur(14px) saturate(150%)",
            boxShadow: "inset 0 -1px 0 rgba(255,255,255,0.03)",
          }}
        >
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-6 sm:px-8">
            {/* Signed in, the wordmark is the way back to your courses; signed
                out it is the way back to the landing page. */}
            <Link
              href={user ? "/courses" : "/"}
              className="flex items-baseline gap-2 rounded-lg text-[15px] font-semibold tracking-tight text-ink"
            >
              ClassMind
              <span className="eyebrow-mono hidden sm:inline" aria-hidden="true">
                every answer traced
              </span>
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

        {/* `tabIndex={-1}` so the skip link actually moves focus here. */}
        <main
          id="content"
          tabIndex={-1}
          className="mx-auto w-full max-w-6xl flex-1 px-6 py-12 focus:outline-none sm:px-8 sm:py-16 lg:py-20"
        >
          {children}
        </main>

        {/* Both links must resolve for an anonymous visitor: Google's OAuth
            consent review checks them. */}
        <footer className="border-t border-line">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-8 text-xs text-ink-faint sm:px-8">
            <span className="eyebrow-mono">ClassMind &middot; CopyPasteLabs</span>
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
