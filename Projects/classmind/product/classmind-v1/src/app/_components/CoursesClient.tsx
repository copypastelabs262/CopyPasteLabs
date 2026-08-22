"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Input } from "./Input";

interface Course {
  id: string; code: string; title: string; term: string | null;
  join_code?: string; transcription_language?: string;
}

export default function CoursesClient() {
  const [owned, setOwned] = useState<Course[]>([]);
  const [enrolled, setEnrolled] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Separate from `error`, which belongs to the list, and from each other. A
  // rejected join code reported at the top of the page reads as "your courses
  // failed to load", and it used to stay there through every later success.
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [term, setTerm] = useState("");
  const [language, setLanguage] = useState("en-IN");
  const [joinCode, setJoinCode] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/courses")
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (cancelled) return;
        if (!ok) throw new Error(b.error ?? "Could not load courses.");
        setOwned(b.owned ?? []); setEnrolled(b.enrolled ?? []); setError(null);
      })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reload]);

  async function post(url: string, body: unknown) {
    const r = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const b = await r.json();
    if (!r.ok) throw new Error(b.error ?? "Request failed.");
    return b;
  }

  return (
    <div className="space-y-12">
      <section>
        <h1 className="text-xl font-semibold">Your courses</h1>
        {loading ? <p className="mt-4 text-sm text-zinc-500">Loading…</p> : null}
        {error ? <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p> : null}

        {!loading && !owned.length && !enrolled.length ? (
          <p className="mt-4 text-sm text-zinc-500">
            No courses yet. Create one below, or join with a code.
          </p>
        ) : null}

        {owned.length ? (
          <ul className="mt-4 divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {owned.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <Link href={`/courses/${c.id}`} className="font-medium hover:underline">
                    {c.code} — {c.title}
                  </Link>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Teaching{c.term ? ` · ${c.term}` : ""}
                    {c.transcription_language ? ` · ${c.transcription_language}` : ""}
                    {c.join_code ? ` · join code ` : ""}
                    {c.join_code ? <code className="font-mono">{c.join_code}</code> : null}
                  </p>
                </div>
                <Link href={`/courses/${c.id}`} className="shrink-0 text-sm text-zinc-600 hover:underline dark:text-zinc-400">
                  Open
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        {enrolled.length ? (
          <>
            <h2 className="mt-8 text-sm font-medium uppercase tracking-wide text-zinc-500">Enrolled</h2>
            <ul className="mt-2 divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {enrolled.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-4 p-4">
                  <Link href={`/courses/${c.id}`} className="font-medium hover:underline">
                    {c.code} — {c.title}
                  </Link>
                  <span className="text-xs text-zinc-500">Student</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <section className="grid gap-8 sm:grid-cols-2">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setFormError(null);
            try {
              await post("/api/courses", { code, title, term, transcriptionLanguage: language });
              setCode(""); setTitle(""); setTerm(""); setReload((v) => v + 1);
            } catch (err) { setFormError(err instanceof Error ? err.message : String(err)); }
          }}
          className="space-y-3 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800"
        >
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Create a course</h2>
          <Input label="Course code" value={code} onChange={setCode} placeholder="PH101" required />
          <Input label="Title" value={title} onChange={setTitle} placeholder="Electric Charges and Fields" required />
          <Input label="Term" value={term} onChange={setTerm} placeholder="Autumn 2026" />
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
              Lecture language
            </label>
            <select
              value={language} onChange={(e) => setLanguage(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            >
              <option value="en-IN">English (India)</option>
              <option value="hi-IN">Hindi / Hinglish</option>
              <option value="unknown">Auto-detect (not recommended)</option>
            </select>
            <p className="mt-1 text-xs text-zinc-500">
              Auto-detect once romanized an English lecture into Arabic. Pick what you teach in.
            </p>
          </div>
          {formError ? <p className="text-sm text-red-600 dark:text-red-400">{formError}</p> : null}
          <button className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900">
            Create course
          </button>
        </form>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await post("/api/enroll", { joinCode });
              setJoinCode(""); setReload((v) => v + 1);
            } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
          }}
          className="space-y-3 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800"
        >
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Join a course</h2>
          <Input label="Join code" value={joinCode} onChange={setJoinCode} placeholder="a1b2c3d4" required />
          <button className="w-full rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900">
            Join as student
          </button>
        </form>
      </section>
    </div>
  );
}
