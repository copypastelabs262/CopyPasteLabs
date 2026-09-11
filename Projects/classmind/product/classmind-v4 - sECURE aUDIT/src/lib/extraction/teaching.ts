// Extracting what was TAUGHT, as opposed to what was ASSIGNED.
//
// The cue-matching method in ./rules.ts reads a lecture the way a notice board
// is read: it looks for obligations, deadlines and announcements. On a real
// 23-minute college lecture on cloud computing it found exactly one item -- a
// correct one, the deployment assignment in the last minute -- and nothing at
// all from the twenty-two minutes of teaching that preceded it. That is not a
// tuning failure. Every kind in CandidateKind before today (assignment,
// deadline, exam_scope, announcement, guidance) is a category of *action*, so
// there was no representation in which "the lecturer explained what a unified
// manager is" could be stored even if something had detected it.
//
// This module adds that representation. What it does NOT do is add subject
// keywords: a lexicon of cloud-computing terms would score well on this lecture
// and zero on a chemistry one. It matches DISCOURSE STRUCTURE instead -- the
// handful of sentence shapes a lecturer uses to signal "I am now defining
// something", "there are N kinds of this", "we are moving to a new topic".
// Those shapes are the same in a cloud lecture and a thermodynamics lecture,
// and in this transcript they occur more than thirty times.
//
// Each structure carries a capture group for the SUBJECT being taught, so the
// output names the concept rather than quoting the whole sentence. Evidence,
// timestamps and verbatim text are preserved exactly as ./rules.ts does.

import type {
  CandidateKind,
  ExtractionCandidate,
  TranscriptSegmentInput,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Subject cleaning
// ---------------------------------------------------------------------------

// Discourse markers and fillers that ride along on a captured subject. Trimmed
// from both ends only -- never from the middle, which would silently rewrite
// what the lecturer said.
const EDGE_NOISE =
  /^(?:a|an|the|is|are|was|were|this|that|these|those|your|our|so|and|of|to|about|ki|ka|ke|ki|vo|ye|yeh|hai|hain|toh|tho|na)\b[\s,]*/i;
const TRAILING_NOISE =
  /[\s,]*\b(?:okay|ok|theek hai|thik hai|right|clear|hai|hain|toh|na|bas|please|samajh mein aaya|samjhe)\b[\s,.?!]*$/i;

// Interrogative scaffolding. A lecturer says "what are the different types of
// key resource management technique"; the concept is the tail, and the question
// framing is how they got to it. Stripped so the stored topic reads as a topic.
const QUESTION_PREFIX =
  /^(?:so\s+|now\s+|then\s+)*(?:what|which|how|why|kya|kaise|kaun\s*se?)\s+(?:is|are|hai|hain)?\s*(?:the\s+)?(?:different\s+)?(?:types?|kinds?|categories|category)?\s*(?:of\s+)?/i;

// Words that cannot be the head of a concept. A subject made only of these is
// scaffolding that survived cleaning -- "thing which is given over here",
// "samajh mein aaya aapko". Rejecting on the absence of a content word is more
// robust than trying to enumerate every vacuous phrase.
const FUNCTION_WORDS = new Set([
  "this", "that", "these", "those", "thing", "things", "here", "there", "over",
  "which", "what", "who", "whom", "given", "same", "such", "one", "some", "all",
  "it", "its", "they", "them", "we", "you", "your", "our", "and", "or", "but",
  "is", "are", "was", "were", "be", "been", "have", "has", "had", "do", "does",
  "in", "on", "at", "of", "to", "for", "with", "from", "by", "as", "very",
  "aaya", "aapko", "aap", "hum", "humne", "hai", "hain", "toh", "vo", "ye",
  "yeh", "ki", "ka", "ke", "mein", "mai", "bhi", "kya", "abhi", "ab", "jo",
  "samajh", "dekha", "okay", "ok", "theek", "thik", "bas", "phir", "uske",
]);

function hasContentWord(words: string[]): boolean {
  return words.some((w) => {
    const t = w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    return t.length >= 4 && !FUNCTION_WORDS.has(t);
  });
}

function cleanSubject(raw: string, maxWords: number): string | null {
  let s = raw.replace(/\s+/g, " ").trim();
  // Cut at the first hard clause boundary: a subject that runs past a full stop
  // is a sentence, not a concept name.
  s = s.split(/[.?!;]/)[0] ?? s;
  s = s.replace(QUESTION_PREFIX, "").trim();
  for (let i = 0; i < 3; i += 1) {
    const before = s;
    s = s.replace(EDGE_NOISE, "").replace(TRAILING_NOISE, "").trim();
    if (s === before) break;
  }
  // A definition's subject is the term, not the relative clause explaining it.
  // "virtual storage provision jismein hum ... karke dete hain" is one concept
  // followed by its own explanation; the explanation is already kept verbatim
  // as evidence, so the title should stop at the term.
  s = s.split(/\s+(?:jismein|jisme|jahan|jiska|jiske|which|where|wherein|that is|jo ki)\s+/i)[0] ?? s;
  s = s.replace(/[\s,:-]+$/, "").trim();
  // A subject that trails off into a conjunction or a question word was cut
  // mid-clause by a lazy capture: "software and what" -> "software". Looped,
  // because stripping one can expose another.
  for (let i = 0; i < 3; i += 1) {
    const before = s;
    s = s.replace(/[\s,]+(?:and|or|aur|ya|what|which|kya|jo|is|are|hai|hain)$/i, "").trim();
    if (s === before) break;
  }
  if (s.length < 3 || s.length > 200) return null;
  if (!/[\p{L}]/u.test(s)) return null;
  const words = s.split(/\s+/);
  if (words.length > maxWords) return null;
  if (!hasContentWord(words)) return null;
  return s;
}

// For patterns whose capture sits BEFORE the marker -- "<subject> it basically
// includes ..." -- an unanchored lazy group still starts at the beginning of
// the sentence, so it drags the whole preamble along. The head of an English or
// Hinglish noun phrase is at its end, so keep the tail.
function tailPhrase(raw: string, words = 6): string {
  const parts = raw.replace(/\s+/g, " ").trim().split(" ");
  return parts.slice(Math.max(0, parts.length - words)).join(" ");
}

function toTitle(subject: string): string {
  // Acronyms keep their case; everything else gets a leading capital only, so
  // "control layer" reads as a heading without mangling "SSD" into "Ssd".
  return subject.charAt(0).toUpperCase() + subject.slice(1);
}

// ---------------------------------------------------------------------------
// Discourse structures
// ---------------------------------------------------------------------------

interface Structure {
  readonly id: string;
  readonly kind: CandidateKind;
  readonly label: string;
  readonly base: number;
  // A lesson-scope sentence IS a list of topics, so its subject is
  // legitimately long. A definition's subject is a noun phrase. One global
  // cap would either truncate the agenda or admit whole sentences as names.
  readonly maxWords: number;
  // True when the capture sits before the marker rather than after it.
  readonly subjectIsPrefix?: boolean;
  readonly patterns: readonly RegExp[];
}

// Every pattern has exactly one capture group: the subject being taught.
// Ordered strongest-first; the first structure that matches a sentence wins,
// so a sentence is never emitted twice under two readings of itself.
const STRUCTURES: readonly Structure[] = [
  {
    // The lecturer stating the agenda or the recap of the whole session. The
    // single most valuable sentence in a lecture for answering "what was
    // taught", and it usually appears verbatim at the start and the end.
    id: "teaching.lesson_scope",
    maxWords: 45,
    kind: "lesson_scope",
    label: "what this lesson covers",
    base: 0.82,
    patterns: [
      /\bin this (?:lesson|lecture|session|chapter|module|video)\b[^.?!]*?\b(?:we (?:are going to |will |shall )?(?:see|learn|study|discuss|cover)|this is all about)\b(.+)/i,
      /\bis lesson mein\b[^.?!]*?\b(?:dekhenge|padhenge|seekhenge)\b(.+)/i,
    ],
  },
  {
    // A named topic boundary. "The next topic we have is X" is a lecturer
    // literally announcing the structure of their own lesson.
    id: "teaching.topic",
    maxWords: 12,
    kind: "topic",
    label: "topic taught",
    base: 0.74,
    patterns: [
      /\bthe next (?:topic|category|thing|section|part|one)\s+(?:that\s+)?(?:we have\s+)?is\s+(.+)/i,
      /\bthe next we have is\s+(.+)/i,
      /\bnow (?:what (?:is|are)|let(?:'s| us) (?:see|discuss|understand|look at))\s+(.+)/i,
      /\b(?:ab|abhi|aage)\s+(?:hum\s+)?(?:dekhte hain|padhte hain|start karte hain|badhte hain)\s+(.+)/i,
      /\b(?:moving on to|coming to|now coming to)\s+(.+)/i,
    ],
  },
  {
    // Explicit enumeration. Captures the thing being subdivided, which is
    // almost always a concept the student must be able to name.
    id: "teaching.enumeration",
    maxWords: 12,
    kind: "enumeration",
    label: "types or components listed",
    base: 0.76,
    patterns: [
      /\bthere (?:are|is)\s+(?:the\s+)?(?:two|three|four|five|six|\d+)\s+(?:types?|kinds?|categories|category|phases?|steps?)\s+of\s+(.+)/i,
      /\bkey functions?\s+(?:for|of)\s+(?:the\s+)?(.+?)\s+(?:are|is)\b/i,
      /\bwhat are the key functions? of\s+(.+)/i,
      /\b(?:do|teen|char|paanch)\s+(?:type|prakar|techniques?)\s+(?:ke|ka|hai|hain)\s*(.+)/i,
    ],
  },
  {
    // Naming. "that is called as X" and "it is called as X" are how this
    // lecturer closes a definition, and they are reliable across subjects.
    id: "teaching.definition",
    maxWords: 10,
    kind: "definition",
    label: "concept defined",
    base: 0.78,
    patterns: [
      /\b(?:that|this|it|which)\s+is\s+called\s+(?:as\s+)?(?:a\s+|an\s+|the\s+)?(.+)/i,
      /\b(?:is|are)\s+known\s+as\s+(?:a\s+|an\s+|the\s+)?(.+)/i,
      /\bit is a technique of\s+(.+)/i,
    ],
  },
  {
    // The same act of defining, but the term comes first: "<term> it basically
    // includes ...". Split out because an unanchored lazy capture on the left
    // drags the whole preamble with it and has to be tail-trimmed.
    id: "teaching.definition_prefix",
    kind: "definition",
    label: "concept defined",
    base: 0.78,
    maxWords: 8,
    subjectIsPrefix: true,
    patterns: [
      /\b(.+?)\s+it basically (?:include|includes|is|means|refers)\b/i,
      /\b(.+?)\s+is a collection of\b/i,
      /\b(.+?)\s+ko (?:kehte hain|bolte hain|kaha jata hai)\b/i,
    ],
  },
  {
    // Contrast. A lecturer drawing a distinction is teaching the distinction,
    // and students are routinely examined on exactly these.
    id: "teaching.comparison",
    maxWords: 12,
    kind: "comparison",
    label: "distinction drawn",
    base: 0.75,
    patterns: [
      /\b(?:main\s+)?difference between\s+(.+)/i,
      // "Toh donon mein difference ye hai, X and Y." The Hinglish form states
      // the contrast, then names both sides after it. An earlier version of
      // this captured an optional tail and so also matched "donon ka difference
      // samajh mein aaya?" -- a rhetorical check with no content -- which is why
      // it was dropped. Requiring real text after the copula keeps the one that
      // names the concepts and rejects the one that does not.
      /\bdono[n]?\s+(?:type\s+)?(?:ka|mein|ke)\s+(?:bhi\s+)?difference\s+(?:ye|yeh)\s+(?:hai|h)[,\s]+(.+)/i,
      /\b(.+?)\s+versus\s+/i,
    ],
  },
  {
    // Hinglish recap. "humne dekha ki X" -- "we saw that X" -- is this
    // lecturer's habitual way of summarising a block just taught. It occurs
    // eight times in the reference lecture and each time names real content.
    id: "teaching.recap",
    maxWords: 12,
    kind: "topic",
    label: "recapped as taught",
    base: 0.68,
    patterns: [
      /\b(?:humne|hamne|hum ne)\s+dekha\s+(?:ki\s+|ye\s+|yeh\s+)?(.+)/i,
      /\bin this lesson we learn\s+(.+)/i,
      /\bphir\s+(?:humne|hamne)\s+(?:dekha|padha)\s+(.+)/i,
    ],
  },
];

// ---------------------------------------------------------------------------
// References — category C
// ---------------------------------------------------------------------------
//
// Deliberately narrow. A general "extract every noun phrase" pass would bury
// the useful items, so this takes only two things a student would actually
// write down: technical acronyms the lecturer used more than once, and
// explicit study resources.
//
// Recurrence is the whole test for acronyms. A term said once may be an ASR
// artefact; a term said three times in a lecture is part of the lecture.

const ACRONYM = /\b[A-Z]{2,6}\b/g;
// Uppercase tokens that are English words or transcription noise rather than
// domain terms. Kept short on purpose -- this is a stop list, not a lexicon.
const NOT_AN_ACRONYM = new Set([
  "OK", "SO", "AND", "THE", "BUT", "FOR", "YOU", "ALL", "NOT", "NOW", "ITS",
  "IS", "ARE", "WAS", "CAN", "WILL", "THIS", "THAT", "HAI", "HAIN", "TOH",
]);
const MIN_ACRONYM_MENTIONS = 2;

const RESOURCE_PATTERNS: readonly RegExp[] = [
  /\b(research paper|reference book|text ?book|question bank|previous year paper|documentation|white ?paper|case study)\b/i,
  /\bchapter\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i,
];

interface RawItem {
  kind: CandidateKind;
  subject: string;
  label: string;
  cue: string;
  confidence: number;
  segment: TranscriptSegmentInput;
  sentence: string;
  charStart: number;
  charEnd: number;
}

function collectReferences(
  segments: readonly TranscriptSegmentInput[],
  whole: string,
): RawItem[] {
  const out: RawItem[] = [];
  const counts = new Map<string, number>();
  for (const m of whole.matchAll(ACRONYM)) {
    const term = m[0];
    if (NOT_AN_ACRONYM.has(term)) continue;
    counts.set(term, (counts.get(term) ?? 0) + 1);
  }
  const recurring = new Set(
    [...counts.entries()].filter(([, n]) => n >= MIN_ACRONYM_MENTIONS).map(([t]) => t),
  );

  const seen = new Set<string>();
  for (const segment of segments) {
    for (const term of recurring) {
      const key = term.toLowerCase();
      if (seen.has(key)) continue;
      if (!new RegExp(`\b${term}\b`).test(segment.text)) continue;
      seen.add(key);
      out.push({
        kind: "reference",
        subject: term,
        label: `mentioned ${counts.get(term)} times`,
        cue: "reference.recurring_acronym",
        // Recurrence is weak evidence of importance and nothing more, so these
        // sort below everything a structure actually matched.
        confidence: Math.min(0.6, 0.4 + 0.05 * (counts.get(term) ?? 0)),
        segment,
        sentence: segment.text,
        charStart: segment.charStart,
        charEnd: segment.charEnd,
      });
    }
    for (const pattern of RESOURCE_PATTERNS) {
      const hit = segment.text.match(pattern);
      if (!hit) continue;
      const key = hit[0].toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        kind: "reference",
        subject: hit[0],
        label: "resource named",
        cue: "reference.resource",
        confidence: 0.62,
        segment,
        sentence: segment.text,
        charStart: segment.charStart,
        charEnd: segment.charEnd,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

const SENTENCE_BREAK = /[.!?;\n।॥]+/g;

function splitSentences(text: string): { text: string; offset: number }[] {
  const out: { text: string; offset: number }[] = [];
  let cursor = 0;
  for (const match of text.matchAll(SENTENCE_BREAK)) {
    const end = match.index;
    if (end > cursor) out.push({ text: text.slice(cursor, end), offset: cursor });
    cursor = end + match[0].length;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), offset: cursor });
  return out.filter((s) => s.text.trim().length > 8);
}

// The same concept is defined once and recapped four times. Keeping every
// mention would bury the definition under its own echoes, so a subject is kept
// once per kind -- the highest-confidence occurrence, earliest on a tie.
function dedupe(items: RawItem[]): RawItem[] {
  const best = new Map<string, RawItem>();
  for (const item of items) {
    const key = `${item.kind}::${item.subject.toLowerCase().replace(/\s+/g, " ")}`;
    const held = best.get(key);
    if (
      !held ||
      item.confidence > held.confidence ||
      (item.confidence === held.confidence && item.segment.startMs < held.segment.startMs)
    ) {
      best.set(key, item);
    }
  }
  return [...best.values()];
}

// A subject the lecturer returns to is a subject the lecture is about. Worth a
// small bonus, and it is measured against the transcript rather than asserted.
function recurrenceBonus(subject: string, whole: string): number {
  const head = subject.split(/\s+/).slice(0, 3).join(" ").toLowerCase();
  if (head.length < 4) return 0;
  let count = 0;
  let from = 0;
  const hay = whole.toLowerCase();
  for (;;) {
    const at = hay.indexOf(head, from);
    if (at === -1) break;
    count += 1;
    from = at + head.length;
    if (count > 4) break;
  }
  return count >= 3 ? 0.06 : count === 2 ? 0.03 : 0;
}

export function extractTeaching(
  segments: readonly TranscriptSegmentInput[],
): ExtractionCandidate[] {
  const whole = segments.map((s) => s.text).join(" ");
  const raw: RawItem[] = [];

  for (const segment of segments) {
    for (const sentence of splitSentences(segment.text)) {
      for (const structure of STRUCTURES) {
        let matched: { subject: string; cue: string } | null = null;
        for (let i = 0; i < structure.patterns.length; i += 1) {
          const hit = sentence.text.match(structure.patterns[i]);
          if (!hit) continue;
          const captured = hit[1] ?? "";
          const subject = cleanSubject(
            structure.subjectIsPrefix ? tailPhrase(captured, structure.maxWords) : captured,
            structure.maxWords,
          );
          if (!subject) continue;
          matched = { subject, cue: `${structure.id}#${i}` };
          break;
        }
        if (!matched) continue;

        const start = Math.min(segment.charStart + sentence.offset, segment.charEnd);
        raw.push({
          kind: structure.kind,
          subject: matched.subject,
          label: structure.label,
          cue: matched.cue,
          confidence: Math.min(
            1,
            Math.round((structure.base + recurrenceBonus(matched.subject, whole)) * 100) / 100,
          ),
          segment,
          sentence: sentence.text,
          charStart: start,
          charEnd: Math.min(start + sentence.text.length, segment.charEnd),
        });
        // One reading per sentence. A sentence that both defines and enumerates
        // is stored under the stronger structure, with the full sentence kept
        // as evidence so nothing is hidden from the reviewer.
        break;
      }
    }
  }

  const items = dedupe([...raw, ...collectReferences(segments, whole)]);

  return items
    .map((item) => ({
      kind: item.kind,
      title: toTitle(item.subject),
      detail: item.sentence.trim().replace(/\s+/g, " "),
      duePhrase: null,
      dueResolved: null as null,
      // Same anchoring contract as ./rules.ts: the segment's own range, never
      // an interpolation inside it.
      evidenceStartMs: item.segment.startMs,
      evidenceEndMs: item.segment.endMs,
      evidenceCharStart: item.charStart,
      evidenceCharEnd: item.charEnd,
      evidenceText: item.sentence,
      confidence: item.confidence,
      matchedCue: item.cue,
    }))
    .sort(
      (a, b) => a.evidenceStartMs - b.evidenceStartMs || a.evidenceCharStart - b.evidenceCharStart,
    );
}
