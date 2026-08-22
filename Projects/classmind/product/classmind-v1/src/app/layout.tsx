import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import SignOutButton from "./_components/SignOutButton";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClassMind",
  description: "Verified academic information, extracted from your lectures.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
        <header className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <Link href="/" className="font-semibold tracking-tight">
              ClassMind
            </Link>
            {user ? (
              <div className="flex items-center gap-4 text-sm">
                <Link href="/courses" className="text-zinc-600 hover:underline dark:text-zinc-400">
                  Courses
                </Link>
                <span className="hidden text-zinc-500 sm:inline">{user.email}</span>
                <SignOutButton />
              </div>
            ) : (
              <Link href="/signin" className="text-sm hover:underline">Sign in</Link>
            )}
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
        {/* Both links must be reachable from every page without signing in:
            Google's OAuth consent review checks that the policy and terms URLs
            it was given actually resolve for an anonymous visitor. */}
        <footer className="border-t border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-6 py-6 text-xs text-zinc-500">
            <span>ClassMind &middot; CopyPasteLabs</span>
            <Link href="/privacy" className="hover:underline">Privacy Policy</Link>
            <Link href="/terms" className="hover:underline">Terms of Service</Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
