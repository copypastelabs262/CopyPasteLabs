// Evidence-span identity: when are two reconstructed items the SAME item?
//
// Identity is decided by WHERE the evidence sits, not by what the item is
// called. A model words a title differently in each window, but the sentences
// it cites are the same sentences, and those have already been verified into
// real character positions -- so the transcript itself, rather than a string
// similarity heuristic, is what decides that two items are one.
//
// This lives in its own module because the SAME question is asked twice, at two
// different moments, and the two answers must not be allowed to drift:
//
//   within one run   -- two overlapping windows reconstructed one obligation
//                       twice, and the review queue must show it once.
//   across runs      -- a re-processed lecture re-proposes an obligation a
//                       human has already confirmed or rejected, and that
//                       verdict must not be silently re-opened.
//
// Pure. No imports, no clock, no I/O, so it runs directly under node.

// Fraction of the SHORTER span that the two share. Measured against the shorter
// one on purpose: an obligation caught whole in one window and only partly in
// the next should still merge, and scoring that pair against the longer span
// would put it under any sensible threshold.
export const DUPLICATE_OVERLAP = 0.5;

export interface Span {
  from: number;
  to: number;
}

// An item with no located evidence has no span. Represented as an empty
// interval rather than as null so callers cannot forget the case: an empty
// interval overlaps nothing, which is the safe answer -- an item whose position
// is unknown is never assumed to be a duplicate of something else.
export const EMPTY_SPAN: Span = { from: Number.POSITIVE_INFINITY, to: Number.NEGATIVE_INFINITY };

export function spanOf(
  evidence: readonly { charStart: number | null; charEnd: number | null }[],
): Span {
  let from = Number.POSITIVE_INFINITY;
  let to = Number.NEGATIVE_INFINITY;
  for (const e of evidence) {
    if (e.charStart !== null && e.charStart < from) from = e.charStart;
    if (e.charEnd !== null && e.charEnd > to) to = e.charEnd;
  }
  return { from, to };
}

export function overlapRatio(a: Span, b: Span): number {
  const lo = Math.max(a.from, b.from);
  const hi = Math.min(a.to, b.to);
  if (hi <= lo) return 0;
  const shorter = Math.min(a.to - a.from, b.to - b.from);
  return shorter > 0 ? (hi - lo) / shorter : 0;
}

// The one predicate. Both callers ask exactly this question, so both get
// exactly this answer.
export function sameSpan(a: Span, b: Span): boolean {
  return overlapRatio(a, b) >= DUPLICATE_OVERLAP;
}
