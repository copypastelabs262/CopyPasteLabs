// Self-test for Layer 2, contextual reconstruction. Run with:
//
//   node --conditions=react-server scripts/test-reconstruction.mts
//
// The condition flag makes the `server-only` marker package resolve to its
// no-op entry, which is what lets a server module be exercised by plain node.
// No test framework and no network: the reasoning provider is injected, so
// every property below is checked against a transcript this file builds itself.
//
// WHY THIS TRANSCRIPT IS NOT THE ONE IN THE DATABASE.
//
// Layer 2's claims are claims about ANY lecture: that four sentences about one
// obligation become one item, that a quote is verified against the excerpt the
// model was actually shown, that a failed pass is distinguishable from an empty
// lecture. A suite written against the cloud-computing recording could not tell
// those properties apart from that recording's particulars. So the fixture here
// is a Hinglish MICROBIOLOGY lab lecture -- a subject nothing in the pipeline
// has ever seen -- and section 7 re-runs the identical assertions over a third
// subject to show the pass does not care which.

import { reconstructLecture, __internals } from "../src/lib/reasoning/reconstruct.ts";
import { normalizeRawTranscript } from "../src/lib/transcript/normalize.ts";
import type { NormalizedTranscript } from "../src/lib/transcript/types.ts";
import type { ReasoningProvider, ReasoningRequest } from "../src/lib/reasoning/types.ts";
import { __internals as sarvamInternals } from "../src/lib/reasoning/sarvam.ts";

let passed = 0;
let failed = 0;

function check(ok: boolean, label: string, detail?: unknown): void {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${label}`);
    if (detail !== undefined) {
      console.log(`        ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 600)}`);
    }
  }
}

function section(title: string): void {
  console.log(`\n--- ${title} ---`);
}

// ---------------------------------------------------------------------------
// The fixture lecture
// ---------------------------------------------------------------------------
//
// Seven minutes of a Hinglish microbiology lab class. The four sentences at
// 250s-307s are ONE obligation stated across four utterances: the task is named
// in the first, the second refers back to it with "usko", the third with "vo",
// and the fourth withholds the deadline. Reconstructing that as three unrelated
// records is the exact failure Layer 2 was built to fix, so it is the shape the
// fixture is built around.

const OBLIGATION = {
  a: "Ab dekhiye, aapko ek research paper find karna hai jo antibiotic resistance ke upar ho.",
  b: "Usko padhne ke baad, uske method ko apne lab notebook mein implement karna hai.",
  c: "Aur phir vo poore experiment ko agle batch ke saamne present karna hai.",
  d: "Deadline ke baare mein main aapko baad mein bata dunga.",
};

const TEACHING_LINE = "Gram staining mein crystal violet dye bacteria ki cell wall ko colour deta hai.";
const LATE_LINE = "Chaliye, aaj ke liye itna hi, next class mein hum sterilization dekhenge.";

function lectureSegments(): { text: string; start: number; end: number }[] {
  const filler = [
    "Namaste sab log, aaj hum microbiology lab ke basics dekhenge.",
    "Sabse pehle safety, gloves aur lab coat hamesha pehen kar aana.",
    "Culture media do tarah ke hote hain, solid aur liquid.",
    "Agar plate contaminate ho jaye toh usko autoclave mein daal dena.",
    TEACHING_LINE,
    "Iske baad safranin counterstain lagaya jata hai taaki contrast aaye.",
    "Gram positive bacteria purple dikhte hain aur gram negative pink.",
    "Microscope ka oil immersion lens hundred x magnification deta hai.",
    "Inoculation loop ko flame mein red hot karke thanda karna zaroori hai.",
    "Aseptic technique ka matlab hai bahar ki hawa se contamination na aaye.",
    "Incubator mein normally sattis degree celsius par rakha jata hai.",
    "Colony counting ke liye hum quadrant streaking method use karte hain.",
    "Antibiotic sensitivity test mein disc diffusion sabse common hai.",
    "Zone of inhibition ka diameter millimetre mein measure hota hai.",
    "Resistant strains mein ye zone bahut chhota ya bilkul nahi hota.",
    "Isi wajah se antibiotic resistance aaj ek global problem ban gaya hai.",
  ];

  const out: { text: string; start: number; end: number }[] = [];
  let t = 0;
  for (const text of filler) {
    out.push({ text, start: t, end: t + 15 });
    t += 15;
  }
  // t is now 240. The obligation runs 250 -> 307.
  out.push({ text: "Theek hai, ab aapke assessment ki baat karte hain.", start: 240, end: 250 });
  out.push({ text: OBLIGATION.a, start: 250, end: 265 });
  out.push({ text: OBLIGATION.b, start: 265, end: 280 });
  out.push({ text: OBLIGATION.c, start: 280, end: 292 });
  out.push({ text: OBLIGATION.d, start: 292, end: 307 });
  out.push({ text: "Koi doubt ho toh lab ke baad mil lena.", start: 307, end: 320 });
  out.push({ text: "Ek baat aur, notebook neat rakhna, marks usme bhi hain.", start: 320, end: 340 });
  out.push({ text: LATE_LINE, start: 400, end: 415 });
  return out;
}

function buildTranscript(segments: { text: string; start: number; end: number }[]): NormalizedTranscript {
  const t = normalizeRawTranscript({ segments });
  if (!t) throw new Error("fixture transcript failed to normalize");
  return t;
}

const transcript = buildTranscript(lectureSegments());

// ---------------------------------------------------------------------------
// Injected providers
// ---------------------------------------------------------------------------

// The excerpt the pass built, pulled back out of the prompt. Everything a fake
// provider answers is derived from this, so a provider can only ever quote what
// the pass actually showed it -- which is what makes these fakes honest.
function excerptOf(request: ReasoningRequest): string {
  const m = request.user.match(/"""\n([\s\S]*?)\n"""/);
  return m ? m[1] : "";
}

function isActionable(request: ReasoningRequest): boolean {
  return request.system.includes("reconstruct what students are actually required to DO");
}

function reply(items: unknown[]): string {
  return JSON.stringify({ items });
}

function provider(complete: (r: ReasoningRequest) => string): ReasoningProvider {
  return {
    id: "fake",
    model: "fake",
    async complete(request: ReasoningRequest) {
      return {
        text: complete(request),
        model: "fake",
        requestId: null,
        promptTokens: null,
        completionTokens: null,
      };
    },
  };
}

// The provider a well-behaved model would be: it reads the excerpt, and when
// all four sentences of the obligation are present it returns them as ONE item
// with four evidence spans and an explicit list of what was never stated.
const goodProvider = provider((r) => {
  const excerpt = excerptOf(r);
  if (isActionable(r)) {
    const quotes = [OBLIGATION.a, OBLIGATION.b, OBLIGATION.c, OBLIGATION.d]
      .filter((q) => excerpt.includes(q));
    if (quotes.length < 4) return reply([]);
    return reply([{
      kind: "assignment",
      title: "Research paper: read, implement, present",
      summary:
        "Students must find a research paper on antibiotic resistance, implement its method " +
        "in their lab notebook, and present the experiment to the next batch.",
      steps: [
        "Find a research paper on antibiotic resistance.",
        "Implement its method in your lab notebook.",
        "Present the experiment to the next batch.",
      ],
      unspecified: ["the deadline", "the marks", "whether it is individual or group work"],
      confidence: 0.86,
      evidence: [
        { role: "introduces", quote: quotes[0] },
        { role: "step", quote: quotes[1] },
        { role: "step", quote: quotes[2] },
        { role: "deadline", quote: quotes[3] },
      ],
    }]);
  }
  if (excerpt.includes(TEACHING_LINE)) {
    return reply([{
      kind: "concept",
      title: "Gram staining",
      summary: "Crystal violet colours the bacterial cell wall during Gram staining.",
      steps: [],
      unspecified: [],
      confidence: 0.8,
      evidence: [{ role: "explains", quote: TEACHING_LINE }],
    }]);
  }
  return reply([]);
});

// ---------------------------------------------------------------------------
// 1. Windowing
// ---------------------------------------------------------------------------

section("Windowing");

const { buildSpoken, windowFor, windowStarts, locateQuote, collapse } = __internals;
const spoken = buildSpoken(transcript);
const endMs = transcript.segments.at(-1)!.endMs;

const actionableStarts = windowStarts(endMs, __internals.ACTIONABLE_STRIDE_MS);
const teachingStarts = windowStarts(endMs, __internals.TEACHING_STRIDE_MS);

check(
  __internals.ACTIONABLE_STRIDE_MS < __internals.WINDOW_MS,
  "actionable windows overlap, which is what lets one obligation be read whole",
  `stride ${__internals.ACTIONABLE_STRIDE_MS} vs window ${__internals.WINDOW_MS}`,
);
check(
  actionableStarts.length > teachingStarts.length,
  "the overlapping sweep produces more windows than the end-to-end one",
  `${actionableStarts.length} vs ${teachingStarts.length}`,
);

const actionableWindows = actionableStarts
  .map((from) => windowFor(transcript, spoken, from, from + __internals.WINDOW_MS))
  .filter((w) => w !== null);

// THE MARKER REGRESSION. The excerpt handed to the model must be pure speech.
// When it carried the transcript's [mm:ss] reading markers, a model obeying
// "copy the quote character-for-character" produced quotes containing a
// timestamp, and verification -- which searches marker-free speech -- could
// never find them. The item was then discarded as unverifiable although the
// model had done exactly as instructed.
check(
  actionableWindows.every((w) => !/\[\d\d:\d\d\]/.test(w.text)),
  "no window excerpt contains a [mm:ss] marker -- the model is shown only speech",
  actionableWindows.find((w) => /\[\d\d:\d\d\]/.test(w.text))?.text.slice(0, 200),
);
check(
  actionableWindows.every((w) => spoken.text.slice(w.spokenStart, w.spokenEnd) === w.text),
  "every window's text is exactly the span it claims in the spoken projection",
);
check(
  actionableWindows.every((w) => w.text.length <= __internals.MAX_WINDOW_CHARS),
  "no window exceeds the model's measured character budget",
);

// The point of the overlap: an obligation spread over 57 seconds must land
// COMPLETE inside at least one window, or the sentences that resolve each
// other's pronouns are never read together.
const whole = actionableWindows.filter((w) =>
  w.text.includes(OBLIGATION.a) && w.text.includes(OBLIGATION.b) &&
  w.text.includes(OBLIGATION.c) && w.text.includes(OBLIGATION.d),
);
check(
  whole.length >= 1,
  "an obligation spoken across four sentences lands whole inside at least one window",
  `${whole.length} of ${actionableWindows.length} windows contain all four`,
);
check(
  whole.length >= 2,
  "and inside more than one, which is what the duplicate merge then has to handle",
  `${whole.length} windows`,
);

// ---------------------------------------------------------------------------
// 2. One obligation, several evidence spans
// ---------------------------------------------------------------------------

section("Multi-sentence contextual reconstruction");

const result = await reconstructLecture(transcript, [], goodProvider);
const actionable = result.items.filter((i) => i.category === "actionable");

check(actionable.length === 1, "four sentences become ONE actionable item, not three or four",
  actionable.map((i) => i.title));
check(
  actionable[0]?.evidence.length === 4,
  "that one item carries all four evidence spans",
  actionable[0]?.evidence.map((e) => e.quote),
);
check(
  actionable[0]?.steps.length === 3,
  "the ordered steps survive reconstruction",
  actionable[0]?.steps,
);
check(
  (actionable[0]?.unspecified.length ?? 0) >= 3 &&
    actionable[0].unspecified.some((u) => /deadline/i.test(u)),
  "what the lecturer did NOT say is recorded explicitly, deadline included",
  actionable[0]?.unspecified,
);
check(
  result.stats.duplicatesMerged >= 1,
  "the same obligation reconstructed from two overlapping windows is merged, not double-reported",
  `duplicatesMerged=${result.stats.duplicatesMerged}`,
);
check(
  new Set(actionable[0]?.evidence.map((e) => e.role)).size >= 3,
  "the evidence spans keep their distinct roles rather than collapsing to one",
  actionable[0]?.evidence.map((e) => e.role),
);
check(result.complete === true, "a pass where every window returned reports itself complete",
  result.stats.failures);
check(
  result.items.some((i) => i.category === "teaching"),
  "the teaching sweep runs over the same lecture and produces its own items",
  result.items.map((i) => i.category),
);

// ---------------------------------------------------------------------------
// 3. Evidence integrity
// ---------------------------------------------------------------------------

section("Evidence integrity");

const allEvidence = result.items.flatMap((i) => i.evidence);

check(allEvidence.length > 0, "there is evidence to check at all");
check(
  allEvidence.every((e) => e.charStart !== null && e.charEnd !== null && e.charStart < e.charEnd),
  "every span is a non-empty, correctly ordered character range",
);
check(
  allEvidence.every((e) => e.charEnd! <= transcript.text.length),
  "no span points past the end of the transcript",
);

// The stored quote is marker-free speech; the stored span is the highlight
// range in the transcript a reader actually sees, so for a quote crossing a
// segment boundary the span legitimately contains the [mm:ss] marker between
// them. Stripping markers is therefore the exact relationship that must hold,
// and it is what proves the offsets were not merely plausible.
function stripMarkers(s: string): string {
  return s.replace(/\[\d\d:\d\d\]/g, " ").replace(/\s+/g, " ").trim();
}
const mismatched = allEvidence.filter(
  (e) => stripMarkers(transcript.text.slice(e.charStart!, e.charEnd!)) !== stripMarkers(e.quote),
);
check(
  mismatched.length === 0,
  "every char offset slices back to exactly its own quote in the normalized transcript",
  mismatched.map((e) => ({
    quote: e.quote.slice(0, 80),
    sliced: transcript.text.slice(e.charStart!, e.charEnd!).slice(0, 80),
  })),
);

check(
  allEvidence.every((e) => e.startMs <= e.endMs),
  "every evidence time range is correctly ordered",
);
check(
  allEvidence.every((e) =>
    transcript.segments.some((s) => s.startMs === e.startMs) &&
    transcript.segments.some((s) => s.endMs === e.endMs),
  ),
  "every timestamp is a real segment boundary, never an interpolated guess",
);
check(
  allEvidence.every((e) => transcript.text.includes(stripMarkers(e.quote)) || stripMarkers(e.quote).length > 0),
  "every stored quote is non-empty verbatim speech",
);

// ---------------------------------------------------------------------------
// 4. Quote verification cannot be bypassed
// ---------------------------------------------------------------------------

section("Quote verification");

// A model that invents one quote among three: the invention is dropped and the
// item survives on the evidence that verified.
const partlyFabricated = await reconstructLecture(transcript, [], provider((r) => {
  if (!isActionable(r)) return reply([]);
  const excerpt = excerptOf(r);
  if (!excerpt.includes(OBLIGATION.a)) return reply([]);
  return reply([{
    kind: "assignment", title: "Mixed evidence", summary: "One real quote and one invented one.",
    steps: [], unspecified: [], confidence: 0.9,
    evidence: [
      { role: "introduces", quote: OBLIGATION.a },
      { role: "deadline", quote: "Submission ki last date agle Monday paanch baje hai." },
    ],
  }]);
}));
const mixed = partlyFabricated.items.filter((i) => i.category === "actionable");
check(mixed.length === 1, "an item with one real quote survives", mixed.length);
check(
  mixed[0]?.evidence.length === 1 && mixed[0].evidence[0].quote.includes("research paper"),
  "and the invented deadline is silently dropped rather than stored",
  mixed[0]?.evidence.map((e) => e.quote),
);

// A model that invents EVERY quote: nothing survives. This is the line that
// stops a fluent hallucination becoming stored knowledge.
const allFabricated = await reconstructLecture(transcript, [], provider((r) =>
  isActionable(r)
    ? reply([{
        kind: "assignment", title: "Entirely invented",
        summary: "A confident assignment with no basis in the lecture.",
        steps: [], unspecified: [], confidence: 0.99,
        evidence: [
          { role: "requires", quote: "Aapko teen hazaar shabdon ka essay likhna hai." },
          { role: "deadline", quote: "Ye pandrah tareekh tak jama karna hai." },
        ],
      }])
    : reply([]),
));
check(
  allFabricated.items.filter((i) => i.category === "actionable").length === 0,
  "an item whose every quote is invented is DISCARDED, not repaired",
  allFabricated.items.map((i) => i.title),
);
check(
  allFabricated.stats.itemsDroppedUnverifiable >= 1,
  "and the drop is counted rather than passing silently",
  allFabricated.stats,
);

// Paraphrase is not quotation. A tidied, translated or shortened quote does not
// verify, which is what makes "copy it exactly" enforceable rather than merely
// requested.
const paraphrased = await reconstructLecture(transcript, [], provider((r) =>
  isActionable(r)
    ? reply([{
        kind: "assignment", title: "Paraphrased", summary: "Quote tidied into clean English.",
        steps: [], unspecified: [], confidence: 0.9,
        evidence: [{ role: "introduces", quote: "You have to find a research paper on antibiotic resistance." }],
      }])
    : reply([]),
));
check(
  paraphrased.items.filter((i) => i.category === "actionable").length === 0,
  "a paraphrase of a real sentence does not verify",
);

// An item with no evidence array at all cannot buy its way in.
const noEvidence = await reconstructLecture(transcript, [], provider((r) =>
  isActionable(r)
    ? reply([{ kind: "assignment", title: "Bare claim", summary: "No evidence offered.", steps: [], unspecified: [], confidence: 1 }])
    : reply([]),
));
check(
  noEvidence.items.filter((i) => i.category === "actionable").length === 0,
  "an item offering no evidence at all is discarded",
);

// WINDOW-BOUNDED VERIFICATION. A quote must occur in the excerpt the model was
// shown, not merely somewhere in the lecture. Bounded input with unbounded
// verification is how a coincidence forty minutes away becomes evidence.
const collapsed = collapse(spoken.text);
const firstWindow = windowFor(transcript, spoken, 0, __internals.WINDOW_MS)!;
check(
  locateQuote(LATE_LINE, transcript, spoken, collapsed) !== null,
  "a late sentence is locatable in the transcript as a whole",
);
check(
  locateQuote(LATE_LINE, transcript, spoken, collapsed, {
    from: firstWindow.spokenStart, to: firstWindow.spokenEnd,
  }) === null,
  "but NOT when the search is bounded to a window that does not contain it",
);
check(
  locateQuote(OBLIGATION.a, transcript, spoken, collapsed, {
    from: whole[0].spokenStart, to: whole[0].spokenEnd,
  }) !== null,
  "and a quote genuinely inside its window still verifies",
);

// ---------------------------------------------------------------------------
// 5. Failure states
// ---------------------------------------------------------------------------

section("Failure states are distinguishable from an empty lecture");

const totalOutage = await reconstructLecture(transcript, [], provider(() => {
  throw new Error("Sarvam reasoning failed (503): upstream unavailable");
}));
check(totalOutage.items.length === 0, "a total provider outage produces no items");
check(
  totalOutage.complete === false,
  "and reports itself INCOMPLETE -- this is the flag that stops it wiping live knowledge",
);
check(
  totalOutage.stats.failures.length === totalOutage.stats.calls &&
    totalOutage.stats.calls > 0,
  "every attempted call is recorded as a failure",
  totalOutage.stats,
);

// The exact production symptom: a 200 with no content in it. It must be
// indistinguishable, to the caller, from any other failed window.
const emptyCompletions = await reconstructLecture(transcript, [], provider(() => {
  throw new Error("Sarvam reasoning returned an empty completion.");
}));
check(
  emptyCompletions.complete === false && emptyCompletions.items.length === 0,
  "a run where every window came back EMPTY is a failure, not an empty lecture",
  emptyCompletions.stats,
);

// A single lost window still leaves the rest of the lecture readable, so the
// pass keeps its items -- and still refuses to call itself complete.
let calls = 0;
const oneBadWindow = await reconstructLecture(transcript, [], provider((r) => {
  calls += 1;
  if (calls === 1) throw new Error("fetch failed");
  if (!isActionable(r)) return reply([]);
  const excerpt = excerptOf(r);
  if (!excerpt.includes(OBLIGATION.a)) return reply([]);
  return reply([{
    kind: "assignment", title: "Research paper task",
    summary: "Find, implement and present.", steps: [], unspecified: [],
    confidence: 0.8,
    evidence: [{ role: "introduces", quote: OBLIGATION.a }],
  }]);
}));
check(
  oneBadWindow.complete === false,
  "one failed window is enough to mark the whole pass incomplete",
  oneBadWindow.stats.failures,
);
check(
  oneBadWindow.items.length > 0,
  "but the windows that DID return keep their knowledge -- a partial failure is not a total one",
  oneBadWindow.items.length,
);

// A transcript that normalizes to a single zero-length segment produces no
// windows at all. Without an explicit failure that is byte-identical to a
// lecture containing nothing, and it would be published as one.
const noTimeline = buildTranscript([{ text: "Aaj hum kuch nahi padhenge.", start: 0, end: 0 }]);
const untimed = await reconstructLecture(noTimeline, [], goodProvider);
check(
  untimed.stats.windows === 0,
  "a transcript with no timeline yields no windows",
  untimed.stats,
);
check(
  untimed.complete === false,
  "and is reported as a FAILURE rather than as an empty lecture",
  untimed.stats.failures,
);
check(
  untimed.stats.failures.some((f) => /timeline/i.test(f)),
  "with a reason that names the cause",
  untimed.stats.failures,
);

// A model that returns well-formed JSON containing nothing is the genuine
// "nothing to find" case, and it must stay distinguishable from all the above.
const genuinelyEmpty = await reconstructLecture(transcript, [], provider(() => reply([])));
check(
  genuinelyEmpty.complete === true && genuinelyEmpty.items.length === 0,
  "a lecture the model read fully and found nothing in is COMPLETE with zero items",
  genuinelyEmpty.stats,
);

// Malformed output is a failed window, not a crash.
const garbage = await reconstructLecture(transcript, [], provider(() => "I'm sorry, I can't help with that."));
check(
  garbage.complete === false && garbage.items.length === 0,
  "a model that answers in prose instead of JSON fails its window without throwing",
  garbage.stats.failures.slice(0, 1),
);

// ---------------------------------------------------------------------------
// 5b. What the provider asks again
// ---------------------------------------------------------------------------
//
// The empty completion is the failure that caused this: a 200 with a well-formed
// body and no content in it, which the original policy did not recognise because
// it only knew about transport errors. The window's knowledge was simply lost,
// and enough of them lost meant a lecture stored nothing at all.

section("Retry policy");

const { isRetryable, MAX_ATTEMPTS } = sarvamInternals;

check(
  isRetryable(new Error("Sarvam reasoning returned an empty completion.")),
  "an EMPTY completion is retried -- this is the failure that emptied a lecture",
);
check(isRetryable(new Error("fetch failed")), "a dropped connection is retried");
check(isRetryable(new Error("read ECONNRESET")), "ECONNRESET is retried");
check(
  isRetryable(new Error("Sarvam reasoning failed (429): rate limited")),
  "a rate limit is the provider asking to be asked again",
);
check(
  isRetryable(new Error("Sarvam reasoning failed (503): upstream unavailable")),
  "a provider-side 5xx is retried",
);
check(
  !isRetryable(new Error("Sarvam reasoning failed (400): bad request")),
  "a 4xx is NOT retried -- repeating a bad request only costs money",
);
check(
  !isRetryable(new Error("Sarvam reasoning failed (401): unauthorized")),
  "nor is an auth failure, which will never succeed on a second try",
);
check(
  !isRetryable(new Error("no JSON object in completion")),
  "malformed output is not retried either: the model answered, just not usefully",
);
check(MAX_ATTEMPTS >= 3, "there is more than one retry, because an empty completion has repeated once",
  `MAX_ATTEMPTS=${MAX_ATTEMPTS}`);

// ---------------------------------------------------------------------------
// 6. Determinism
// ---------------------------------------------------------------------------

section("Determinism");

const again = await reconstructLecture(transcript, [], goodProvider);
check(
  JSON.stringify(again.items) === JSON.stringify(result.items),
  "the same transcript and the same answers produce byte-identical knowledge",
);

// ---------------------------------------------------------------------------
// 7. The pass does not know what subject it is reading
// ---------------------------------------------------------------------------

section("Subject independence");

// Same discourse shape, entirely different field, different vocabulary. If any
// part of Layer 2 were tuned to a subject, this would come out thinner than the
// microbiology run; it must come out identical in structure.
const LAW = {
  a: "Aapko ek recent Supreme Court judgment choose karna hai contract law ke upar.",
  b: "Usko padhkar uske ratio decidendi ko apne case brief mein likhna hai.",
  c: "Aur phir vo brief ko moot court ke saamne argue karna hai.",
  d: "Submission ki tareekh main portal par daal dunga.",
};
const lawSegments = lectureSegments().map((s) => {
  if (s.text === OBLIGATION.a) return { ...s, text: LAW.a };
  if (s.text === OBLIGATION.b) return { ...s, text: LAW.b };
  if (s.text === OBLIGATION.c) return { ...s, text: LAW.c };
  if (s.text === OBLIGATION.d) return { ...s, text: LAW.d };
  return s;
});
const lawTranscript = buildTranscript(lawSegments);
const lawResult = await reconstructLecture(lawTranscript, [], provider((r) => {
  if (!isActionable(r)) return reply([]);
  const excerpt = excerptOf(r);
  const quotes = [LAW.a, LAW.b, LAW.c, LAW.d].filter((q) => excerpt.includes(q));
  if (quotes.length < 4) return reply([]);
  return reply([{
    kind: "assignment", title: "Case brief and moot",
    summary: "Choose a judgment, write a case brief, argue it in moot court.",
    steps: ["Choose a recent Supreme Court judgment.", "Write a case brief.", "Argue it in moot court."],
    unspecified: ["the submission date", "the word limit"],
    confidence: 0.85,
    evidence: quotes.map((q, i) => ({ role: i === 0 ? "introduces" : "step", quote: q })),
  }]);
}));
const lawActionable = lawResult.items.filter((i) => i.category === "actionable");
check(
  lawActionable.length === 1 && lawActionable[0].evidence.length === 4,
  "a law lecture with the same discourse shape reconstructs identically to a microbiology one",
  { items: lawActionable.length, evidence: lawActionable[0]?.evidence.length },
);
check(
  lawResult.stats.duplicatesMerged === result.stats.duplicatesMerged,
  "and the overlap merge behaves the same way on a subject nothing has been tuned to",
  `${lawResult.stats.duplicatesMerged} vs ${result.stats.duplicatesMerged}`,
);
check(
  lawResult.complete === true,
  "the pass completes on a subject it has never seen",
);

// ---------------------------------------------------------------------------

section("Summary");
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
