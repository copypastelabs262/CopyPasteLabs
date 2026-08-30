// Self-test for the knowledge write plan and the readiness rule. Run with:
//
//   node --conditions=react-server scripts/test-knowledge-plan.mts
//
// No test framework, for the same reason as scripts/test-extraction.mts: this
// module is pure logic with zero dependencies, Node runs TypeScript directly,
// and a runner that needs installing is a runner that stops being run.
//
// `--conditions=react-server` is what makes `server-only` resolve to a no-op.
// plan.ts does not import it and neither does this file, but every self-test in
// this repo is invoked the same way so that nobody has to remember which of
// them are special.
//
// Imports are relative with explicit extensions because plain `node` does not
// read tsconfig `paths`.
//
// Two decisions are pinned here, and both exist because their inlined
// predecessors were wrong in production. The first is that an incomplete
// reasoning pass may never overwrite knowledge it did not see: a provider
// outage mid-run once emptied a live lecture and reported success. The second
// is that a lecture holding no knowledge is never publishable, whatever the
// pass claims about itself.

import {
  decideReadiness,
  planKnowledgeWrite,
  type ExistingItem,
  type KnowledgeStatus,
  type Readiness,
} from "../src/lib/knowledge/plan.ts";
import type { ReconstructedItem } from "../src/lib/reasoning/reconstruct.ts";

let passed = 0;
let failed = 0;

function check(ok: boolean, label: string, detail?: string): void {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${label}${detail ? `\n        ${detail}` : ""}`);
  }
}

function section(title: string): void {
  console.log(`\n--- ${title} ---`);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
//
// The only field of a ReconstructedItem that decides anything here is where its
// evidence sits in the transcript. Everything else is filled with the same
// plausible values on every item on purpose: if identity ever starts leaning on
// the title or the summary instead of the span, these fixtures stop
// distinguishing anything and the suite goes red.

function item(charStart: number, charEnd: number, title: string): ReconstructedItem {
  return {
    category: "actionable",
    kind: "assignment",
    title,
    summary: "One obligation, reconstructed from one window of the lecture.",
    steps: [],
    unspecified: [],
    confidence: 0.8,
    evidence: [
      {
        role: "requirement",
        quote: "aapko ye submit karna hai",
        startMs: charStart * 10,
        endMs: charEnd * 10,
        charStart,
        charEnd,
      },
    ],
  };
}

// No evidence at all. Layer 2 drops items whose quotes cannot be located, so
// this shape reaches a write only through a caller that does not, but the
// planner is the last thing standing between it and the table.
function itemWithNoEvidence(title: string): ReconstructedItem {
  return { ...item(0, 0, title), evidence: [] };
}

// Evidence that exists but was never resolved to character offsets. Same span
// as the case above, arrived at down a different road.
function itemWithUnlocatedEvidence(title: string): ReconstructedItem {
  const base = item(0, 0, title);
  return {
    ...base,
    evidence: [{ ...base.evidence[0], charStart: null, charEnd: null }],
  };
}

function existing(id: string, status: KnowledgeStatus, from: number, to: number): ExistingItem {
  return { id, status, span: { from, to } };
}

function titles(items: readonly ReconstructedItem[]): string[] {
  return items.map((i) => i.title);
}

function describe(r: Readiness): string {
  return `ready=${r.ready} code=${r.code} reason=${JSON.stringify(r.reason)}`;
}

// ---------------------------------------------------------------------------
// 1. Seeding a lecture that holds nothing
// ---------------------------------------------------------------------------

section("Seeding an empty lecture");

const firstRun = [
  item(0, 100, "read chapter four"),
  item(200, 300, "lab report due Friday"),
  item(400, 500, "quiz on Tuesday"),
];
const seeded = planKnowledgeWrite([], firstRun, true);

check(seeded.outcome === "seeded", "a first complete pass over an empty lecture seeds it", seeded.outcome);
check(seeded.deleteIds.length === 0, "nothing is deleted, because nothing was there", seeded.deleteIds.join(","));
check(
  titles(seeded.insert).join("|") === titles(firstRun).join("|"),
  "every item is inserted, in the order the lecture produced them",
  titles(seeded.insert).join("|"),
);
check(seeded.insert[0] === firstRun[0], "items are passed through by reference, not rebuilt");
check(seeded.skippedAlreadyJudged === 0 && seeded.keptCount === 0, "nothing was skipped and nothing was kept");

// ---------------------------------------------------------------------------
// 2. Replacing a populated lecture on a complete pass
// ---------------------------------------------------------------------------
//
// A complete pass is authoritative, so it supersedes the machine's previous
// answer. It does not supersede a human's: a re-run that deleted confirmed and
// rejected rows would throw away the only work in the table nobody can redo.

section("Replacing on a complete pass");

const POPULATED: ExistingItem[] = [
  existing("row-auto", "auto", 0, 100),
  existing("row-pending", "pending", 200, 300),
  existing("row-confirmed", "confirmed", 400, 500),
  existing("row-rejected", "rejected", 600, 700),
];
const secondRun = [item(1000, 1100, "revised reading"), item(1200, 1300, "new tutorial sheet")];
const replaced = planKnowledgeWrite(POPULATED, secondRun, true);

check(replaced.outcome === "replaced", "a complete pass over a populated lecture replaces it", replaced.outcome);
check(
  [...replaced.deleteIds].sort().join(",") === "row-auto,row-pending",
  "the machine-derived rows are the ones superseded",
  replaced.deleteIds.join(","),
);
check(
  !replaced.deleteIds.includes("row-confirmed") && !replaced.deleteIds.includes("row-rejected"),
  "a row a human ruled on is never deleted by a machine re-run",
  replaced.deleteIds.join(","),
);
check(replaced.keptCount === 2, "keptCount counts exactly the surviving verdicts", String(replaced.keptCount));
check(replaced.insert.length === 2 && replaced.skippedAlreadyJudged === 0, "both new items land, none collides with a verdict");

// The destructive-looking half of the same rule, and the reason `complete`
// carries so much weight: when the pass really did read the whole lecture and
// found nothing, the previous machine answer is still wrong and still goes.
const emptiedByCompletePass = planKnowledgeWrite(POPULATED, [], true);
check(
  emptiedByCompletePass.outcome === "replaced" &&
    emptiedByCompletePass.deleteIds.length === 2 &&
    emptiedByCompletePass.insert.length === 0,
  "a complete pass that found nothing still clears the stale machine rows",
  `${emptiedByCompletePass.outcome} delete=${emptiedByCompletePass.deleteIds.join(",")}`,
);
check(
  emptiedByCompletePass.keptCount === 2,
  "even then the two verdicts survive",
  String(emptiedByCompletePass.keptCount),
);

// ---------------------------------------------------------------------------
// 3. THE REGRESSION: an incomplete pass may never empty a populated lecture
// ---------------------------------------------------------------------------
//
// This is the failure that put this module in its own file. A reasoning
// provider went down partway through a re-run; the pass returned the handful of
// items from the windows that had succeeded, the write treated that as the new
// truth, and a lecture that had been complete for weeks came out holding three
// items and a green tick. Nothing in the response said anything was wrong.
//
// The plan for that run must delete nothing and insert nothing. Not "delete
// less" -- nothing. A partial observation has no standing to change a lecture
// it did not finish reading.

section("REGRESSION: an incomplete pass over a populated lecture preserves it");

const salvage = [item(1000, 1100, "the three items the surviving windows returned")];
const preserved = planKnowledgeWrite(POPULATED, salvage, false);

check(preserved.outcome === "preserved", "the outcome is `preserved`, not `replaced`", preserved.outcome);
check(
  preserved.deleteIds.length === 0,
  "REGRESSION GUARD: an incomplete pass deletes NOTHING",
  `would have deleted ${preserved.deleteIds.join(",") || "(nothing)"}`,
);
check(
  preserved.insert.length === 0,
  "REGRESSION GUARD: an incomplete pass inserts NOTHING",
  `would have inserted ${titles(preserved.insert).join(",") || "(nothing)"}`,
);
check(
  preserved.keptCount === POPULATED.length,
  "every existing row is kept, judged or not",
  String(preserved.keptCount),
);
check(preserved.skippedAlreadyJudged === 0, "nothing is reported as skipped, because nothing was considered");

// The lecture does not need a human verdict in it to be worth protecting. A
// lecture holding only machine rows is still a lecture a student is reading.
const machineOnly = planKnowledgeWrite([existing("row-auto", "auto", 0, 100)], salvage, false);
check(
  machineOnly.outcome === "preserved" && machineOnly.deleteIds.length === 0 && machineOnly.keptCount === 1,
  "a lecture holding only machine rows is protected too",
  `${machineOnly.outcome} delete=${machineOnly.deleteIds.length} kept=${machineOnly.keptCount}`,
);

// ---------------------------------------------------------------------------
// 4. An incomplete pass may still seed an empty lecture
// ---------------------------------------------------------------------------
//
// The rule protects existing knowledge, not the write itself. With nothing in
// the lecture there is nothing to destroy, and partial knowledge beats none.

section("Seeding an empty lecture from an incomplete pass");

const partiallySeeded = planKnowledgeWrite([], firstRun, false);

check(partiallySeeded.outcome === "seeded", "an incomplete pass over an empty lecture still seeds", partiallySeeded.outcome);
check(
  partiallySeeded.insert.length === firstRun.length,
  "whatever the pass managed to read is stored",
  String(partiallySeeded.insert.length),
);
check(
  partiallySeeded.deleteIds.length === 0 && partiallySeeded.keptCount === 0,
  "with nothing in the lecture there is nothing to delete and nothing to keep",
);

// ---------------------------------------------------------------------------
// 5. A human verdict is never re-opened
// ---------------------------------------------------------------------------
//
// Identity is the evidence span, not the wording -- the model titles the same
// obligation differently in every window. The previous version kept the judged
// rows and then re-inserted the same obligations as fresh proposals, so every
// re-run grew a duplicate twin of every confirmed assignment and quietly undid
// every rejection.

section("Judged obligations are not re-proposed");

const JUDGED_LECTURE: ExistingItem[] = [
  existing("row-confirmed-lab", "confirmed", 100, 200),
  existing("row-rejected-quiz", "rejected", 400, 500),
  existing("row-auto-topic", "auto", 800, 900),
];
const reproposed = [
  // 60% of the shorter span: the same lab, caught slightly differently.
  item(140, 250, "same lab, different words"),
  // 80%: a rejection a re-run must not silently re-open.
  item(420, 540, "same quiz, different words"),
  // Overlaps a machine row, which is being deleted anyway, so this is the
  // replacement for it and must land.
  item(820, 910, "same topic as a machine row"),
  // 40% of the shorter span -- under DUPLICATE_OVERLAP, so a different item
  // that happens to sit near the confirmed one. Pins which side of the
  // threshold is which.
  item(160, 260, "near miss on the confirmed lab"),
  item(2000, 2100, "nothing like anything already here"),
];
const rejudged = planKnowledgeWrite(JUDGED_LECTURE, reproposed, true);
const inserted = titles(rejudged.insert);

check(
  !inserted.includes("same lab, different words"),
  "a confirmed obligation is not re-proposed as a fresh duplicate",
  inserted.join("|"),
);
check(
  !inserted.includes("same quiz, different words"),
  "a rejected obligation is not silently re-opened",
  inserted.join("|"),
);
check(
  rejudged.skippedAlreadyJudged === 2,
  "both collisions are counted, so the run can report what it withheld",
  String(rejudged.skippedAlreadyJudged),
);
check(
  inserted.includes("same topic as a machine row"),
  "an item colliding with a MACHINE row is inserted -- that row is being deleted",
  inserted.join("|"),
);
check(
  inserted.includes("near miss on the confirmed lab"),
  "40% overlap is below the duplicate threshold, so it is a different item",
  inserted.join("|"),
);
check(inserted.includes("nothing like anything already here"), "an item overlapping nothing is inserted");
check(rejudged.insert.length === 3, "three of five items survive", String(rejudged.insert.length));
check(
  rejudged.deleteIds.join(",") === "row-auto-topic",
  "only the machine row is superseded",
  rejudged.deleteIds.join(","),
);
check(rejudged.keptCount === 2, "keptCount is the two verdicts", String(rejudged.keptCount));

// ---------------------------------------------------------------------------
// 6. An item with no located evidence is a duplicate of nothing
// ---------------------------------------------------------------------------
//
// An unlocated item has an empty span, which overlaps nothing -- including the
// span of an item that covers the entire transcript. The alternative, treating
// unknown position as "might be anything", would let one confirmed row suppress
// every unlocated item in the lecture.

section("Unlocated evidence never counts as a duplicate");

const COVERS_EVERYTHING: ExistingItem[] = [existing("row-confirmed-all", "confirmed", 0, 10_000)];
const unlocated = planKnowledgeWrite(
  COVERS_EVERYTHING,
  [itemWithNoEvidence("no evidence at all"), itemWithUnlocatedEvidence("evidence with no offsets")],
  true,
);

check(
  unlocated.insert.length === 2,
  "neither unlocated item is folded into the row spanning the whole transcript",
  titles(unlocated.insert).join("|"),
);
check(unlocated.skippedAlreadyJudged === 0, "so nothing is reported as already judged", String(unlocated.skippedAlreadyJudged));
check(
  unlocated.outcome === "replaced" && unlocated.deleteIds.length === 0 && unlocated.keptCount === 1,
  "a lecture holding only a verdict is `replaced` with nothing to delete and one row kept",
  `${unlocated.outcome} delete=${unlocated.deleteIds.length} kept=${unlocated.keptCount}`,
);

// ---------------------------------------------------------------------------
// 7. A lecture with knowledge is publishable
// ---------------------------------------------------------------------------

section("Readiness: knowledge outranks every diagnosis");

const full = decideReadiness({ reasoningAvailable: true, complete: true, windows: 30, knowledgeTotal: 12 });
check(
  full.ready && full.code === "ok" && full.reason === null,
  "a complete pass with knowledge in it is ready",
  describe(full),
);

// Withholding twenty-seven good windows because three failed turns a partial
// failure into a total one.
const partial = decideReadiness({ reasoningAvailable: true, complete: false, windows: 30, knowledgeTotal: 4 });
check(
  partial.ready && partial.code === "ok" && partial.reason === null,
  "partial knowledge from an incomplete pass is still publishable",
  describe(partial),
);

// knowledgeTotal counts rows kept from earlier runs, so a lecture can hold
// knowledge on a run where nothing at all could be read.
const carriedOver = decideReadiness({
  reasoningAvailable: false,
  complete: false,
  windows: 0,
  knowledgeTotal: 3,
});
check(
  carriedOver.ready && carriedOver.code === "ok" && carriedOver.reason === null,
  "knowledge kept from an earlier run stays publishable when this run read nothing",
  describe(carriedOver),
);

// ---------------------------------------------------------------------------
// 8. THE HEADLINE INVARIANT: zero knowledge is never publishable
// ---------------------------------------------------------------------------
//
// Swept exhaustively rather than sampled, because the failure this guards
// against is a lecture labelled ready and searchable that opens empty for a
// student, and the only honest way to state "no combination of flags grants
// that" is to try every combination. Windows are all above zero here: the
// point is that a pass which ran, and even succeeded, still may not publish an
// empty result.

section("REGRESSION: no combination of flags publishes an empty lecture");

const violations: string[] = [];
let combinations = 0;
for (const reasoningAvailable of [true, false]) {
  for (const complete of [true, false]) {
    for (const windows of [1, 4, 30]) {
      const r = decideReadiness({ reasoningAvailable, complete, windows, knowledgeTotal: 0 });
      combinations += 1;
      if (r.ready) {
        violations.push(`reasoning=${reasoningAvailable} complete=${complete} windows=${windows} -> ${describe(r)}`);
      }
    }
  }
}
check(
  violations.length === 0 && combinations === 12,
  `zero knowledge yields ready=false across all ${combinations} flag combinations`,
  violations.join("\n        ") || `only ${combinations} combinations ran`,
);

// ---------------------------------------------------------------------------
// 9. Why there is no knowledge
// ---------------------------------------------------------------------------
//
// The code is what a teacher's screen and the on-call engineer both read. Four
// causes, and confusing any two of them sends someone to the wrong place: a
// missing model is a configuration problem, a broken transcript is a recording
// problem, a partial failure is worth retrying, and a genuinely empty lecture is
// worth nobody's time at all.

section("Readiness: the four zero-knowledge diagnoses");

const noModel = decideReadiness({
  reasoningAvailable: false,
  complete: true,
  windows: 30,
  knowledgeTotal: 0,
});
check(noModel.code === "reasoning_unavailable", "no reasoning model configured", describe(noModel));

// Precedence, and it is deliberate: with no model configured nothing was read
// for any reason, and blaming the transcript would send someone to fix a
// recording that is fine.
const noModelNoWindows = decideReadiness({
  reasoningAvailable: false,
  complete: false,
  windows: 0,
  knowledgeTotal: 0,
});
check(
  noModelNoWindows.code === "reasoning_unavailable",
  "a missing model is diagnosed before a missing transcript",
  describe(noModelNoWindows),
);

const noWindows = decideReadiness({
  reasoningAvailable: true,
  complete: true,
  windows: 0,
  knowledgeTotal: 0,
});
check(noWindows.code === "nothing_to_read", "no windows means nothing was read", describe(noWindows));

// The real production shape. reconstruct.ts pushes a failure when the
// transcript carries no timeline, so a lecture that cannot be windowed arrives
// here as complete=false AND windows=0. It must be diagnosed as a broken
// transcript, not as a pass that half-ran -- "run extraction again" would loop
// forever on a recording that will never window.
const brokenTimeline = decideReadiness({
  reasoningAvailable: true,
  complete: false,
  windows: 0,
  knowledgeTotal: 0,
});
check(
  brokenTimeline.code === "nothing_to_read",
  "a transcript that could not be windowed is not reported as an incomplete pass",
  describe(brokenTimeline),
);

const incompletePass = decideReadiness({
  reasoningAvailable: true,
  complete: false,
  windows: 12,
  knowledgeTotal: 0,
});
check(
  incompletePass.code === "reconstruction_incomplete",
  "windows were read, some failed, nothing was stored",
  describe(incompletePass),
);

const genuinelyEmpty = decideReadiness({
  reasoningAvailable: true,
  complete: true,
  windows: 12,
  knowledgeTotal: 0,
});
check(
  genuinelyEmpty.code === "no_knowledge_found",
  "the whole lecture was read and there was genuinely nothing in it",
  describe(genuinelyEmpty),
);

// ---------------------------------------------------------------------------
// 10. Every not-ready result explains itself
// ---------------------------------------------------------------------------
//
// The reason is stored on the lecture and shown to the faculty member who
// uploaded it. A blank one turns a diagnosis back into the silent failure this
// module exists to end.

section("Readiness: reasons");

const diagnoses = [noModel, noModelNoWindows, noWindows, brokenTimeline, incompletePass, genuinelyEmpty];

check(
  diagnoses.every((d) => !d.ready),
  "every zero-knowledge diagnosis is not ready",
  diagnoses.filter((d) => d.ready).map(describe).join("\n        "),
);
check(
  diagnoses.every((d) => typeof d.reason === "string" && d.reason.trim().length > 0),
  "every not-ready result carries a reason a teacher can read",
  diagnoses.filter((d) => !d.reason?.trim()).map(describe).join("\n        "),
);
check(
  new Set(diagnoses.map((d) => d.code)).size === 4,
  "the diagnoses resolve to exactly four distinct codes",
  [...new Set(diagnoses.map((d) => d.code))].join(","),
);
check(
  [full, partial, carriedOver].every((r) => r.reason === null),
  "a ready result carries no reason, so nothing stale is shown next to a green lecture",
  [full, partial, carriedOver].filter((r) => r.reason !== null).map(describe).join("\n        "),
);

// ---------------------------------------------------------------------------

section("Summary");
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
