import { connection } from "next/server";
import {
  createServiceRoleClient,
  getSupabaseConfigStatus,
} from "@/lib/supabase/server";

// A real Hinglish sentence, not a generic Devanagari sample — this is the
// kind of code-switched line the pipeline actually has to survive.
const DEVANAGARI_TEST_STRING =
  "यह बहुत important concept है जो exam में आएगा";

type ConnectionCheck =
  | { ok: true }
  | { ok: false; reason: string };

async function checkSupabaseConnection(): Promise<ConnectionCheck> {
  const status = getSupabaseConfigStatus();
  if (!status.configured) {
    return { ok: false, reason: `not configured — missing ${status.missing.join(", ")}` };
  }
  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.storage.listBuckets();
    if (error) {
      return { ok: false, reason: error.message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

export default async function Home() {
  // Opts this page into request-time rendering so `next build` never tries
  // to reach Supabase at build time — see AGENTS.md and
  // node_modules/next/dist/docs/01-app/02-guides/environment-variables.md.
  await connection();

  const supabase = await checkSupabaseConnection();

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold">ClassMind — Lab v0</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Lecture Ingestion · Milestone 1: environment scaffold
      </p>

      <section className="mt-10 space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Devanagari render check
        </h2>
        <p lang="hi" className="text-lg">
          {DEVANAGARI_TEST_STRING}
        </p>
        <p className="text-xs text-zinc-500">
          Rendered directly, not printed to a console — this is the check
          that catches Windows silently corrupting it.
        </p>
      </section>

      <section className="mt-10 space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Supabase connectivity
        </h2>
        {supabase.ok ? (
          <p className="text-green-700">Connected.</p>
        ) : (
          <p className="text-amber-700">Not connected — {supabase.reason}</p>
        )}
        <p className="text-xs text-zinc-500">
          Checked with the service-role key, server-side only — proves the
          URL/key pair works regardless of any bucket policy, since no
          bucket exists yet (that&apos;s Milestone 2).
        </p>
      </section>
    </main>
  );
}
