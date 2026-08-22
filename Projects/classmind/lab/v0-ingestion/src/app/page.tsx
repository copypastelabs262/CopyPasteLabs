import { connection } from "next/server";
import {
  createServiceRoleClient,
  getSupabaseConfigStatus,
} from "@/lib/supabase/server";
import LabConsole from "./_components/LabConsole";

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
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-10">
        <h1 className="text-2xl font-semibold">ClassMind — Lab v0</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Lecture Ingestion · audio in, transcript out. Experiment Platform, not the product.
        </p>
      </header>

      <LabConsole />

      <footer className="mt-16 space-y-4 border-t border-zinc-200 pt-6 text-xs text-zinc-500 dark:border-zinc-800">
        <div>
          <span className="uppercase tracking-wide">Devanagari render check</span>
          <p lang="hi" className="mt-1 text-base text-zinc-700 dark:text-zinc-300">
            {DEVANAGARI_TEST_STRING}
          </p>
          <p className="mt-1">
            Rendered from disk, not printed to a console — the check that catches
            Windows silently corrupting it.
          </p>
        </div>
        <div>
          <span className="uppercase tracking-wide">Supabase</span>{" "}
          {supabase.ok ? (
            <span className="text-green-700 dark:text-green-400">Connected.</span>
          ) : (
            <span className="text-amber-700 dark:text-amber-400">
              Not connected — {supabase.reason}
            </span>
          )}
        </div>
      </footer>
    </main>
  );
}
