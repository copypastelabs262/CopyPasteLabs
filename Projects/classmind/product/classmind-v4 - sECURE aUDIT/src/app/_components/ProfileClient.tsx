"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Page, PageHeader, cx } from "./ui";
import { CheckIcon } from "./ui/icons";
import { useSignOut } from "./SignOutButton";

// The profile as an account surface, not a database row. It shows who you are
// and lets you fix the one thing that is yours to change — your name. Email is
// the identity you signed in with; role is a gated decision (a student cannot
// make themselves faculty here, and /api/profile enforces that regardless of
// this screen), so both are shown as facts, not fields.

export default function ProfileClient({
  fullName,
  email,
  role,
}: {
  fullName: string | null;
  email: string | null;
  role: "faculty" | "student";
}) {
  const router = useRouter();
  const signOut = useSignOut();
  const [name, setName] = useState(fullName ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roleLabel = role === "faculty" ? "Faculty" : "Student";
  const initial = (fullName?.trim() || email || "?").charAt(0).toUpperCase();
  const dirty = name.trim() !== (fullName ?? "").trim();
  const canSave = dirty && name.trim().length > 0 && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: name.trim() }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not save your name.");
      setSaved(true);
      // Refresh so the header/drawer pick up the new name from the server.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page>
      <PageHeader eyebrow="Account" title="Profile" />

      <Card className="max-w-xl">
        <div className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xl font-semibold text-accent"
          >
            {initial}
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-medium text-ink">{fullName?.trim() || "Your name"}</p>
            <p className="mt-0.5 text-sm text-ink-faint">{roleLabel}</p>
          </div>
        </div>

        <div className="mt-8 space-y-6">
          {/* Name — the one editable field. */}
          <div>
            <label htmlFor="profile-name" className="eyebrow-mono block">
              Name
            </label>
            <div className="mt-1.5 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                id="profile-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setSaved(false);
                  setError(null);
                }}
                placeholder="Full name"
                autoComplete="name"
                className={cx(
                  "min-w-0 flex-1 rounded-xl border border-line bg-surface-sunken/70 px-4 py-3",
                  "text-[15px] text-ink transition-colors",
                  "placeholder:text-ink-faint hover:border-ink-faint/60 focus:border-accent focus:outline-none",
                )}
              />
              <Button
                type="button"
                tone={canSave ? "primary" : "secondary"}
                onClick={save}
                disabled={!canSave}
                className="sm:w-auto"
              >
                {saving ? "Saving…" : saved && !dirty ? (<><CheckIcon size={16} />Saved</>) : "Save"}
              </Button>
            </div>
            {error ? (
              <p className="mt-2 text-sm text-danger">{error}</p>
            ) : saved && !dirty ? (
              <p className="mt-2 text-sm text-ok">Your name has been updated.</p>
            ) : null}
          </div>

          {/* Email — read-only, tied to sign-in. */}
          <div>
            <p className="eyebrow-mono">Email</p>
            <p className="mt-1.5 text-[15px] text-ink">{email ?? "—"}</p>
            <p className="mt-1 text-[13px] text-ink-faint">
              This is the account you sign in with and can&rsquo;t be changed here.
            </p>
          </div>

          {/* Role — read-only, gated elsewhere. */}
          <div>
            <p className="eyebrow-mono">Role</p>
            <p className="mt-1.5 text-[15px] text-ink">{roleLabel}</p>
            <p className="mt-1 text-[13px] text-ink-faint">
              Set when you joined. Contact your institution&rsquo;s ClassMind admin if this is wrong.
            </p>
          </div>
        </div>

        <div className="mt-8 border-t border-line pt-6">
          <Button tone="ghost" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </Card>
    </Page>
  );
}
