"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { browserClient } from "@/lib/supabase/browser";

// SignInForm reads ?error= through useSearchParams, which pushes everything up
// to the nearest Suspense boundary into client-side rendering. Without one that
// boundary is the whole route and the production build fails outright.
export default function SignInPage() {
  return (
    <Suspense fallback={<p className="mx-auto max-w-sm py-10 text-sm text-ink-faint">Loading…</p>}>
      <SignInForm />
    </Suspense>
  );
}

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"faculty" | "student">("faculty");
  const [busy, setBusy] = useState(false);
  // /auth/callback reports every OAuth failure by bouncing back with ?error=.
  // Seeded into state rather than read on each render so that the next thing
  // the user does clears it, instead of pinning a stale message to the page.
  const [error, setError] = useState<string | null>(searchParams.get("error"));
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setNotice(null);
    const supabase = browserClient();
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: fullName, role } },
        });
        if (error) throw error;
        // A project with email confirmation on returns a user but no session.
        // Say so plainly rather than silently doing nothing.
        if (!data.session) {
          setNotice("Account created. Check your email to confirm it, then sign in.");
          setMode("signin"); setBusy(false); return;
        }
        await fetch("/api/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fullName, role }),
        });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      router.push("/courses");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    setBusy(true); setError(null); setNotice(null);
    // Built from the live origin so the same code works on localhost and on any
    // deployed domain -- a hardcoded URL would silently send production users to
    // a dev host. The callback creates the profile row for a Google user, who
    // never sees the faculty/student toggle, so forward the selected role.
    const redirectTo = new URL("/auth/callback", window.location.origin);
    redirectTo.searchParams.set("role", role);
    const { error } = await browserClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo.toString() },
    });
    // Only reachable when the handoff never happened. On success the browser has
    // already left this page, so there is no busy state left to reset.
    if (error) { setError(error.message); setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-sm py-6 sm:py-10">
      <p className="eyebrow-mono text-center">classmind</p>
      <h1 className="font-display mt-2 text-center text-[1.8rem] leading-tight font-medium tracking-[-0.01em] text-ink">
        {mode === "signin" ? "Sign in" : "Create an account"}
      </h1>

      <div className="glass-2 mt-7 rounded-2xl p-6">
        <button
          type="button" onClick={signInWithGoogle} disabled={busy}
          className="glass-3 w-full rounded-xl px-4 py-2.5 font-medium text-ink disabled:opacity-50"
        >
          Continue with Google
        </button>

        <div className="mt-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-line" />
          <span className="eyebrow-mono">or</span>
          <span className="h-px flex-1 bg-line" />
        </div>

        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === "signup" ? (
            <>
              <Field label="Full name" value={fullName} onChange={setFullName} required />
              <div>
                <label className="eyebrow-mono block">I am a</label>
                <div className="mt-1.5 flex gap-2">
                  {(["faculty", "student"] as const).map((r) => (
                    <button
                      key={r} type="button" onClick={() => setRole(r)}
                      className={
                        "flex-1 rounded-xl border px-3 py-2 text-sm capitalize transition-colors " +
                        (role === r
                          ? "border-accent/50 bg-accent-soft font-medium text-accent"
                          : "border-line text-ink-soft hover:text-ink")
                      }
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          <Field label="Email" type="email" value={email} onChange={setEmail} required />
          <Field label="Password" type="password" value={password} onChange={setPassword} required />

          {error ? <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</p> : null}
          {notice ? <p className="rounded-xl bg-ok-soft px-3.5 py-2.5 text-sm text-ok">{notice}</p> : null}

          <button
            type="submit" disabled={busy}
            className="w-full rounded-xl bg-accent-fill px-4 py-2.5 font-medium text-accent-ink shadow-[0_0_0_1px_rgba(94,141,255,0.25),0_10px_30px_-10px_rgba(94,141,255,0.16)] transition-colors hover:bg-accent-strong disabled:opacity-50"
          >
            {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>

      <p className="mt-6 text-center text-sm text-ink-soft">
        {mode === "signin" ? "No account? " : "Already have an account? "}
        <button
          onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); }}
          className="font-medium text-accent hover:underline"
        >
          {mode === "signin" ? "Create one" : "Sign in"}
        </button>
      </p>
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", required,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="eyebrow-mono block">
        {label}
      </label>
      <input
        type={type} value={value} required={required}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-xl border border-line bg-surface-sunken/70 px-3.5 py-2.5 text-[15px] text-ink transition-colors outline-none placeholder:text-ink-faint hover:border-ink-faint/60 focus:border-accent"
      />
    </div>
  );
}
