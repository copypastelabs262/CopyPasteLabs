// Self-test for Previous/Next lecture navigation. Run with:
//
//   node scripts/test-lecture-nav.mts
//
// FREE and offline: lectureNeighbours is a pure function of the list the shell
// already holds, so multi/first/last/single/absent/not-found are all pinned
// without a browser or a database. The live app self-hides the pager whenever
// this returns {prev:null,next:null}, which is exactly the "≤1 visible lecture"
// case a student hits under the current seed.

import { lectureNeighbours } from "../src/lib/lecture-nav.ts";

let passed = 0;
let failed = 0;
function check(ok: boolean, label: string, detail?: unknown): void {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${label}${detail !== undefined ? "  -> " + JSON.stringify(detail) : ""}`);
  }
}

// The shell hands the list NEWEST-FIRST (created_at desc). Chronological order
// (how the course was taught) is therefore c, b, a.
const NEWEST_FIRST = [
  { id: "a", title: "Lecture A (newest)" },
  { id: "b", title: "Lecture B" },
  { id: "c", title: "Lecture C (oldest)" },
];

// --- A lecture in the middle sees both neighbours, chronologically ----------
{
  const { prev, next } = lectureNeighbours(NEWEST_FIRST, "b");
  check(prev?.id === "c", "middle: previous is the chronologically-earlier lecture (c)", prev?.id);
  check(next?.id === "a", "middle: next is the chronologically-later lecture (a)", next?.id);
}

// --- The oldest (chronologically first) has no previous ----------------------
{
  const { prev, next } = lectureNeighbours(NEWEST_FIRST, "c");
  check(prev === null, "first lecture: no previous", prev);
  check(next?.id === "b", "first lecture: next is b", next?.id);
}

// --- The newest (chronologically last) has no next ---------------------------
{
  const { prev, next } = lectureNeighbours(NEWEST_FIRST, "a");
  check(prev?.id === "b", "last lecture: previous is b", prev?.id);
  check(next === null, "last lecture: no next", next);
}

// --- A single-lecture course hides entirely (both null) ----------------------
{
  const { prev, next } = lectureNeighbours([{ id: "solo", title: "Only one" }], "solo");
  check(prev === null && next === null, "single lecture: pager self-hides (both null)");
}

// --- An empty list hides entirely -------------------------------------------
{
  const { prev, next } = lectureNeighbours([], "whatever");
  check(prev === null && next === null, "empty course: pager self-hides");
}

// --- A current id not in the list hides (never guesses a neighbour) ----------
{
  const { prev, next } = lectureNeighbours(NEWEST_FIRST, "not-here");
  check(prev === null && next === null, "unknown current lecture: no neighbours invented");
}

// --- Two lectures: each end points only at the other -------------------------
{
  const two = [
    { id: "later", title: "Later" },
    { id: "earlier", title: "Earlier" },
  ];
  const a = lectureNeighbours(two, "earlier");
  check(a.prev === null && a.next?.id === "later", "two-lecture first: next only", a);
  const b = lectureNeighbours(two, "later");
  check(b.prev?.id === "earlier" && b.next === null, "two-lecture last: previous only", b);
}

// --- Purity: the input array is not mutated by the reverse -------------------
{
  const input = [{ id: "x" }, { id: "y" }];
  lectureNeighbours(input, "x");
  check(input[0].id === "x" && input[1].id === "y", "input list is not mutated");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
