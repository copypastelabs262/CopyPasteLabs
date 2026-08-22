// Self-test for the transcript language check.
//
//   node scripts/test-provenance.mts
//
// Runs against the three REAL Sarvam responses in fixtures/transcription/
// rather than synthetic strings, because the thing being tested is whether a
// crude heuristic separates a genuine transcript from a fluent wrong-language
// one, and only real output can answer that. The decisive case is
// fft-lecture-misdetected: an English lecture returned as romanized Arabic
// with the engine reporting en-IN. If this suite ever goes green on that
// fixture producing no limitation, the guard is dead again.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { checkTranscriptLanguage } from "../src/lib/provenance/language-check.ts";

let passed = 0;
let failed = 0;

function check(ok: boolean, label: string, detail?: string): void {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${label}`);
    return;
  }
  failed += 1;
  console.log(`  FAIL  ${label}`);
  if (detail) console.log(`        ${detail}`);
}

function section(title: string): void {
  console.log(`\n--- ${title} ---`);
}

const DIR = join(process.cwd(), "fixtures", "transcription");
const fixtures = new Map<string, { transcript: string; languageCode: string; probability: number }>();
for (const file of readdirSync(DIR).filter((f) => f.endsWith(".json"))) {
  const raw = JSON.parse(readFileSync(join(DIR, file), "utf8"));
  fixtures.set(raw.slug, {
    transcript: raw.rawResponse.transcript ?? "",
    languageCode: raw.rawResponse.language_code,
    probability: raw.rawResponse.language_probability,
  });
}

section("Fixtures load");
check(fixtures.size === 3, "all three captured responses are present", `${fixtures.size} found`);

section("The failure this guard exists for");

const arabic = fixtures.get("fft-lecture-misdetected")!;
const arabicCheck = checkTranscriptLanguage(arabic.transcript, "en-IN");
check(
  arabic.languageCode === "en-IN",
  "the misdetected run reported en-IN -- so the metadata mismatch check CANNOT see it",
  `reported ${arabic.languageCode}`,
);
check(
  arabicCheck.limitation !== null,
  "reading the text DOES catch it",
  JSON.stringify(arabicCheck),
);
check(
  arabicCheck.englishFunctionRatio < 0.1,
  "romanized Arabic scores near zero on English function words",
  `${arabicCheck.englishFunctionRatio}`,
);
check(
  (arabicCheck.limitation ?? "").includes("may be in the wrong language"),
  "the limitation says plainly that the language may be wrong",
);

section("Genuine transcripts are not flagged");

const english = fixtures.get("course-outline-en")!;
const englishCheck = checkTranscriptLanguage(english.transcript, "en-IN");
check(englishCheck.limitation === null, "a real English lecture passes", JSON.stringify(englishCheck));
check(
  englishCheck.englishFunctionRatio > 0.3,
  "a real English lecture is dense in English function words",
  `${englishCheck.englishFunctionRatio}`,
);

const hindi = fixtures.get("physics-class12-hi")!;
const hindiCheck = checkTranscriptLanguage(hindi.transcript, "hi-IN");
check(hindiCheck.limitation === null, "a Devanagari Hindi lecture passes", JSON.stringify(hindiCheck));
check(
  hindiCheck.devanagariRatio > 0.5,
  "the Hindi lecture is recognised by script, not by word list",
  `${hindiCheck.devanagariRatio}`,
);

section("The margin between pass and fail");
check(
  englishCheck.englishFunctionRatio > arabicCheck.englishFunctionRatio * 5,
  "the two English-configured runs are separated by more than 5x",
  `${englishCheck.englishFunctionRatio} vs ${arabicCheck.englishFunctionRatio}`,
);

section("Cross-language misconfiguration");
check(
  checkTranscriptLanguage(hindi.transcript, "en-IN").limitation !== null,
  "a Hindi transcript on an en-IN course is flagged",
);
check(
  checkTranscriptLanguage(english.transcript, "hi-IN").limitation !== null,
  "an English transcript on a hi-IN course is flagged",
);
check(
  checkTranscriptLanguage(arabic.transcript, "unknown").limitation === null,
  "`unknown` is never flagged here -- auto-detect carries its own limitation",
);

section("Refusal to judge on too little evidence");
check(
  checkTranscriptLanguage("Ahlanan bikum ya asdiqa.", "en-IN").limitation === null,
  "a short clip is not judged",
);
check(
  checkTranscriptLanguage("", "en-IN").limitation === null,
  "an empty transcript is not judged",
);
check(
  checkTranscriptLanguage(english.transcript, "de-DE").limitation === null,
  "an unrecognised configured language is not judged rather than guessed at",
);

section("Summary");
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
