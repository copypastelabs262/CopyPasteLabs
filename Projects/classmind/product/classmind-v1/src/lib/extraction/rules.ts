// The `rules` extraction method: cue matching over sentences.
//
// Why rules first, when an LLM would obviously read this better: a rule method
// is deterministic, free, instant, and -- the part that matters -- it is a
// baseline. "The LLM got 78%" is not a finding. "The LLM got 78% where cue
// matching got 51%" is. Something has to run first for the second number to
// exist, and it may as well be something shippable.
//
// The posture throughout is PRECISION OVER RECALL. A candidate that is wrong
// costs a reviewer attention and, repeated, costs the product its credibility;
// a candidate that is missed costs one item that was going to be typed in by
// hand anyway. Where a rule could go either way, it does not fire.
//
// Read the SUPPRESSION section before adding cues. The single largest source
// of false positives in real Hinglish lecture speech is documented there and
// it is not obvious.

// Relative, with the extension, rather than the app's "@/" alias. This module
// is pure logic with no app dependencies, and keeping its internal imports
// resolvable by plain `node` is what lets scripts/test-extraction.mts run it
// without a bundler or a test framework. Alias imports are still correct for
// anything reaching INTO this module from the app.
import type {
  CandidateKind,
  CourseContextDocument,
  ExtractionCandidate,
  ExtractionInput,
  ExtractionMethod,
  TranscriptSegmentInput,
} from "./types.ts";

// ===========================================================================
// 1. Cue matching primitives
// ===========================================================================

// Word boundaries have to work in two scripts at once. `\b` is defined against
// [A-Za-z0-9_], so it is meaningless in Devanagari: /हम/ would happily match
// inside हमेशा ("always"), turning a filler word into a grammatical signal.
//
// These lookarounds treat letters, digits AND combining marks as "inside a
// word". The combining marks are the load-bearing part -- हम followed by the
// vowel sign े is हमें, a different word, and only \p{M} stops the shorter cue
// from claiming the longer one.
const NOT_WORD_BEFORE = "(?<![\\p{L}\\p{N}\\p{M}])";
const NOT_WORD_AFTER = "(?![\\p{L}\\p{N}\\p{M}])";

function escapeLiteral(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface CompiledCue {
  readonly term: string;
  readonly re: RegExp;
}

// Internal whitespace becomes \s+ so a cue survives the spacing an ASR engine
// happens to emit. No `g` flag anywhere in this file: a global regex carries
// lastIndex between calls, and these are module-level constants reused across
// every sentence of every transcript.
function compileCue(term: string): CompiledCue {
  const body = escapeLiteral(term.trim()).replace(/\s+/g, "\\s+");
  return { term, re: new RegExp(`${NOT_WORD_BEFORE}${body}${NOT_WORD_AFTER}`, "iu") };
}

function compile(terms: readonly string[]): readonly CompiledCue[] {
  return terms.map(compileCue);
}

function hasCue(text: string, cues: readonly CompiledCue[]): boolean {
  return cues.some((cue) => cue.re.test(text));
}

// Returns the matched substring rather than the cue term, so a title can show
// what was actually said ("DPP", not "dpp").
function findCue(text: string, cues: readonly CompiledCue[]): string | null {
  for (const cue of cues) {
    const m = cue.re.exec(text);
    if (m) return m[0];
  }
  return null;
}

function countCues(text: string, cues: readonly CompiledCue[]): number {
  let n = 0;
  for (const cue of cues) if (cue.re.test(text)) n += 1;
  return n;
}

// ===========================================================================
// 2. Lexicons
// ===========================================================================
//
// Three scripts share one list on purpose. The product transcribes in Latin
// script (Sarvam `mode: "translit"`), so romanized Hindi -- "kal", "agle
// hafte", "submit karna hai" -- is the primary case and gets the most
// coverage. Devanagari cues are kept because the one real transcript that has
// actually been inspected is in Devanagari, and a lexicon that cannot read
// existing evidence cannot be evaluated against it.

// Things students produce. The strongest possible signal that an obligation is
// aimed at students rather than at a worked example on the board.
const WORK_TERMS = compile([
  "assignment", "assignments", "homework", "home work", "hw",
  "dpp", "daily practice problem", "daily practice problems",
  "practice sheet", "worksheet", "work sheet", "problem set", "problem sheet",
  "project", "report", "lab report", "lab record", "lab file", "practical file",
  "presentation", "seminar", "submission", "submissions",
  "असाइनमेंट", "होमवर्क", "प्रोजेक्ट", "प्रेजेंटेशन", "प्रैक्टिकल फाइल",
]);

// Assessments. Deliberately a separate list from WORK_TERMS: the word "exam"
// appears constantly in physics instruction as motivation ("exam me aise
// questions aate hain") and is therefore much weaker evidence of an obligation
// than "assignment" is. The SUPPRESSION rules below rely on this distinction.
const ASSESSMENT_TERMS = compile([
  "exam", "exams", "examination", "test", "tests", "unit test", "class test",
  "quiz", "viva", "midterm", "mid term", "midsem", "mid sem",
  "endsem", "end sem", "sessional", "practical exam", "board exam",
  "परीक्षा", "इम्तिहान", "टेस्ट", "एग्जाम", "क्विज़", "क्विज", "वाइवा",
]);

// Material the lecturer makes available. Almost always lecturer-side, so these
// feed announcement rules rather than assignment rules.
const MATERIAL_TERMS = compile([
  "notes", "note", "pdf", "pdfs", "material", "materials", "study material",
  "slides", "ppt", "handout", "handouts", "question bank", "sample paper",
  "previous year paper", "pyq", "pyqs", "solution", "solutions", "recording",
  "नोट्स", "नोट", "पीडीएफ", "मटेरियल", "स्लाइड्स", "किताब", "हैंडआउट",
]);

const SCHEDULE_TERMS = compile([
  "schedule", "timetable", "time table", "datesheet", "date sheet",
  "syllabus", "course plan", "lecture plan",
  "स्केड्यूल", "शेड्यूल", "टाइमटेबल", "डेटशीट", "सिलेबस",
]);

// The dangerous family. "करना है" / "karna hai" is the single strongest
// obligation marker in Hindi and also the single strongest false-positive
// generator, because instruction uses the identical construction. See
// SUPPRESSION.
const OBLIGATION_HINDI = compile([
  "करना है", "करनी है", "करने है", "करना होगा", "करनी होगी", "करना पड़ेगा",
  "करनी पड़ेगी", "कर लेना है", "जमा करना", "सबमिट करना",
  "karna hai", "karni hai", "karne hai", "krna hai", "karna h",
  "karna hoga", "karni hogi", "karna padega", "karni padegi",
  "kar lena hai", "jama karna", "jama karana", "submit karna",
  "complete karna", "complete karni",
]);

const OBLIGATION_ENGLISH = compile([
  "have to", "has to", "you must", "must", "need to", "needs to",
  "required to", "is required", "are required", "expected to",
  "make sure you", "don't forget to", "dont forget to",
]);

const SUBMISSION_CUES = compile([
  "submit", "submitted", "submission", "jama", "जमा", "सबमिट",
  "upload", "turn in", "hand in", "hand over", "jama kar", "jama karke",
]);

// Strong, unambiguous due-moment words. "tak" is deliberately absent: it is a
// postposition that attaches to any noun ("yahan tak" = "up to here") and
// belongs to the time patterns, not here.
const DEADLINE_CUES = compile([
  "due", "due date", "deadline", "last date", "last day", "cut off date",
  "submission date", "आखिरी तारीख", "अंतिम तिथि", "डेडलाइन", "ड्यू डेट",
]);

// Dative second person. In Hindi this is what marks WHO is obligated, and it
// is the difference between an assignment and a blackboard step.
const ADDRESSEE_DATIVE = compile([
  "aapko", "apko", "aap ko", "tumhe", "tumhein", "tumko", "aap sabko",
  "आपको", "आप को", "तुम्हें", "तुमको", "आप सबको",
]);

// Weaker second person. "you" is worth very little on its own -- English
// lecture speech is saturated with it ("you can see that...") -- so it earns a
// small bonus and never satisfies a gate by itself.
const ADDRESSEE_WEAK = compile([
  "aap", "aapke", "aapka", "aapki", "tum", "tumhara", "tumhari",
  "you", "your", "students", "स्टूडेंट्स", "आप", "आपके", "आपका", "आपकी",
  "तुम", "बच्चों",
]);

// First-person-plural instructional framing. THE key negative signal -- see
// SUPPRESSION.
const INCLUSIVE_NARRATION = compile([
  "hum", "hume", "humein", "humko", "hamein", "hame", "hamko", "hum log",
  "apan", "let us", "let's", "lets", "we", "we have to", "we need to",
  "हम", "हमें", "हमको", "हमने", "हम लोग",
]);

// Pointing at a thing on the board rather than naming a deliverable. Note the
// absence of a bare "is": in romanized Hinglish it collides with the English
// verb "is", which would fire on nearly every sentence.
const DEMONSTRATIVE_OBJECT = compile([
  "ise", "isko", "isse", "isme", "ismein", "iski", "iska", "is body",
  "इसे", "इसको", "इससे", "इसमें", "इसका", "इसकी",
]);

// Domain vocabulary for the subject being taught. This list is physics-shaped
// because the one inspected transcript is a physics lecture; it is a heuristic
// input, not a taxonomy, and a chemistry or CS course would want its own.
// Density here is used only to DOWN-weight, never to classify.
const DOMAIN_TERMS = compile([
  "charge", "charged", "positive", "negative", "electron", "electrons",
  "proton", "neutron", "atom", "nucleus", "force", "field",
  "magnetic", "potential", "voltage", "current", "resistance", "capacitor",
  "velocity", "acceleration", "displacement", "momentum", "energy", "mass",
  "vector", "scalar", "equation", "formula", "derivation", "derive",
  // Note: no "electric field" entry. It would match alongside "field" and
  // double-count a single concept, and the density veto counts distinct cues.
  "integrate", "integration", "differentiate", "coulomb", "newton", "joule",
  "ampere", "friction", "torque", "radius", "sphere", "conductor",
  "insulator", "dielectric", "flux", "amplitude", "frequency", "wavelength",
  "body", "graph", "axis",
  "चार्ज", "आवेश", "इलेक्ट्रॉन", "प्रोटॉन", "न्यूट्रॉन", "परमाणु", "बल",
  "क्षेत्र", "विभव", "वोल्टेज", "धारा", "वेग", "त्वरण", "संवेग", "ऊर्जा",
  "द्रव्यमान", "सदिश", "समीकरण", "सूत्र", "पॉजिटिव", "नेगेटिव", "फोर्स",
  "फील्ड", "बॉडी", "कंडक्टर",
]);

// Advice framing. "You should" is not "you must", and telling the two apart is
// the product's central discrimination.
const GUIDANCE_CUES = compile([
  "try to", "try and", "do try", "koshish karo", "koshish kariye",
  "koshish kijiye", "koshish karna", "koshish karein", "कोशिश",
  "recommend", "i recommend", "i suggest", "suggest", "my advice",
  "better hoga", "behtar hoga", "achha rahega", "acha rahega",
  "बेहतर होगा", "अच्छा रहेगा", "should read", "should practice",
  "should revise", "padh lena", "padh lijiye", "पढ़ लेना", "पढ़ लीजिए",
  "revise", "revision kar", "zaroor dekhna", "जरूर देखना", "जरूर पढ़ना",
]);

// What a piece of advice is advice ABOUT. Required by the guidance rule so
// that a bare "try to" in the middle of an explanation does not fire.
const STUDY_OBJECT_TERMS = compile([
  "chapter", "chapters", "exercise", "exercises", "back exercise",
  "back exercises", "question", "questions", "numerical", "numericals",
  "derivation", "topic", "topics", "notes", "book", "ncert", "example",
  "examples", "problems", "revision", "syllabus", "concept", "concepts",
  "अध्याय", "चैप्टर", "प्रश्न", "सवाल", "एक्सरसाइज", "नोट्स",
]);

// "This will appear on the assessment." Only ever consulted together with an
// assessment term, which is what keeps a generic "aayega" from firing.
const SCOPE_CUES = compile([
  "aayega", "aayenge", "aayegi", "aa sakta hai", "aa sakte hain",
  "poocha jayega", "poochha jayega", "pucha jayega", "puchenge",
  "se question", "se questions", "me se aayega", "mein se aayega",
  "ke liye important", "important hai", "syllabus me", "syllabus mein",
  "out of syllabus", "will be asked", "will come in", "will appear",
  "is in the syllabus", "covered in the", "expect questions",
  "आएगा", "आएंगे", "पूछा जाएगा", "पूछे जाएंगे", "सिलेबस में",
]);

// The material actually reaching students.
const AVAILABILITY_CUES = compile([
  "milega", "milegi", "milenge", "mil jayega", "mil jaayega", "mil jaenge",
  "mil jayenge", "mil jaayenge", "description me", "description mein",
  "available", "uploaded", "posted", "shared", "link me", "link mein",
  "google classroom", "classroom pe", "portal pe", "lms", "telegram pe",
  "मिलेगा", "मिलेगी", "मिलेंगे", "मिल जाएगा", "मिल जाएंगे", "मिल जाएँगे",
  "डिस्क्रिप्शन में", "डिस्क्रिप्शन मे", "अपलोड",
]);

// Lecturer-side first-person future. These are promises TO students.
const PROMISE_CUES = compile([
  "kar dunga", "kar doonga", "kar dungi", "kar denge", "kar dega",
  "de dunga", "de doonga", "de denge", "bhej dunga", "bhej denge",
  "daal dunga", "daal denge", "release kar", "upload kar", "share kar",
  "post kar", "i will share", "i will upload", "i will post",
  "i will release", "i'll share", "i'll upload", "we will upload",
  "we will share", "we will release", "will be uploaded", "will be shared",
  "will be posted", "will be released",
  "कर दूंगा", "कर दूँगा", "कर देंगे", "दे दूंगा", "दे देंगे", "भेज दूंगा",
  "डाल दूंगा", "डाल देंगे", "रिलीज कर", "अपलोड कर", "शेयर कर", "मैंने की है",
]);

// ===========================================================================
// 3. Time expressions -> duePhrase
// ===========================================================================
//
// These produce the phrase EXACTLY as spoken and nothing else. Nothing in this
// file converts a phrase to a date, and that is a contract, not an omission:
// Capture Contract obligation 4 requires the spoken phrase, the timezone, the
// calendar and the rule applied to be stored together, and three of those four
// do not exist here.

const WEEKDAY =
  "monday|tuesday|wednesday|thursday|friday|saturday|sunday|" +
  "somvar|mangalvar|budhvar|guruvar|shukravar|shanivar|ravivar|itwar|" +
  "सोमवार|मंगलवार|बुधवार|गुरुवार|शुक्रवार|शनिवार|रविवार";

const RELATIVE_DAY =
  "day\\s+after\\s+tomorrow|tomorrow|today|tonight|" +
  "parson|parso|aaj|kal|कल|परसों|आज";

const MONTH = "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec";

const TEMPORAL_NOUN =
  `${WEEKDAY}|${RELATIVE_DAY}|weekend|week|class|lecture|exam|test|` +
  "submission|deadline";

function timePattern(body: string, unicodeOnly = false): RegExp {
  return new RegExp(
    `${NOT_WORD_BEFORE}(?:${body})${NOT_WORD_AFTER}`,
    unicodeOnly ? "u" : "iu",
  );
}

// A dash class that accepts the ASCII hyphen and the Unicode dashes an ASR or
// a copy-paste can produce -- "एक-दो दिन में" and "एक दो दिन में" are the same
// phrase and both appear in real transcripts.
const DASH = "[\\s\\u2010-\\u2015-]";

const TIME_PATTERNS: readonly RegExp[] = [
  // "agle Thursday", "agli class", "aglay hafte"
  timePattern("ag(?:le|li|lay)\\s+[\\p{L}]+"),
  // "अगले गुरुवार", "अगली क्लास"
  timePattern("(?:अगले|अगली|अगला)\\s+[\\u0900-\\u097F]+", true),
  // "ek do din me", "do teen hafte mein", "ek-do din"
  timePattern(
    `(?:ek|do|teen|char|paanch|panch)(?:${DASH}+(?:ek|do|teen|char))?${DASH}*` +
      "(?:din|dino|hafte|haftey|hafta|mahine|month|weeks?|days?)" +
      "(?:\\s+(?:me|mein|mai|ke\\s+andar))?",
  ),
  // "एक-दो दिन में", "दो हफ्ते में" -- the real transcript's phrasing.
  timePattern(
    `(?:एक|दो|तीन|चार|पाँच|पांच)(?:${DASH}+(?:एक|दो|तीन|चार))?${DASH}*` +
      "(?:दिन|दिनों|हफ़्ते|हफ्ते|सप्ताह|महीने)(?:\\s*(?:में|मे|के\\s*अंदर))?",
    true,
  ),
  // "next week Monday", "this Friday", "coming class"
  timePattern(
    `(?:next|this|coming|following)\\s+(?:week|month|class|lecture|session|${WEEKDAY})` +
      `(?:\\s+(?:${WEEKDAY}))?`,
  ),
  // "kal", "kal tak", "day after tomorrow"
  timePattern(`(?:${RELATIVE_DAY})(?:\\s+tak)?`),
  // A bare weekday. Listed after the compound patterns, though ordering here
  // is only a tie-break: selection is by earliest position, so "agle Thursday"
  // beats "Thursday" because "agle" starts sooner.
  timePattern(WEEKDAY),
  // "by Friday", "till Monday" -- the tail is restricted to real temporal
  // nouns, because an open-ended "before <word>" happily captures "before we
  // start", which is not a due date.
  timePattern(`(?:by|till|until)\\s+(?:the\\s+)?(?:next\\s+|this\\s+)?(?:${TEMPORAL_NOUN})`),
  // "5 baje", "5 pm", "17:00", "5 बजे"
  timePattern("\\d{1,2}(?::\\d{2})?\\s*(?:baje|bje|बजे|a\\.?m\\.?|p\\.?m\\.?|o'?clock)"),
  // "12 November", "3rd Dec"
  timePattern(`\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTH})[\\p{L}]*`),
  // "is hafte", "isi week", "इस हफ्ते"
  timePattern("(?:is|isi|इस|इसी)\\s+(?:hafte|hafta|week|weekend|mahine|month|हफ़्ते|हफ्ते|महीने)"),
  timePattern("weekend|month\\s+end|semester\\s+end"),
];

// Earliest match wins, longest breaks a tie. Earliest-wins is what keeps the
// modifier attached: in "agle Thursday" the compound starts before the bare
// weekday does, so the phrase a human would read back is the one returned.
function findDuePhrase(text: string): string | null {
  let best: { index: number; value: string } | null = null;
  for (const re of TIME_PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    const index = m.index;
    if (
      best === null ||
      index < best.index ||
      (index === best.index && m[0].length > best.value.length)
    ) {
      best = { index, value: m[0] };
    }
  }
  return best ? best.value : null;
}

// ===========================================================================
// 4. Course context
// ===========================================================================

// Assessment head-nouns a course-specific name is allowed to end in. The
// constraint is what stops this from harvesting every capitalised word in a
// syllabus -- "Newton" and "Chapter Three" are Title Case too.
const CONTEXT_HEAD_NOUNS = new Set([
  "sheet", "sheets", "record", "records", "journal", "portfolio", "seminar",
  "presentation", "project", "projects", "quiz", "quizzes", "viva",
  "assignment", "assignments", "test", "tests", "exam", "exams", "report",
  "reports", "submission", "capstone", "worksheet", "log", "logbook",
  "notebook", "file", "paper", "colloquium",
]);

const TITLE_CASE_PHRASE = /\b[A-Z][a-z]+(?:[ -][A-Z][a-z]+){0,2}\b/g;

// A hard cap. Course context is text a human typed, and an unbounded lexicon
// derived from untrusted text is both a performance question and a precision
// question -- 200 harvested phrases would match something in every sentence.
const MAX_CONTEXT_TERMS = 24;

// Course context may only ADD deliverable vocabulary. It never gates a rule
// and never suppresses one, because most lectures arrive with no syllabus
// attached and a method that needs one is a method that does nothing.
function deriveCourseTerms(
  docs: readonly CourseContextDocument[] | undefined,
): readonly CompiledCue[] {
  if (!docs || docs.length === 0) return [];
  const found = new Set<string>();
  for (const doc of docs) {
    for (const match of `${doc.title}\n${doc.body}`.matchAll(TITLE_CASE_PHRASE)) {
      const phrase = match[0];
      const last = phrase.split(/[ -]/).at(-1)?.toLowerCase();
      if (!last || !CONTEXT_HEAD_NOUNS.has(last)) continue;
      // A bare head-noun is already in the general lexicon; only the
      // course-specific qualifier makes it worth harvesting.
      if (!phrase.includes(" ") && !phrase.includes("-")) continue;
      found.add(phrase.toLowerCase());
      if (found.size >= MAX_CONTEXT_TERMS) break;
    }
  }
  return compile([...found]);
}

// ===========================================================================
// 5. Sentence signals
// ===========================================================================

interface Signals {
  readonly work: string | null;
  readonly assessment: string | null;
  readonly material: string | null;
  readonly schedule: string | null;
  readonly courseTerm: string | null;
  readonly deliverable: string | null;
  readonly obligation: boolean;
  readonly submission: boolean;
  readonly deadlineWord: boolean;
  readonly addresseeDative: boolean;
  readonly addresseeWeak: boolean;
  readonly inclusiveNarration: boolean;
  readonly demonstrative: boolean;
  readonly domainHits: number;
  readonly guidance: boolean;
  readonly studyObject: boolean;
  readonly scopeCue: boolean;
  readonly availability: boolean;
  readonly promise: boolean;
  readonly duePhrase: string | null;
  readonly wordCount: number;
}

function readSignals(text: string, courseTerms: readonly CompiledCue[]): Signals {
  const work = findCue(text, WORK_TERMS);
  const assessment = findCue(text, ASSESSMENT_TERMS);
  const material = findCue(text, MATERIAL_TERMS);
  const schedule = findCue(text, SCHEDULE_TERMS);
  const courseTerm = findCue(text, courseTerms);
  return {
    work,
    assessment,
    material,
    schedule,
    courseTerm,
    deliverable: courseTerm ?? work ?? assessment ?? material ?? schedule,
    obligation: hasCue(text, OBLIGATION_HINDI) || hasCue(text, OBLIGATION_ENGLISH),
    submission: hasCue(text, SUBMISSION_CUES),
    deadlineWord: hasCue(text, DEADLINE_CUES),
    addresseeDative: hasCue(text, ADDRESSEE_DATIVE),
    addresseeWeak: hasCue(text, ADDRESSEE_WEAK),
    inclusiveNarration: hasCue(text, INCLUSIVE_NARRATION),
    demonstrative: hasCue(text, DEMONSTRATIVE_OBJECT),
    domainHits: countCues(text, DOMAIN_TERMS),
    guidance: hasCue(text, GUIDANCE_CUES),
    studyObject: hasCue(text, STUDY_OBJECT_TERMS),
    scopeCue: hasCue(text, SCOPE_CUES),
    availability: hasCue(text, AVAILABILITY_CUES),
    promise: hasCue(text, PROMISE_CUES),
    duePhrase: findDuePhrase(text),
    wordCount: text.trim().split(/\s+/).filter(Boolean).length,
  };
}

// ===========================================================================
// 6. SUPPRESSION -- the "करना है" problem
// ===========================================================================
//
// In a 40-minute Class-12 physics lecture that was transcribed and read by
// hand, "करना है" ("must do / have to do") -- the strongest obligation marker
// the language has -- occurred 4 times, and AT LEAST HALF of those were
// physics instruction, not obligations. The clearest example:
//
//     "इसे हमें पॉजिटिव चार्ज करना है"   ("we have to positively charge this")
//
// That is a step in a worked example. A keyword matcher emits it as homework.
// At a 50% error rate on the strongest cue in the lexicon, cue matching is
// worse than useless -- it is a queue of plausible-looking garbage that a
// reviewer has to read to reject.
//
// The fix is not a better keyword. It is noticing that Hindi marks WHO is
// obligated, and instruction marks it differently from homework:
//
//   homework:    "आपको / aapko ... करना है"   (dative SECOND person: you)
//   instruction: "हमें  / humein ... करना है"  (first person plural: we, us)
//
// So the defence is layered, and both layers matter:
//
//   LAYER 1 -- the gate. An obligation cue never fires a rule on its own. It
//   needs a second, independent signal: a deliverable noun, or (for the bare
//   rule) a dative addressee AND a time expression together. This alone kills
//   the example above, which has none of them.
//
//   LAYER 2 -- the vetoes below. They catch sentences that pass the gate
//   because a weak deliverable happened to be present -- "ye numerical humein
//   exam ke point of view se solve karna hai" contains "exam" and is still
//   pure instruction.
//
// The vetoes apply ONLY to rules marked `narrationProne`. Announcement rules
// legitimately use first-person ("मैं ... कर देंगे" is the lecturer promising
// something) and applying VETO_ADDRESSEE to them would delete the real finds.

interface VetoResult {
  readonly vetoed: boolean;
  readonly reason: string | null;
}

function narrationVeto(s: Signals): VetoResult {
  // A. First-person-plural with no second person named. "हमें/humein" is the
  //    inclusive teaching "we" -- the speaker doing the step alongside the
  //    class. A real student obligation names the student. This veto ignores
  //    whether a deliverable is present, because "exam" and "notes" occur
  //    constantly inside explanations and would otherwise rescue instruction.
  //    Cost: a genuine "hum sabko assignment karna hai" is lost. Accepted --
  //    that phrasing is rare and the false positives are not.
  if (s.inclusiveNarration && !s.addresseeDative) {
    return { vetoed: true, reason: "inclusive_first_person_without_addressee" };
  }
  // B. Domain vocabulary density. Two or more distinct subject terms in one
  //    sentence means the sentence is about the subject, not about coursework.
  //    A WORK term (assignment / DPP / project) overrides this, because
  //    "assignment me electric field ka numerical banana hai" is a real
  //    assignment; an ASSESSMENT or MATERIAL term deliberately does not.
  if (s.domainHits >= 2 && !s.work && !s.courseTerm) {
    return { vetoed: true, reason: "domain_vocabulary_density" };
  }
  // C. Deixis. "इसे / ise / isko" points at an object on the board. Without a
  //    named deliverable or a named addressee, an obligation about "this
  //    thing here" is a step, not a submission.
  if (s.demonstrative && !s.work && !s.courseTerm && !s.addresseeDative) {
    return { vetoed: true, reason: "demonstrative_object" };
  }
  return { vetoed: false, reason: null };
}

// ===========================================================================
// 7. Rules
// ===========================================================================

interface Rule {
  readonly id: string;
  readonly kind: CandidateKind;
  readonly label: string;
  readonly base: number;
  // Built on an obligation cue, and therefore subject to the vetoes above.
  readonly narrationProne?: true;
  readonly fires: (s: Signals) => boolean;
}

// Order is the deterministic tie-break when two rules score identically on one
// sentence; strongest first.
//
// Note what is NOT here: a rule for the lecturer promising something to
// students that produces an `assignment`. The domain currently defines an
// obligation as something required OF STUDENTS, so "I will release the
// schedule" and "notes will be posted" are announcements. They are real,
// useful, frequently spoken, and they are not homework. If the Ledger later
// grows a notion of a lecturer-side commitment, these rules move; until then
// forcing them into `assignment` would put items on a student's task list that
// the student cannot do.
const RULES: readonly Rule[] = [
  {
    id: "deadline.explicit",
    kind: "deadline",
    label: "due date stated",
    base: 0.7,
    fires: (s) =>
      s.deadlineWord &&
      Boolean(s.work ?? s.assessment ?? s.courseTerm) === true
        ? true
        : s.deadlineWord && (s.submission || s.duePhrase !== null),
  },
  {
    id: "announcement.schedule_release",
    kind: "announcement",
    label: "schedule or timetable to be released",
    base: 0.66,
    fires: (s) =>
      s.schedule !== null && (s.promise || s.availability || s.duePhrase !== null),
  },
  {
    id: "deadline.exam_scheduled",
    kind: "deadline",
    label: "assessment scheduled",
    base: 0.62,
    fires: (s) => s.assessment !== null && s.duePhrase !== null && !s.scopeCue,
  },
  {
    id: "exam_scope.topics",
    kind: "exam_scope",
    label: "exam scope mentioned",
    base: 0.62,
    fires: (s) => s.assessment !== null && s.scopeCue,
  },
  {
    id: "announcement.material_available",
    kind: "announcement",
    label: "material will be shared",
    base: 0.62,
    fires: (s) =>
      (s.material !== null || s.schedule !== null) && (s.availability || s.promise),
  },
  {
    id: "assignment.work_obligation",
    kind: "assignment",
    label: "submission required",
    base: 0.6,
    narrationProne: true,
    fires: (s) =>
      (s.work !== null || s.courseTerm !== null || s.assessment !== null) &&
      (s.obligation || s.submission),
  },
  {
    id: "guidance.advice",
    kind: "guidance",
    label: "suggested practice or reading",
    base: 0.52,
    fires: (s) => s.guidance && (s.studyObject || s.addresseeDative || s.addresseeWeak),
  },
  {
    id: "announcement.lecturer_promise",
    kind: "announcement",
    label: "lecturer commitment to students",
    base: 0.5,
    fires: (s) =>
      s.promise && (s.addresseeDative || s.addresseeWeak || s.deliverable !== null),
  },
  {
    // The deliberately dangerous one, kept because "aapko ye kal tak karna hai"
    // is a real and common way to set work without naming it. Gated as hard as
    // it is possible to gate a rule: a dative addressee AND a time expression
    // AND no deliverable (a deliverable means the rule above already has it),
    // on top of the vetoes.
    id: "assignment.bare_obligation",
    kind: "assignment",
    label: "unnamed task required",
    base: 0.48,
    narrationProne: true,
    fires: (s) =>
      s.obligation &&
      s.addresseeDative &&
      s.duePhrase !== null &&
      s.deliverable === null,
  },
];

// Below this, a candidate is not worth a reviewer's attention. Set high on
// purpose: the cost of a missed item is one item typed by hand; the cost of a
// flooded queue is that the queue stops being read.
const MIN_CONFIDENCE = 0.45;

function score(rule: Rule, s: Signals): number {
  let value = rule.base;
  if (s.addresseeDative) value += 0.1;
  else if (s.addresseeWeak) value += 0.04;
  if (s.duePhrase !== null) value += 0.12;
  if (s.submission) value += 0.06;
  if (s.deadlineWord) value += 0.05;
  // Too short to judge. A three-word fragment that happens to contain a cue is
  // usually an ASR artefact, not a sentence.
  if (s.wordCount < 4) value -= 0.12;
  if (rule.narrationProne) {
    // Sub-veto weight: one domain term is not enough to reject, but it is
    // enough to sort below a clean match.
    if (s.domainHits === 1 && !s.work && !s.courseTerm) value -= 0.15;
    if (s.demonstrative && !s.work && !s.courseTerm) value -= 0.08;
  }
  return Math.min(1, Math.max(0, Math.round(value * 100) / 100));
}

// ===========================================================================
// 8. Sentence segmentation
// ===========================================================================

interface Sentence {
  readonly text: string;
  readonly offset: number;
}

// Sentence terminators in both scripts, plus newline and semicolon. Commas are
// deliberately NOT boundaries -- Hindi clauses run long and comma-splitting
// would tear "aapko ye assignment, jo maine bataya tha, kal tak karna hai"
// into three fragments, none of which is extractable.
const SENTENCE_BREAK = /[.!?;\n।॥]+/g;

// Scoring per sentence rather than per segment is what stops a noisy chunk
// from destroying a real match. One real ASR chunk contained song lyrics
// running straight into a genuine announcement; scored as one blob, the lyrics
// dilute every signal and widen the evidence span to something a reviewer
// cannot use. Split first, and the announcement is a clean span on its own.
function splitSentences(text: string): Sentence[] {
  const out: Sentence[] = [];
  let cursor = 0;
  SENTENCE_BREAK.lastIndex = 0;
  for (const match of text.matchAll(SENTENCE_BREAK)) {
    const end = match.index;
    if (end > cursor) out.push({ text: text.slice(cursor, end), offset: cursor });
    cursor = end + match[0].length;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), offset: cursor });
  // An unpunctuated segment yields one long sentence. That is honest -- a wide
  // evidence span is recoverable, a wrongly narrowed one is not.
  return out.filter((s) => s.text.trim().length > 2);
}

// ===========================================================================
// 9. Extraction
// ===========================================================================

function toDisplay(term: string): string {
  // Preserve deliberate acronyms ("DPP"). Devanagari has no case, so the
  // title-case branch is a no-op for it, which is the correct behaviour.
  if (term === term.toUpperCase() && /[A-Z]/.test(term)) return term;
  return term.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function buildTitle(rule: Rule, s: Signals): string {
  const subject = s.courseTerm ?? s.work ?? s.assessment ?? s.material ?? s.schedule;
  return subject ? `${toDisplay(subject)} — ${rule.label}` : rule.label;
}

interface Scored {
  readonly key: string;
  readonly ruleIndex: number;
  readonly candidate: ExtractionCandidate;
}

function evaluateSentence(
  segment: TranscriptSegmentInput,
  segmentIndex: number,
  sentence: Sentence,
  sentenceIndex: number,
  courseTerms: readonly CompiledCue[],
): Scored[] {
  const s = readSignals(sentence.text, courseTerms);
  const veto = narrationVeto(s);

  // Char offsets are computed inside segment.text and then clamped into the
  // range the segment declares. When the two disagree in length -- a
  // normalizer that inserts markers, say -- clamping yields a coarse span
  // instead of one that points outside the segment. A citation that is wide is
  // usable; a citation that is confidently in the wrong place is not.
  const declaredLength = segment.charEnd - segment.charStart;
  const start = segment.charStart + sentence.offset;
  const charStart =
    declaredLength > 0 ? Math.min(start, segment.charEnd) : start;
  const rawEnd = charStart + sentence.text.length;
  const charEnd = declaredLength > 0 ? Math.min(rawEnd, segment.charEnd) : rawEnd;

  const out: Scored[] = [];
  RULES.forEach((rule, ruleIndex) => {
    if (!rule.fires(s)) return;
    if (rule.narrationProne && veto.vetoed) return;
    const confidence = score(rule, s);
    if (confidence < MIN_CONFIDENCE) return;

    // Suffixed rather than replaced: the base rule is still what fired, and
    // per-cue precision can only be measured if the cue keeps its identity.
    const matchedCue = s.courseTerm ? `${rule.id}+course_context` : rule.id;

    out.push({
      key: `${segmentIndex}:${sentenceIndex}`,
      ruleIndex,
      candidate: {
        kind: rule.kind,
        title: buildTitle(rule, s),
        detail: sentence.text.trim().replace(/\s+/g, " "),
        duePhrase: s.duePhrase,
        dueResolved: null,
        // The segment's own time range, not an interpolation within it. See
        // the note on these fields in types.ts.
        evidenceStartMs: segment.startMs,
        evidenceEndMs: segment.endMs,
        evidenceCharStart: charStart,
        evidenceCharEnd: charEnd,
        evidenceText: sentence.text,
        confidence,
        matchedCue,
      },
    });
  });
  return out;
}

// One candidate per sentence. Several rules fire on the same span routinely --
// a schedule announcement matches both the schedule rule and the generic
// material rule -- and emitting both would show a reviewer the same sentence
// twice, which is exactly the queue-flooding this method is trying to avoid.
//
// The cost is real and worth naming: a sentence that genuinely contains two
// different things ("assignment 3 is due Friday, and the exam covers chapter
// 5") yields one candidate. `detail` carries the whole sentence, so nothing is
// hidden from the reviewer, but they have to split it by hand.
function keepBestPerSentence(scored: readonly Scored[]): ExtractionCandidate[] {
  const best = new Map<string, Scored>();
  for (const item of scored) {
    const current = best.get(item.key);
    if (
      !current ||
      item.candidate.confidence > current.candidate.confidence ||
      (item.candidate.confidence === current.candidate.confidence &&
        item.ruleIndex < current.ruleIndex)
    ) {
      best.set(item.key, item);
    }
  }
  return [...best.values()]
    .map((item) => item.candidate)
    .sort(
      (a, b) =>
        a.evidenceStartMs - b.evidenceStartMs ||
        a.evidenceCharStart - b.evidenceCharStart,
    );
}

function extract(input: ExtractionInput): ExtractionCandidate[] {
  const courseTerms = deriveCourseTerms(input.courseContext);
  const scored: Scored[] = [];
  input.segments.forEach((segment, segmentIndex) => {
    splitSentences(segment.text).forEach((sentence, sentenceIndex) => {
      scored.push(
        ...evaluateSentence(segment, segmentIndex, sentence, sentenceIndex, courseTerms),
      );
    });
  });
  return keepBestPerSentence(scored);
}

export const rulesExtractionMethod: ExtractionMethod = {
  id: "rules",
  version: "1.0.0",
  displayName: "Cue matching (English / Hinglish / Devanagari)",
  extract,
};

// Exported for the self-test only. Not part of the ExtractionMethod contract
// and not for application use -- a caller that reaches past `extract` is
// coupling itself to this method's internals and defeats the point of the
// interface.
export const __internals = {
  findDuePhrase,
  splitSentences,
  readSignals,
  narrationVeto,
  deriveCourseTerms,
  MIN_CONFIDENCE,
};
