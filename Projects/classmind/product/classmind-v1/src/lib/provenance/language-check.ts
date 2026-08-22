// Does the transcript look like the language the run was configured for?
//
// This exists because the guard that was supposed to catch Lab v0's worst
// failure does not catch it. On 2026-08-21 Sarvam returned fluent romanized
// ARABIC for an English engineering lecture -- and reported `language_code:
// "en-IN"`, the same code the run was configured with. The mismatch check in
// build.ts compares those two codes, so on the one run it was written for, it
// stays silent. The only thing that flagged that transcript was the engine's
// own 0.617 confidence, which cleared the 0.8 threshold by 0.183. At 0.85 the
// same Arabic text would have carried no warning at all.
//
// So this reads the TEXT rather than the metadata. It is deliberately crude:
// function words are the highest-frequency, most script-stable part of any
// language, and a transcript that is not in the language it claims has almost
// none of the right ones. Measured over the three captured fixtures:
//
//   real English (en-IN, p=0.846)        42.5% English function words
//   romanized Arabic (en-IN, p=0.617)     3.9%
//   Devanagari Hindi (hi-IN, p=0.999)    76.3% Devanagari characters
//
// An order of magnitude apart, which is why a crude test is enough. It is
// NOT calibrated -- three lectures is not a calibration -- so it only ever
// appends a limitation for a human to weigh. It never blocks a transcript and
// never edits one. If it is wrong, the cost is a sentence of extra caution.
//
// Pure. No imports, no clock, no I/O, so it can be run directly by node.

// The commonest closed-class English words. Chosen because they survive ASR
// noise and appear in any register of speech; content words would not.
const ENGLISH_FUNCTION_WORDS = new Set([
  "the", "of", "and", "to", "a", "in", "is", "that", "it", "for", "on",
  "we", "are", "as", "with", "this", "be", "by", "will", "you", "can",
  "have", "not", "from", "at", "an", "or", "so", "if", "but", "which",
  "what", "when", "there", "these", "they", "our", "your", "was", "were",
]);

// Romanized Hindi equivalents. Deliberately excludes tokens that collide with
// English -- "me", "hi", "to", "par", "so" are all frequent English words and
// including them made an English transcript score 9% "Hindi", which is exactly
// the kind of accidental pass this check exists to avoid.
const HINDI_FUNCTION_WORDS = new Set([
  "hai", "hain", "haiं", "ke", "ki", "ka", "ko", "mein", "aur", "ye", "yah",
  "woh", "wo", "nahi", "nahin", "kya", "karna", "karte", "karta", "karo",
  "bhi", "jo", "tha", "thi", "the", "raha", "rahe", "rahi", "kar", "liye",
  "aap", "hum", "apna", "abhi", "phir", "toh", "gaya", "gaye", "diya",
]);

const DEVANAGARI = /[ऀ-ॿ]/g;
const WORD = /[\p{L}'ऀ-ॿ]+/gu;

// Below this share of English function words, an en-IN transcript is not
// English. Set an order of magnitude above the observed failure (3.9%) and
// well below the observed pass (42.5%), because the gap is wide enough that
// precision in the threshold buys nothing.
const MIN_ENGLISH_FUNCTION_RATIO = 0.15;
// Either script satisfies hi-IN: Sarvam returns Devanagari in transcript mode
// and Latin in translit mode, and both are correct output for a Hindi course.
const MIN_DEVANAGARI_RATIO = 0.15;
const MIN_HINDI_FUNCTION_RATIO = 0.12;

// Short transcripts are not evidence. A 30-word clip can legitimately contain
// no function words, and warning on it would train a reader to ignore this.
const MIN_TOKENS_TO_JUDGE = 120;

export interface LanguageCheck {
  // Null when no check applies: an unrecognised configured language, a
  // transcript too short to judge, or `unknown` (which already carries its own
  // limitation for having been auto-detected).
  limitation: string | null;
  englishFunctionRatio: number;
  hindiFunctionRatio: number;
  devanagariRatio: number;
  tokenCount: number;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function checkTranscriptLanguage(
  transcript: string,
  configuredLanguage: string,
): LanguageCheck {
  const tokens = transcript.toLowerCase().match(WORD) ?? [];
  const total = tokens.length;
  const devanagariRatio =
    transcript.length > 0
      ? (transcript.match(DEVANAGARI) ?? []).length / transcript.length
      : 0;

  let english = 0;
  let hindi = 0;
  for (const token of tokens) {
    if (ENGLISH_FUNCTION_WORDS.has(token)) english += 1;
    if (HINDI_FUNCTION_WORDS.has(token)) hindi += 1;
  }
  const englishFunctionRatio = total > 0 ? english / total : 0;
  const hindiFunctionRatio = total > 0 ? hindi / total : 0;

  const base: Omit<LanguageCheck, "limitation"> = {
    englishFunctionRatio: round(englishFunctionRatio),
    hindiFunctionRatio: round(hindiFunctionRatio),
    devanagariRatio: round(devanagariRatio),
    tokenCount: total,
  };

  if (total < MIN_TOKENS_TO_JUDGE) return { ...base, limitation: null };

  if (configuredLanguage === "en-IN" && englishFunctionRatio < MIN_ENGLISH_FUNCTION_RATIO) {
    return {
      ...base,
      limitation:
        `The transcript does not read as English: only ${(englishFunctionRatio * 100).toFixed(1)}% ` +
        `of its words are common English function words, against ~42% in a verified English ` +
        `lecture. The engine has previously returned fluent romanized Arabic for an English ` +
        `lecture while reporting en-IN, so this transcript may be in the wrong language ` +
        `regardless of what the engine reported.`,
    };
  }

  if (
    configuredLanguage === "hi-IN" &&
    devanagariRatio < MIN_DEVANAGARI_RATIO &&
    hindiFunctionRatio < MIN_HINDI_FUNCTION_RATIO
  ) {
    return {
      ...base,
      limitation:
        `The transcript does not read as Hindi: ${(devanagariRatio * 100).toFixed(1)}% Devanagari ` +
        `characters and ${(hindiFunctionRatio * 100).toFixed(1)}% romanized Hindi function words, ` +
        `below the threshold for either script. This transcript may be in the wrong language.`,
    };
  }

  return { ...base, limitation: null };
}
