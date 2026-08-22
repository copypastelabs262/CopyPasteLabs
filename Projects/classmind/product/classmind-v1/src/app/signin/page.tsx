"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase/browser";

export default function SignInPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"faculty" | "student">("faculty");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  return (
    <div className="mx-auto max-w-sm py-10">
      <h1 className="text-xl font-semibold">
        {mode === "signin" ? "Sign in" : "Create an account"}
      </h1>

      <form onSubmit={submit} className="mt-6 space-y-4">
        {mode === "signup" ? (
          <>
            <Field label="Full name" value={fullName} onChange={setFullName} required />
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                I am a
              </label>
              <div className="mt-1 flex gap-2">
                {(["faculty", "student"] as const).map((r) => (
                  <button
                    key={r} type="button" onClick={() => setRole(r)}
                    className={
                      "flex-1 rounded-md border px-3 py-2 text-sm capitalize " +
                      (role === r
                        ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                        : "border-zinc-300 dark:border-zinc-700")
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

        {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        {notice ? <p className="text-sm text-green-700 dark:text-green-400">{notice}</p> : null}

        <button
          type="submit" disabled={busy}
          className="w-full rounded-md bg-zinc-900 px-4 py-2.5 font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      <button
        onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); }}
        className="mt-6 text-sm text-zinc-600 hover:underline dark:text-zinc-400"
      >
        {mode === "signin" ? "No account? Create one" : "Already have an account? Sign in"}
      </button>
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
      <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </label>
      <input
        type={type} value={value} required={required}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100"
      />
    </div>
  );
}
