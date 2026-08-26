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
//   one part of it, so it cannot pull in unrelated material and cannot be
//   steered by something said twenty minutes away.
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
//
// THE CUE LEXICON IS A HINT, NOT A GATE (v1.1.0).
//
// Until v1.0.0 the actionable pass only looked where Layer 1's cue lexicon had
// already fired. That made a 1,000-line Hinglish word list the hard recall
// ceiling on assignments: a lecturer who phrased an obligation in words the
// list did not contain produced no window, so the model was never pointed at
// that part of the lecture, and the assignment was invisible -- with no error
// and no empty state to notice it. Twice, a real lecture required new lexicon
// entries before its assignment could be seen at all.
//
// Both passes now sweep the whole lecture. The cue hits are passed into each
// window as evidence ABOUT that window rather than as permission to look at it,
// which is what the lexicon is actually good for: it is a cheap, precise,
// offline prior, and a prior belongs in the prompt, not in the control flow.

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
    cueHits: number;
    actionableWindows: number;
    teachingWindows: number;
    windows: number;
    calls: number;
    itemsProposed: number;
    itemsDroppedUnverifiable: number;
    duplicatesMerged: number;
    failures: string[];
  };
}

export const RECONSTRUCTION_METHOD = "llm-reconstruct";
export const RECONSTRUCTION_VERSION = "1.1.0";

// Three minutes, not five. The window length is set by the MODEL's budget, not
// by anything pedagogical: sarvam-105b is a reasoning model, and on a
// 5,600-character excerpt it spent 12,000 characters thinking before writing a
// single character of answer. Measured at max_tokens 4000: a 5,600-char window
// finishes with `length` and returns EMPTY content; 3,500 chars finishes with
// `stop` and returns five well-formed items. Lecture speech runs around 1,100
// characters a minute, so three minutes fits with room.
//
// The same budget binds both passes, so both use it.
const WINDOW_MS = 180_000;
const MAX_WINDOW_CHARS = 3_500;

// Teaching windows are laid end to end: teaching is continuous, every window
// contains some, and a topic split across a boundary still appears whole on one
// side or the other.
const TEACHING_STRIDE_MS = WINDOW_MS;

// Actionable windows OVERLAP, and that is load-bearing. An obligation is
// assembled from statements up to a minute apart -- in the reference lecture,
// four sentences over 45 seconds -- and a boundary falling between the setup
// and the pronoun referring back to it ("vo project ko deploy karna hai")
// destroys exactly the case this layer exists for. A 60-second overlap
// guarantees any two moments within a minute of each other are read together in
// at least one window.
//
// The overlap also absorbs MAX_WINDOW_CHARS truncation: a window whose text is
// cut short loses its tail to the character cap, and the next window opens 60
// seconds before that tail.
const ACTIONABLE_STRIDE_MS = 120_000;

// The provider caps this at 4096 on the starter tier, and a reasoning model
// spends most of it thinking. Asking for less simply truncates the answer.
const MAX_COMPLETION_TOKENS = 4_000;

// Windows are independent, so they run concurrently.
//
// The full sweep roughly doubles the call count: a 23-minute lecture is about
// eight teaching windows plus twelve actionable ones, which at four at a time
// and roughly forty seconds a call sits near 200 seconds -- inside the extract
// route's 300-second ceiling, but no longer far inside it. A 90-minute lecture
// does NOT fit and will time out; that needs the pipeline moved off the request
// path, not a bigger number here. Four is left alone deliberately: the right
// value is a property of the provider's rate limit, which has not been
// measured, and guessing it trades a known ceiling for an unknown one.
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

// Window start offsets covering the whole lecture at the given stride. A stride
// shorter than WINDOW_MS produces overlapping windows.
function windowStarts(endMs: number, strideMs: number): number[] {
  const starts: number[] = [];
  for (let from = 0; from < endMs; from += strideMs) starts.push(from);
  return starts;
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
// Duplicate merging
// ---------------------------------------------------------------------------
//
// Overlapping actionable windows mean one assignment can be reconstructed
// twice, once from each window containing it. A review queue that shows a
// single assignment as two is a worse product than the recall gap the overlap
// exists to close, so duplicates are merged before anything is stored.

const DUPLICATE_OVERLAP = 0.5;

function evidenceSpan(item: ReconstructedItem): { from: number; to: number } {
  let from = Number.POSITIVE_INFINITY;
  let to = Number.NEGATIVE_INFINITY;
  for (const e of item.evidence) {
    if (e.charStart !== null && e.charStart < from) from = e.charStart;
    if (e.charEnd !== null && e.charEnd > to) to = e.charEnd;
  }
  return { from, to };
}

// Fraction of the SHORTER span that the two share. Measured against the shorter
// one on purpose: an obligation caught whole in one window and only partly in
// the next should still merge, and scoring that pair against the longer span
// would put it under any sensible threshold.
function overlapRatio(a: { from: number; to: number }, b: { from: number; to: number }): number {
  const lo = Math.max(a.from, b.from);
  const hi = Math.min(a.to, b.to);
  if (hi <= lo) return 0;
  const shorter = Math.min(a.to - a.from, b.to - b.from);
  return shorter > 0 ? (hi - lo) / shorter : 0;
}

// Keeps the best-evidenced version of each obligation.
//
// Identity is decided by WHERE the evidence sits, not by what the item is
// called. The model words a title differently in each window, but the sentences
// it cites are the same sentences, and those have already been verified into
// real character positions -- so the transcript itself, rather than a string
// similarity heuristic, is what decides that two items are one.
function dedupeByEvidence(items: ReconstructedItem[]): ReconstructedItem[] {
  // Best first, so the survivor of any pair is the richer reconstruction: more
  // verified evidence, then higher confidence, then more steps.
  const ranked = [...items].sort((a, b) =>
    b.evidence.length - a.evidence.length ||
    b.confidence - a.confidence ||
    b.steps.length - a.steps.length,
  );
  const kept: { item: ReconstructedItem; span: { from: number; to: number } }[] = [];
  for (const item of ranked) {
    const span = evidenceSpan(item);
    if (kept.some((k) => overlapRatio(k.span, span) >= DUPLICATE_OVERLAP)) continue;
    kept.push({ item, span });
  }
  return kept.map((k) => k.item);
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

An obligation is something the STUDENTS must do. A step the lecturer performs in
a worked example, a hypothetical, and an aside about exam technique are NOT
obligations, however imperative they sound.

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

// What to say when the cheap pass found nothing in this window.
//
// Sweeping every window with the actionable question invites a model to
// manufacture an obligation out of ordinary teaching, which is the precision
// risk the old cue gate was managing by accident. The lexicon's silence is real
// evidence -- weak, but real -- so it is passed on as evidence: it raises the
// bar for this window without closing it. That is the whole difference between
// a hint and a gate.
const NO_CUE_HINT =
  "No sentence in this excerpt matched the obligation cues, and most of a " +
  "lecture contains no obligation at all. Return an empty list unless the " +
  "excerpt plainly states something the students themselves must do.";

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
    cueHits: 0, actionableWindows: 0, teachingWindows: 0, windows: 0, calls: 0,
    itemsProposed: 0, itemsDroppedUnverifiable: 0, duplicatesMerged: 0,
    failures: [] as string[],
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

  const end = transcript.segments.at(-1)?.endMs ?? 0;

  // --- actionable: full sweep, overlapping windows, cues as a hint ----------
  const actionableCues = candidates.filter((c) => categoryOf(c.kind) === "actionable");
  stats.cueHits = actionableCues.length;

  await inParallel(windowStarts(end, ACTIONABLE_STRIDE_MS), async (from) => {
    const win = windowFor(transcript, from, from + WINDOW_MS);
    if (!win) return;
    stats.actionableWindows += 1;
    // Which flagged sentences fall inside THIS window. The lexicon still
    // speaks; it just no longer decides whether the model is allowed to look.
    const inWindow = actionableCues.filter(
      (c) => c.evidenceEndMs >= win.startMs && c.evidenceStartMs <= win.endMs,
    );
    const hint = inWindow.length
      ? `Sentences flagged as possible obligations in this excerpt:\n${inWindow.map((c) => `- "${c.evidenceText.trim()}"`).join("\n")}`
      : NO_CUE_HINT;
    await runWindow(ACTIONABLE_SYSTEM, win, "actionable", hint);
  });

  // --- teaching: fixed windows, because teaching is continuous --------------
  await inParallel(windowStarts(end, TEACHING_STRIDE_MS), async (from) => {
    const win = windowFor(transcript, from, from + WINDOW_MS);
    if (!win) return;
    stats.teachingWindows += 1;
    await runWindow(TEACHING_SYSTEM, win, "teaching", "Record what is taught in this excerpt.");
  });

  stats.windows = stats.actionableWindows + stats.teachingWindows;

  // Only the actionable pass overlaps, so only it can double-report. Teaching
  // windows are laid end to end and are left exactly as the model returned them.
  const actionableItems = out.filter((i) => i.category === "actionable");
  const others = out.filter((i) => i.category !== "actionable");
  const merged = dedupeByEvidence(actionableItems);
  stats.duplicatesMerged = actionableItems.length - merged.length;

  // Lecture order, so the review queue and the knowledge panel read the way the
  // lecture was delivered.
  const items = [...merged, ...others].sort(
    (a, b) => (a.evidence[0]?.startMs ?? 0) - (b.evidence[0]?.startMs ?? 0),
  );

  return { items, method: RECONSTRUCTION_METHOD, version: RECONSTRUCTION_VERSION, stats };
}
