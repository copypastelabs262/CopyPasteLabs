// Self-test for the transcript guard.
//
//   node scripts/test-transcript-guard.mts
//
// Runs against REAL provider output only. Every long sample below is a
// transcript some real recording actually produced; the short samples are
// truncations of those, so the words are real and only the length is chosen.
// Nothing here is invented prose, because the thing being tested is whether a
// crude statistic separates genuine lecture speech from fluent wrong-language
// text, and only real output can answer that.
//
// The decisive case is fft-lecture-misdetected: an English DSP lecture returned
// as romanized Arabic with the engine reporting en-IN. Its 65-word truncation
// is the exact shape that defeated the previous guard in production. If this
// suite ever goes green with that sample passing, the guard is dead again.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { validateTranscript } from "../src/lib/provenance/transcript-validation.ts";

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
const fixtures = new Map<string, { transcript: string; languageCode: string | null }>();
for (const file of readdirSync(DIR).filter((f) => f.endsWith(".json"))) {
  const raw = JSON.parse(readFileSync(join(DIR, file), "utf8"));
  fixtures.set(raw.slug, {
    transcript: raw.rawResponse.transcript ?? "",
    languageCode: raw.rawResponse.language_code ?? null,
  });
}

function text(slug: string): string {
  const f = fixtures.get(slug);
  if (!f) throw new Error(`fixture missing: ${slug}`);
  return f.transcript;
}

// Truncation by words, so a "short clip" is real speech that happens to be
// short rather than a different kind of text.
function firstWords(s: string, n: number): string {
  return s.split(/\s+/).slice(0, n).join(" ");
}

const ENGLISH = "course-outline-en";
const HINGLISH = "cloud-computing-hinglish";
const HINDI = "physics-class12-hi";
const ARABIC = "fft-lecture-misdetected";

section("Fixtures load");
check(fixtures.size === 4, "all four captured responses are present", `${fixtures.size} found`);
check(
  fixtures.get(HINGLISH)!.transcript.split(/\s+/).length > 400,
  "the genuine romanized-Hinglish excerpt is present -- the case with the least evidence before now",
  `${fixtures.get(HINGLISH)!.transcript.split(/\s+/).length} words`,
);

section("THE FAILURE THIS GUARD EXISTS FOR (romanized Arabic for an English lecture)");

check(
  fixtures.get(ARABIC)!.languageCode === "en-IN",
  "the misdetected run reported en-IN, so no metadata check can ever see it",
  `reported ${fixtures.get(ARABIC)!.languageCode}`,
);
{
  const full = validateTranscript(text(ARABIC));
  check(full.verdict === "reject", "full transcript is REJECTED", JSON.stringify(full.metrics));
  check(full.code === "not_a_supported_language", "rejected for the right reason", `${full.code}`);
}
// The production shape: a 65-token clip. The old guard refused to judge below
// 120 tokens and let exactly this through.
for (const n of [40, 65, 110]) {
  const r = validateTranscript(firstWords(text(ARABIC), n));
  check(
    r.verdict === "reject",
    `${n}-word clip is REJECTED (the old 120-token floor let this through)`,
    JSON.stringify(r.metrics),
  );
}

section("Genuine lectures pass -- at full length AND truncated");

for (const [label, slug] of [["English", ENGLISH], ["Hinglish", HINGLISH], ["Devanagari Hindi", HINDI]] as const) {
  const full = validateTranscript(text(slug));
  check(full.verdict === "pass", `genuine ${label} lecture passes`, JSON.stringify(full.metrics));
  for (const n of [40, 65, 110]) {
    const r = validateTranscript(firstWords(text(slug), n));
    check(
      r.verdict === "pass",
      `genuine ${label}, ${n}-word clip passes -- short is not rejected for being short`,
      JSON.stringify(r.metrics),
    );
  }
}

section("The guard does not depend on the configured language");
// This is the property the old guard lacked, and the reason it produced false
// positives on real recordings. validateTranscript takes no language argument
// at all, so these cases cannot exist by construction -- but the transcripts
// are checked anyway, because "cannot happen by construction" is how the last
// guard was described too.
check(
  validateTranscript(text(HINDI)).verdict === "pass",
  "a Devanagari Hindi revision class passes -- the old guard flagged it when the course was set to en-IN",
);
check(
  validateTranscript(firstWords(text(HINGLISH), 40)).verdict === "pass",
  "a short romanized-Hinglish clip passes -- the old guard flagged it when the course was set to hi-IN",
);

section("Unrelated scripts are caught directly, without statistics");
// The lexical test alone cannot do this job. A 21-token Arabic-script sample
// scores a Wilson upper bound of 0.155, just above threshold, and a Chinese
// sample tokenizes as ONE word because CJK has no spaces. Script is observed
// from the characters and needs no sample-size allowance.
const SCRIPTS: Array<[string, string]> = [
  ["Arabic script", "أهلا بكم يا أصدقاء في عائلة هندسة المراحل في هذا الفيديو سأقوم بحل مسألة"],
  ["Cyrillic", "Здравствуйте друзья сегодня мы будем говорить о алгоритме быстрого преобразования"],
  ["Chinese (no spaces: one token)", "大家好今天我们要讨论快速傅里叶变换算法以及它在信号处理中的应用"],
  ["Tamil (Indic, but not a supported language)", "வணக்கம் நண்பர்களே இன்று நாம் விரைவு உருமாற்ற வழிமுறை பற்றி பேசப் போகிறோம்"],
];
for (const [label, sample] of SCRIPTS) {
  const r = validateTranscript(sample);
  check(
    r.verdict === "reject" && r.code === "unsupported_script",
    `${label} is rejected as an unsupported script`,
    `${r.verdict}/${r.code} ${JSON.stringify(r.metrics)}`,
  );
}
check(
  validateTranscript(text(HINDI)).metrics.foreignScriptRate === 0,
  "and a genuine Devanagari lecture registers ZERO foreign script -- the axis is silent when it should be",
);

section("Degenerate input is refused, never passed through");
for (const [label, sample] of [["empty", ""], ["whitespace", "   \n  "], ["punctuation only", "... --- ,,,"]] as const) {
  const r = validateTranscript(sample);
  check(r.verdict === "reject" && r.code === "empty", `${label} input is rejected`, `${r.verdict}/${r.code}`);
}
{
  // A near-silent or truncated upload. The old guard called this "not judged"
  // and returned no limitation, which reads identically to "checked and fine".
  const r = validateTranscript("Ahlanan bikum ya asdiqa fi ailati handasati almarahi.");
  check(
    r.verdict === "reject" && r.code === "too_short_to_validate",
    "a sample too short to validate is rejected as unvalidatable, not silently passed",
    `${r.verdict}/${r.code} tokens=${r.metrics.tokenCount}`,
  );
}
{
  // ...and the same length of GENUINE speech gets the same verdict. The guard
  // is honest about what it cannot do rather than pretending short English is
  // safe and short Arabic is not -- at this length it genuinely cannot tell.
  const r = validateTranscript(firstWords(text(ENGLISH), 12));
  check(
    r.code === "too_short_to_validate",
    "a 12-word GENUINE clip gets the same verdict -- the limit is the evidence, not the language",
    `${r.verdict}/${r.code}`,
  );
}

section("Separation margin (this is what makes a crude test safe)");
{
  const worstGenuine = Math.min(
    ...[ENGLISH, HINGLISH, HINDI].flatMap((s) =>
      [40, 65, 110, 0].map((n) => validateTranscript(n ? firstWords(text(s), n) : text(s)).metrics.supportedRate),
    ),
  );
  const bestBad = Math.max(
    ...[40, 65, 110, 0].map((n) =>
      validateTranscript(n ? firstWords(text(ARABIC), n) : text(ARABIC)).metrics.supportedRateUpperBound,
    ),
  );
  console.log(`        worst genuine sample:        ${worstGenuine}`);
  console.log(`        best wrong-language sample:  ${bestBad} (optimistic bound)`);
  check(worstGenuine > bestBad * 2, "genuine and wrong-language samples are separated by more than 2x", `${worstGenuine} vs ${bestBad}`);
}

section("Summary");
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
