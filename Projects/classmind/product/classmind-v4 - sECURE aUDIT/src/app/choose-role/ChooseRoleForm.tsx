"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProfileRole } from "@/lib/profile-role";

// The explicit onboarding step for an account that reached authentication
// without a completed profile. It is the ONE place a new account's name and
// role are set: nothing is preselected and there is no skip, so the role is
// exactly what the user says here, once, and /api/profile refuses to change it
// afterwards.
//
// FACULTY IS GATED. Choosing Faculty reveals a code field; the code is checked
// on the server (never in this component) before the faculty role is written.
// A wrong code is a plain, useful error and no account change. Students need no
// code.
export default function ChooseRoleForm({
  next,
  initialName,
}: {
  next: string;
  initialName: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [role, setRole] = useState<ProfileRole | null>(null);
  const [facultyCode, setFacultyCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameOk = name.trim().length > 0;
  const canSubmit =
    !busy && nameOk && role !== null && (role !== "faculty" || facultyCode.trim().length > 0);

  async function submit() {
    if (!role || busy || !nameOk) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: name.trim(),
          role,
          // Only sent for faculty; the server validates it and never echoes it.
          ...(role === "faculty" ? { facultyCode: facultyCode.trim() } : {}),
        }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Could not save your details.");
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
        Tell us your name, and whether you are here to teach or to learn. This
        sets up your account, so pick carefully.
      </p>

      <div className="glass-2 mt-7 rounded-2xl p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className="eyebrow-mono block" htmlFor="cm-name">
            Your name
          </label>
          <input
            id="cm-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            autoComplete="name"
            className="mt-1.5 w-full rounded-xl border border-line bg-surface-sunken/70 px-4 py-3 text-[15px] text-ink transition-colors placeholder:text-ink-faint hover:border-ink-faint/60 focus:border-accent focus:outline-none"
          />

          <p className="eyebrow-mono mt-5">I am a</p>
          <div className="mt-1.5 space-y-3">
            {(
              [
                { value: "student", title: "Student", detail: "Join classes and ask about what was taught." },
                { value: "faculty", title: "Faculty", detail: "Create classes, upload lectures, review what students see. Requires your institution's faculty code." },
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

          {/* Revealed only for faculty. The field is a password input so the
              code is not shoulder-surfed; the value is validated server-side. */}
          {role === "faculty" ? (
            <div className="mt-4">
              <label className="eyebrow-mono block" htmlFor="cm-faculty-code">
                Faculty code
              </label>
              <input
                id="cm-faculty-code"
                type="password"
                value={facultyCode}
                onChange={(e) => setFacultyCode(e.target.value)}
                placeholder="Provided by your institution"
                autoComplete="off"
                className="mt-1.5 w-full rounded-xl border border-line bg-surface-sunken/70 px-4 py-3 text-[15px] text-ink transition-colors placeholder:text-ink-faint hover:border-ink-faint/60 focus:border-accent focus:outline-none"
              />
              <p className="mt-1.5 text-xs text-ink-faint">
                This keeps student accounts from becoming faculty. Ask your
                department if you don&rsquo;t have it.
              </p>
            </div>
          ) : null}

          {error ? (
            <p className="mt-4 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-5 w-full rounded-xl bg-accent-fill px-4 py-2.5 font-medium text-accent-ink shadow-[0_0_0_1px_rgba(94,141,255,0.25),0_10px_30px_-10px_rgba(94,141,255,0.16)] transition-colors hover:bg-accent-strong disabled:opacity-50"
          >
            {busy ? "Saving…" : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
