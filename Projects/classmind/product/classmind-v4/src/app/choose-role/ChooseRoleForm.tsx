"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProfileRole } from "@/lib/profile-role";

// The explicit role-selection event for an account that reached authentication
// without one. Nothing is preselected and there is no skip: the account's role
// is exactly what the user says here, once, and /api/profile refuses to change
// it afterwards.
export default function ChooseRoleForm({ next }: { next: string }) {
  const router = useRouter();
  const [role, setRole] = useState<ProfileRole | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!role || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Could not save your role.");
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm py-6 sm:py-10">
      <p className="eyebrow-mono text-center">classmind</p>
      <h1 className="font-display mt-2 text-center text-[1.8rem] leading-tight font-medium tracking-[-0.01em] text-ink">
        One last thing
      </h1>
      <p className="mt-2 text-center text-sm text-ink-soft">
        Are you teaching classes here, or attending them? This decides what your
        account can do, so pick carefully.
      </p>

      <div className="glass-2 mt-7 rounded-2xl p-6">
        <div className="space-y-3">
          {(
            [
              { value: "student", title: "Student", detail: "Join classes and ask about what was taught." },
              { value: "faculty", title: "Faculty", detail: "Create classes, upload lectures, review what students see." },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setRole(option.value)}
              className={
                "w-full rounded-xl border px-4 py-3 text-left transition-colors " +
                (role === option.value
                  ? "border-accent/50 bg-accent-soft"
                  : "border-line hover:border-ink-faint/60")
              }
            >
              <span className={"block font-medium " + (role === option.value ? "text-accent" : "text-ink")}>
                {option.title}
              </span>
              <span className="mt-0.5 block text-sm text-ink-soft">{option.detail}</span>
            </button>
          ))}
        </div>

        {error ? (
          <p className="mt-4 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</p>
        ) : null}

        <button
          type="button"
          onClick={submit}
          disabled={!role || busy}
          className="mt-5 w-full rounded-xl bg-accent-fill px-4 py-2.5 font-medium text-accent-ink shadow-[0_0_0_1px_rgba(94,141,255,0.25),0_10px_30px_-10px_rgba(94,141,255,0.16)] transition-colors hover:bg-accent-strong disabled:opacity-50"
        >
          {busy ? "Saving…" : "Continue"}
        </button>
      </div>
    </div>
  );
}
