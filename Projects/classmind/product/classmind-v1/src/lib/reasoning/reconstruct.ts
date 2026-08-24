import "server-only";
import type { NormalizedTranscript } from "@/lib/transcript/types";
import { categoryOf, type ExtractionCandidate } from "@/lib/extraction";
import { getReasoningProvider } from "@/lib/reasoning";

// LAYER 2 -- contextual reconstruction.
//
// Layer 1 finds sentences that might matter. It cannot tell that four of them
// are one assignment, and no amount of additional pattern matching will,
// because the information needed is not in any of the sentences: "vo project ko
// cloud pe deploy karna hai" is only interpretable against the sentence before
// it. That is reference resolution, and it is what this layer is for.
//
// Three properties make this safe to build on a language model:
//
//   BOUNDED INPUT. The model never sees the lecture. It sees one window around
//   one cluster of candidates, so it cannot pull in unrelated material and
//   cannot be steered by something said twenty minutes away.
//
//   VERIFIED OUTPUT. Every quote it returns is checked to occur verbatim in
//   that window. An item with an unverifiable quote is DISCARDED, not repaired.
//   The model therefore cannot invent evidence and have it survive, which makes
//   "never invent" a property of the pipeline rather than an instruction.
//
//   EXPLICIT ABSENCE. The schema has a required `unspecified` field. A model
//   asked only for what was said will fill gaps; a model asked what was NOT
//   said has somewhere to put the gap.
//
// Nothing here knows what subject is being taught, who is teaching it, or what
// language it is in. It is the same pass for every lecture.

export interface ReconstructedEvidence {
  role: string;
  quote: string;
  startMs: number;
  endMs: number;
  charStart: number | null;
  charEnd: number | null;
}

export interface ReconstructedItem {
  category: "teaching" | "actionable" | "reference";
  kind: string;
  title: string;
  summary: string;
  steps: string[];
  unspecified: string[];
  confidence: number;
  evidence: ReconstructedEvidence[];
}

export interface ReconstructionResult {
  items: ReconstructedItem[];
  method: string;
  version: string;
  // Everything the pass did, kept for the report and for debugging a bad run.
  stats: {
    clusters: number;
    windows: number;
    calls: number;
    itemsProposed: number;
    itemsDroppedUnverifiable: number;
    failures: string[];
  };
}

export const RECONSTRUCTION_METHOD = "llm-reconstruct";
export const RECONSTRUCTION_VERSION = "1.0.0";

// A pause longer than this means the lecturer moved on. Chosen as a property of
// speech, not of any lecture: instructions belonging to one task are delivered
// without a topic change between them.
const CLUSTER_GAP_MS = 90_000;
// Context on either side of a cluster. Enough to contain the antecedent of a
// pronoun; short enough that the model cannot wander.
const CONTEXT_PAD_MS = 45_000;
// Teaching is consolidated by fixed windows rather than by clustering, because
// teaching candidates are near-continuous and clustering would produce one
// cluster spanning the lecture.
// Three minutes, not five. The window length is set by the MODEL's budget,
// not by anything pedagogical: sarvam-105b is a reasoning model, and on a
// 5,600-character excerpt it spent 12,000 characters thinking before writing
// a single character of answer. Measured at max_tokens 4000: a 5,600-char
// window finishes with `length` and returns EMPTY content; 3,500 chars
// finishes with `stop` and returns five well-formed items. Lecture speech
// runs around 1,100 characters a minute, so three minutes fits with room.
const TEACHING_WINDOW_MS = 180_000;
const MAX_WINDOW_CHARS = 3_500;

// The provider caps this at 4096 on the starter tier, and a reasoning model
// spends most of it thinking. Asking for less simply truncates the answer.
const MAX_COMPLETION_TOKENS = 4_000;

// Windows are independent, so they run concurrently. Sequentially a
// 23-minute lecture is nine calls at roughly forty seconds each -- six
// minutes, past the route's own ceiling. Four at a time fits inside it
// without asking the provider to absorb a burst.
const CONCURRENCY = 4;

// Runs `work` over `items`, at most CONCURRENCY at a time. Completion order
// does not matter: every result is independent and the caller sorts later.
async function inParallel<T>(items: T[], work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    for (;;) {
      const i = next; next += 1;
      if (i >= items.length) return;
      await work(items[i]);
    }
  });
  await Promise.all(runners);
}

// ---------------------------------------------------------------------------
// Windowing
// ---------------------------------------------------------------------------

interface Window {
  startMs: number;
  endMs: number;
  text: string;
  charStart: number;
}

// The transcript slice covering a time range, with the character offset it
// starts at so quotes found inside it can be mapped back to the full transcript.
function windowFor(t: NormalizedTranscript, fromMs: number, toMs: number): Window | null {
  const inRange = t.segments.filter((s) => s.endMs >= fromMs && s.startMs <= toMs);
  if (!inRange.length) return null;
  const first = inRange[0];
  const last = inRange[inRange.length - 1];
  let text = t.text.slice(first.charStart, last.charEnd);
  if (text.length > MAX_WINDOW_CHARS) text = text.slice(0, MAX_WINDOW_CHARS);
  return { startMs: first.startMs, endMs: last.endMs, text, charStart: first.charStart };
}

// Consecutive candidates separated by less than CLUSTER_GAP_MS.
function clusterByTime(candidates: ExtractionCandidate[]): ExtractionCandidate[][] {
  const sorted = [...candidates].sort((a, b) => a.evidenceStartMs - b.evidenceStartMs);
  const out: ExtractionCandidate[][] = [];
  for (const c of sorted) {
    const last = out[out.length - 1];
    if (last && c.evidenceStartMs - last[last.length - 1].evidenceEndMs <= CLUSTER_GAP_MS) last.push(c);
    else out.push([c]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Quote verification -- the safety mechanism
// ---------------------------------------------------------------------------

// Evidence must be what was SPOKEN.
//
// The normalized transcript interleaves [mm:ss] markers for reading, so a quote
// that happens to span a segment boundary picks one up -- and a marker is not
// speech. Storing it would put words in a lecturer's mouth that they never
// said, and it made three otherwise-correct quotes unverifiable against the raw
// ASR output.
//
// So matching and slicing both happen over a marker-free projection built from
// the segments themselves, with an index back to the real transcript so the
// character offsets the UI highlights with stay correct.
interface Spoken {
  text: string;
  // For each character of `text`, its offset in the full normalized transcript.
  realAt: Int32Array;
  // For each character, the index of the segment it came from.
  segAt: Int32Array;
}

function buildSpoken(t: NormalizedTranscript): Spoken {
  const parts: string[] = [];
  const real: number[] = [];
  const seg: number[] = [];
  t.segments.forEach((s, i) => {
    if (parts.length) { parts.push(" "); real.push(s.charStart); seg.push(i); }
    parts.push(s.text);
    for (let k = 0; k < s.text.length; k += 1) { real.push(s.charStart + k); seg.push(i); }
  });
  return { text: parts.join(""), realAt: Int32Array.from(real), segAt: Int32Array.from(seg) };
}

// Whitespace-collapsed view of the spoken text, with a map back to it. ASR
// spacing is irregular, so an exact indexOf is too strict -- but nothing here
// is fuzzy: a quote either occurs in the speech or the item carrying it is
// discarded. No stemming, no partial matches, no nearest-neighbour.
function collapse(text: string): { norm: string; map: Int32Array } {
  const chars: string[] = [];
  const map: number[] = [];
  let inWs = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      if (inWs) continue;
      inWs = true; chars.push(" "); map.push(i);
    } else {
      inWs = false; chars.push(ch.toLowerCase()); map.push(i);
    }
  }
  return { norm: chars.join(""), map: Int32Array.from(map) };
}

function locateQuote(
  quote: string,
  t: NormalizedTranscript,
  spoken: Spoken,
  collapsed: { norm: string; map: Int32Array },
): { startMs: number; endMs: number; charStart: number; charEnd: number; quote: string } | null {
  const needle = quote.replace(/\s+/g, " ").trim().toLowerCase();
  if (needle.length < 12) return null;
  const at = collapsed.norm.indexOf(needle);
  if (at === -1) return null;

  const from = collapsed.map[at];
  const to = collapsed.map[Math.min(at + needle.length - 1, collapsed.map.length - 1)] + 1;
  const firstSeg = spoken.segAt[from];
  const lastSeg = spoken.segAt[Math.min(to - 1, spoken.segAt.length - 1)];

  return {
    startMs: t.segments[firstSeg].startMs,
    endMs: t.segments[lastSeg].endMs,
    charStart: spoken.realAt[from],
    charEnd: spoken.realAt[Math.min(to - 1, spoken.realAt.length - 1)] + 1,
    // Sliced from the marker-free projection: verbatim speech, nothing else.
    quote: spoken.text.slice(from, to),
  };
}

function parseJsonBlock(text: string): unknown {
  // Models wrap JSON in prose or fences often enough that finding the outermost
  // object is worth doing rather than failing the whole call.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in completion");
  return JSON.parse(raw.slice(start, end + 1));
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const SHARED_RULES = `
You are reading a transcript excerpt from a university lecture. The speech is
often code-switched between English and Hindi (Hinglish) and the transcript is
automatic, so it contains recognition errors. Do not correct them.

ABSOLUTE RULES
1. Use ONLY the excerpt. Never use outside knowledge about the subject.
2. Every "quote" you output MUST be copied character-for-character from the
   excerpt. Do not paraphrase, translate, tidy or shorten a quote. A quote that
   does not appear in the excerpt causes the whole item to be discarded.
3. Never invent a deadline, a mark, a date, a platform or a requirement. If the
   lecturer did not state it, list it in "unspecified".
4. If a pronoun or a phrase like "vo project", "usko", "this", "the same",
   "it" refers to something said earlier in the excerpt, resolve it and say what
   it refers to. If the excerpt does not make the referent clear, say so in
   "unspecified" rather than guessing.
5. Write summaries in plain English even when the speech is Hinglish.
6. Output JSON only. No commentary before or after.`;

const ACTIONABLE_SYSTEM = `${SHARED_RULES}

Your task: reconstruct what students are actually required to DO.

Statements delivered close together are usually ONE task with several steps, not
several tasks. Judge by meaning: if a later statement continues, elaborates or
depends on an earlier one, they belong to the same item. Only emit separate
items when they are genuinely unrelated obligations.

Output shape:
{"items":[{
  "kind":"assignment"|"deadline"|"exam_instruction"|"announcement",
  "title":"short name for the task",
  "summary":"one or two sentences stating the complete requirement, with any references resolved",
  "steps":["ordered steps, each a complete instruction"],
  "unspecified":["things a student would need that the lecturer did not state"],
  "confidence":0.0-1.0,
  "evidence":[{"role":"introduces"|"requires"|"step"|"deadline"|"context","quote":"verbatim from the excerpt"}]
}]}

If the excerpt contains no genuine requirement on students, return {"items":[]}.`;

const TEACHING_SYSTEM = `${SHARED_RULES}

Your task: record what was TAUGHT in this excerpt, as a small number of coherent
knowledge items. Merge repetition and recaps of the same idea into one item.
Prefer five well-formed items over twenty fragments.

Output shape:
{"items":[{
  "kind":"topic"|"concept"|"comparison"|"procedure"|"example",
  "title":"the concept or topic name",
  "summary":"what the lecturer actually said about it, in plain English",
  "steps":[],
  "unspecified":[],
  "confidence":0.0-1.0,
  "evidence":[{"role":"explains","quote":"verbatim from the excerpt"}]
}]}

Do not record the lecturer's filler, greetings, or classroom management.
If the excerpt teaches nothing, return {"items":[]}.`;

// ---------------------------------------------------------------------------
// The pass
// ---------------------------------------------------------------------------

interface RawItem {
  kind?: string; title?: string; summary?: string;
  steps?: unknown; unspecified?: unknown; confidence?: unknown;
  evidence?: { role?: string; quote?: string }[];
}

const asStrings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];

export async function reconstructLecture(
  transcript: NormalizedTranscript,
  candidates: ExtractionCandidate[],
): Promise<ReconstructionResult> {
  const provider = getReasoningProvider();
  // Built once per lecture, not per quote.
  const spoken = buildSpoken(transcript);
  const collapsed = collapse(spoken.text);
  const stats = {
    clusters: 0, windows: 0, calls: 0,
    itemsProposed: 0, itemsDroppedUnverifiable: 0, failures: [] as string[],
  };
  const out: ReconstructedItem[] = [];

  // One call per unit of work. Each is independent, so a failure loses that
  // window and nothing else.
  async function runWindow(
    system: string,
    win: Window,
    category: ReconstructedItem["category"],
    hint: string,
  ) {
    stats.calls += 1;
    let parsed: { items?: RawItem[] };
    try {
      const res = await provider.complete({
        system,
        user: `${hint}\n\nEXCERPT (${Math.round(win.startMs / 1000)}s - ${Math.round(win.endMs / 1000)}s):\n"""\n${win.text}\n"""`,
        expectJson: true,
        maxTokens: MAX_COMPLETION_TOKENS,
      });
      parsed = parseJsonBlock(res.text) as { items?: RawItem[] };
    } catch (err) {
      stats.failures.push(`${category} ${Math.round(win.startMs / 1000)}s: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    for (const raw of parsed.items ?? []) {
      stats.itemsProposed += 1;
      const title = typeof raw.title === "string" ? raw.title.trim() : "";
      const summary = typeof raw.summary === "string" ? raw.summary.trim() : "";
      if (!title || !summary) { stats.itemsDroppedUnverifiable += 1; continue; }

      // Verification. Each quote must be locatable in the FULL transcript;
      // locating it is also what gives the item its real timestamps, so a
      // fabricated quote cannot even be assigned a position.
      const evidence: ReconstructedEvidence[] = [];
      for (const e of raw.evidence ?? []) {
        if (typeof e?.quote !== "string") continue;
        const at = locateQuote(e.quote, transcript, spoken, collapsed);
        if (!at) continue;
        evidence.push({
          role: typeof e.role === "string" && e.role ? e.role : "context",
          quote: at.quote,
          startMs: at.startMs, endMs: at.endMs,
          charStart: at.charStart, charEnd: at.charEnd,
        });
      }
      // No verified evidence, no item. This is the line that stops a fluent
      // hallucination from becoming stored knowledge.
      if (!evidence.length) { stats.itemsDroppedUnverifiable += 1; continue; }

      const c = Number(raw.confidence);
      out.push({
        category,
        kind: typeof raw.kind === "string" && raw.kind ? raw.kind : (category === "actionable" ? "assignment" : "topic"),
        title, summary,
        steps: asStrings(raw.steps),
        unspecified: asStrings(raw.unspecified),
        confidence: Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0.6,
        evidence,
      });
    }
  }

  // --- actionable: cluster, because obligations arrive in bursts -------------
  const actionable = candidates.filter((c) => categoryOf(c.kind) === "actionable");
  const clusters = clusterByTime(actionable);
  stats.clusters = clusters.length;
  await inParallel(clusters, async (cluster) => {
    const win = windowFor(
      transcript,
      cluster[0].evidenceStartMs - CONTEXT_PAD_MS,
      cluster[cluster.length - 1].evidenceEndMs + CONTEXT_PAD_MS,
    );
    if (!win) return;
    await runWindow(
      ACTIONABLE_SYSTEM, win, "actionable",
      `Sentences flagged as possible obligations in this excerpt:\n${cluster.map((c) => `- "${c.evidenceText.trim()}"`).join("\n")}`,
    );
  });

  // --- teaching: fixed windows, because teaching is continuous --------------
  const end = transcript.segments.at(-1)?.endMs ?? 0;
  const starts: number[] = [];
  for (let from = 0; from < end; from += TEACHING_WINDOW_MS) starts.push(from);
  await inParallel(starts, async (from) => {
    const win = windowFor(transcript, from, from + TEACHING_WINDOW_MS);
    if (!win) return;
    stats.windows += 1;
    await runWindow(TEACHING_SYSTEM, win, "teaching", "Record what is taught in this excerpt.");
  });

  return { items: out, method: RECONSTRUCTION_METHOD, version: RECONSTRUCTION_VERSION, stats };
}
