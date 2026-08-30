// Is this transcript usable as evidence at all?
//
// WHAT WENT WRONG, AND WHY THE PREVIOUS VERSION COULD NOT CATCH IT
//
// On 2026-08-22, on a live production call, Sarvam returned fluent romanized
// ARABIC for an English DSP lecture. Three guards existed. All three stayed
// silent:
//
//   metadata mismatch    the engine reported en-IN, which is exactly what the
//                        run was configured with -- the check compared two
//                        fields that agree by construction.
//   engine confidence    live batch responses carry NO language_probability at
//                        all. The heuristic only ever worked on the captured
//                        fixtures, which happen to have it.
//   transcript text      the clip was 65 tokens, under a 120-token floor, so
//                        the one check that reads the actual text refused to
//                        run. The signal was perfect -- 0.000 English function
//                        words against 0.427 for the genuine English clip in
//                        the same run. The FLOOR failed, not the signal.
//
// Three lessons are encoded below.
//
// 1. NEVER ASK "DOES THIS MATCH THE CONFIGURED LANGUAGE?"
//    That question makes the guard depend on a setting, and the setting is the
//    thing that was already wrong. Worse, it produces false positives on real
//    lectures: measured on genuine recordings, a Devanagari Hindi revision
//    class in a course configured en-IN, and a short romanized-Hinglish clip in
//    a course configured hi-IN, are BOTH flagged by a configured-language
//    check -- and both are perfectly good transcripts. Hinglish is genuinely
//    two languages at once; no single configured code describes it.
//
//    So this asks a different question: is the transcript plausibly ANY
//    language this product serves? A wrong-language transcript fails that test
//    without anyone having to know what the right language was.
//
// 2. A SHORT SAMPLE IS JUDGED, NOT EXEMPTED.
//    Less text means more uncertainty, not less checking. The rate is scored
//    with a Wilson interval and the transcript is rejected only when even the
//    optimistic end of that interval is below threshold. A 40-token clip with
//    zero supported words has a Wilson upper bound of 0.088 and is rejected; a
//    40-token clip of genuine Hinglish scores 0.500 and passes comfortably.
//    Sample size changes how much evidence is demanded, never whether the
//    question is asked.
//
// 3. SCRIPT IS OBSERVED, NOT INFERRED.
//    A transcript in Arabic script, Cyrillic or Chinese needs no statistics --
//    the characters say so directly. Measured: the lexical test alone lets a
//    21-token Arabic-script sample through (Wilson upper 0.155) and cannot see
//    a Chinese one at all, because CJK has no spaces and tokenizes as a single
//    word. The script axis catches both instantly and stays silent on every
//    genuine sample. The two axes are orthogonal and both are required.
//
// CALIBRATION. Measured over every real transcript on hand -- a genuine
// English lecture, a genuine Devanagari Hindi lecture, a genuine 23-minute
// romanized-Hinglish lecture, and the Arabic failure -- plus truncations of
// each to 40, 65 and 110 words:
//
//   worst genuine full transcript      0.441   (romanized Hinglish)
//   worst genuine 40-word clip         0.350   (English)
//   the Arabic failure, full           0.049
//   the Arabic failure, 65 words       0.000
//
// An order of magnitude apart at every length, which is why a crude test is
// enough and why the threshold exact value buys nothing.
//
// WHAT THIS IS NOT. It is not a language identifier and does not try to name
// the language it is looking at. It contains no Arabic word list and nothing
// derived from the one lecture that failed: adding those would tune the guard
// to a single transcript, and the next wrong language would not be Arabic.
// It tests for the PRESENCE of what every lecture this product serves must
// contain, which is a property of the corpus rather than of any one recording.
//
// Pure. No imports, no clock, no I/O, so it runs directly under node.

// ---------------------------------------------------------------------------
// Supported languages
// ---------------------------------------------------------------------------
//
// Adding a language to the product means adding its function words AND its
// script below. A language present in one list and absent from the other will
// either be quarantined on sight or silently trusted.

// The commonest closed-class English words. Function words are used rather
// than content words because they are the highest-frequency and most
// ASR-stable part of any speech, and because they do not depend on the
// subject: a chemistry lecture and a networking lecture share these and share
// almost nothing else.
const ENGLISH_FUNCTION_WORDS = new Set([
  "the", "of", "and", "to", "a", "in", "is", "that", "it", "for", "on",
  "we", "are", "as", "with", "this", "be", "by", "will", "you", "can",
  "have", "not", "from", "at", "an", "or", "so", "if", "but", "which",
  "what", "when", "there", "these", "they", "our", "your", "was", "were",
  "he", "she", "his", "her", "them", "then", "than", "how", "why", "who",
  "its", "also", "just", "now", "here", "all", "one", "two", "do", "does",
  "did", "been", "being", "into", "about", "up", "out", "more", "some",
  "such", "no", "only", "other", "because", "after", "before", "over",
  "very", "most", "us", "me", "my",
]);

// Romanized Hindi. Deliberately excludes tokens that collide with English --
// me, hi, to, par and so are all frequent English words, and including them
// made an English transcript score 9% Hindi, which is the kind of accidental
// pass this exists to prevent. Since the two sets are only ever unioned here,
// a collision would inflate the score of any Latin-script text whatsoever,
// including a wrong-language one.
const HINDI_FUNCTION_WORDS = new Set([
  "hai", "hain", "ke", "ki", "ka", "ko", "mein", "aur", "ye", "yah",
  "woh", "wo", "nahi", "nahin", "kya", "karna", "karte", "karta", "karo",
  "bhi", "jo", "tha", "thi", "raha", "rahe", "rahi", "kar", "liye",
  "aap", "hum", "apna", "abhi", "phir", "toh", "gaya", "gaye", "diya",
  "hota", "hoti", "hote", "hoga", "sakte", "sakta", "yahan", "wahan",
  "isko", "usko", "iska", "uska", "agar", "lekin", "matlab", "dekho",
  "samajh", "chalo", "thoda", "bahut", "sab", "kuch", "koi", "jab", "tab",
]);

const LATIN = /\p{Script=Latin}/u;
const DEVANAGARI = /\p{Script=Devanagari}/u;
const LETTER = /\p{L}/u;
const TOKEN = /[\p{L}'\u0900-\u097F]+/gu;

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

// Below this share of supported-language tokens, the text is not a language
// this product serves. Sits in the measured gap between 0.114 (the optimistic
// bound on the worst wrong-language sample) and 0.350 (the worst genuine clip).
const MIN_SUPPORTED_RATE = 0.15;

// Share of letters that may belong to neither supported script before the
// transcript is rejected outright. Generous: real transcripts contain stray
// characters, and a genuine Devanagari lecture still measured 0.00 here.
const MAX_FOREIGN_SCRIPT_RATE = 0.2;

// Below this many tokens the lexical test cannot separate a wrong-language
// transcript from a short legitimate one -- measured: the Arabic failure is
// caught from 24 tokens up and is indistinguishable below it.
//
// A transcript this short is NOT passed through. It is rejected as
// unvalidatable, which is the honest verdict and the one the pipeline can act
// on. This does not reject legitimate short lectures: 24 tokens is roughly ten
// seconds of speech. The 65-token sample that defeated the old guard was a
// 40-second test clip, not a lecture. Any real recording clears this by two
// orders of magnitude.
const MIN_TOKENS_TO_VALIDATE = 24;

export type TranscriptVerdict = "pass" | "uncertain" | "reject";

export type TranscriptRejectionCode =
  | "empty"
  | "too_short_to_validate"
  | "unsupported_script"
  | "not_a_supported_language";

export interface TranscriptValidation {
  verdict: TranscriptVerdict;
  // Machine-readable cause. Null when the transcript passed.
  code: TranscriptRejectionCode | null;
  // Human-readable, written for a faculty member rather than an engineer.
  reason: string | null;
  metrics: {
    tokenCount: number;
    letterCount: number;
    // Share of tokens that are a function word in a supported language, or
    // carry Devanagari. This is the primary signal.
    supportedRate: number;
    // The optimistic end of the Wilson interval on supportedRate. Rejection
    // requires even this to be below threshold.
    supportedRateUpperBound: number;
    latinRate: number;
    devanagariRate: number;
    foreignScriptRate: number;
  };
}

// Wilson score interval. Chosen over the normal approximation because it stays
// correct at small n and at rates near zero -- exactly where this is used, and
// exactly where the normal approximation returns a zero-width interval for zero
// successes and would make a 0-of-40 sample look certain.
function wilsonInterval(successes: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = successes / n;
  const denominator = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denominator;
  const spread = (z / denominator) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, centre - spread), Math.min(1, centre + spread)];
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function validateTranscript(transcript: string): TranscriptValidation {
  const text = typeof transcript === "string" ? transcript : "";
  const tokens = text.toLowerCase().match(TOKEN) ?? [];

  // Script is measured over letters, not tokens, because a script with no word
  // separators -- Chinese, Japanese -- collapses to a single token and would
  // otherwise be invisible to any token-based test.
  let latin = 0;
  let devanagari = 0;
  let letters = 0;
  for (const ch of text) {
    if (!LETTER.test(ch)) continue;
    letters += 1;
    if (LATIN.test(ch)) latin += 1;
    else if (DEVANAGARI.test(ch)) devanagari += 1;
  }
  const foreign = letters - latin - devanagari;

  let supported = 0;
  for (const token of tokens) {
    if (
      DEVANAGARI.test(token) ||
      ENGLISH_FUNCTION_WORDS.has(token) ||
      HINDI_FUNCTION_WORDS.has(token)
    ) {
      supported += 1;
    }
  }

  const supportedRate = tokens.length > 0 ? supported / tokens.length : 0;
  const [, upperBound] = wilsonInterval(supported, tokens.length);
  const foreignScriptRate = letters > 0 ? foreign / letters : 0;

  const metrics = {
    tokenCount: tokens.length,
    letterCount: letters,
    supportedRate: round(supportedRate),
    supportedRateUpperBound: round(upperBound),
    latinRate: round(letters > 0 ? latin / letters : 0),
    devanagariRate: round(letters > 0 ? devanagari / letters : 0),
    foreignScriptRate: round(foreignScriptRate),
  };

  if (letters === 0) {
    return {
      verdict: "reject",
      code: "empty",
      reason:
        "The transcript contains no words. The recording produced no usable speech, " +
        "so there is nothing to extract knowledge from.",
      metrics,
    };
  }

  // Script first: it is a direct observation and needs no sample-size
  // allowance. A transcript written in a script this product does not serve is
  // wrong regardless of how much of it there is.
  if (foreignScriptRate > MAX_FOREIGN_SCRIPT_RATE) {
    return {
      verdict: "reject",
      code: "unsupported_script",
      reason:
        `${(foreignScriptRate * 100).toFixed(0)}% of this transcript is written in a script ` +
        "this product does not support -- it is neither Latin nor Devanagari. The " +
        "transcription engine has returned text in the wrong language.",
      metrics,
    };
  }

  if (tokens.length < MIN_TOKENS_TO_VALIDATE) {
    return {
      verdict: "reject",
      code: "too_short_to_validate",
      reason:
        `The transcript is ${tokens.length} words long, which is too short to confirm it is ` +
        "in the right language. The transcription engine has previously returned fluent " +
        "text in an unrelated language, so a transcript this short is not trusted rather " +
        "than assumed correct. This usually means the recording was near-silent or the " +
        "upload was truncated.",
      metrics,
    };
  }

  // Reject only when even the optimistic end of the interval is below
  // threshold. This is the direction that protects legitimate short lectures:
  // being generous about sampling error can only ever turn a rejection into a
  // warning, never the reverse.
  if (upperBound < MIN_SUPPORTED_RATE) {
    return {
      verdict: "reject",
      code: "not_a_supported_language",
      reason:
        `Only ${(supportedRate * 100).toFixed(1)}% of this transcript words are common ` +
        "English or Hindi words, against 35-100% in every verified lecture. The " +
        "transcription engine has returned text that is not in English, Hindi or " +
        "Hinglish -- it has previously returned fluent romanized Arabic for an English " +
        "lecture while reporting the language as English, so its own report is not " +
        "evidence that this is correct.",
      metrics,
    };
  }

  // Below threshold but not confidently so. Not enough to refuse the lecture,
  // too little to stay silent about.
  if (supportedRate < MIN_SUPPORTED_RATE) {
    return {
      verdict: "uncertain",
      code: null,
      reason:
        `Only ${(supportedRate * 100).toFixed(1)}% of this transcript words are common ` +
        "English or Hindi words, which is lower than any verified lecture, but the " +
        "transcript is short enough that this may be chance. Read it before relying on it.",
      metrics,
    };
  }

  return { verdict: "pass", code: null, reason: null, metrics };
}
