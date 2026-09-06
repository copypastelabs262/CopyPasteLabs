// Asserts that the lecture bucket is actually configured the way the product
// assumes. Run with:
//
//   node --env-file=.env.local scripts/verify-storage-security.mts
//   npm run verify:storage
//
// FREE and LIVE. It reads bucket metadata with the service key and writes
// nothing. No provider is contacted, so it costs nothing to run and can be run
// as often as you like.
//
// WHY THIS EXISTS (2026-09-07, security audit)
//
// Every privacy guarantee about lecture audio rests on one setting that lives
// OUTSIDE this repository: `public: false` on the `lectures` bucket. If that
// bucket is public, every recording is world-readable by URL and no amount of
// application authorization matters -- the server's signed URLs become
// decoration.
//
// That setting is applied by scripts/setup-storage.mts, and DEPLOY.md tells the
// operator to run it "once against the project if the `lectures` bucket does not
// exist yet". An operator who creates the bucket in the Supabase dashboard
// instead -- where public/private is a toggle, and the wrong choice looks
// identical afterwards -- satisfies that condition and never runs the script. The
// bucket then has whatever the dashboard defaulted to, with no MIME allowlist and
// no size limit.
//
// setup-storage.mts already CONVERGES an existing bucket (it calls updateBucket
// with public:false), so the honest instruction is "always run it", and this
// script is how you check afterwards rather than assuming.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Run with: node --env-file=.env.local scripts/verify-storage-security.mts",
  );
  process.exit(1);
}

const BUCKET = "lectures";
const EXPECTED_SIZE_LIMIT = 52_428_800;

let failed = 0;
function check(ok: boolean, label: string, detail?: unknown): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) {
    failed += 1;
    if (detail !== undefined) console.log(`        got: ${JSON.stringify(detail)}`);
  }
}

const svc = createClient(url, key, { auth: { persistSession: false } });

const { data: buckets, error } = await svc.storage.listBuckets();
if (error) {
  console.error(`Could not list buckets: ${error.message}`);
  process.exit(1);
}

const bucket = (buckets ?? []).find((b) => b.name === BUCKET);
if (!bucket) {
  console.error(
    `FAIL  the "${BUCKET}" bucket does not exist. Run: npm run setup:db\n` +
      "      Until it does, no lecture can be uploaded.",
  );
  process.exit(1);
}

console.log(`--- ${BUCKET} bucket ---`);

// THE ONE THAT MATTERS. A public bucket makes every recording readable by
// anyone who can guess or obtain a URL, and lecture object keys are
// <lecture-uuid>/original.<ext> -- so a leaked lecture id is a leaked recording.
check(
  bucket.public === false,
  "the bucket is PRIVATE (audio reachable only through a short-lived signed URL)",
  { public: bucket.public },
);

// Defence in depth, not the primary control: the upload route canonicalises
// every accepted file to an audio/* type before it reaches storage. This stops a
// bucket that was created by hand from accepting anything at all.
const mimes = (bucket as { allowed_mime_types?: string[] | null }).allowed_mime_types ?? null;
check(
  Array.isArray(mimes) && mimes.length > 0 && mimes.every((m) => m.startsWith("audio/")),
  "the bucket admits audio/* only",
  { allowed_mime_types: mimes },
);

const limit = (bucket as { file_size_limit?: number | null }).file_size_limit ?? null;
check(
  typeof limit === "number" && limit > 0 && limit <= EXPECTED_SIZE_LIMIT,
  `the bucket enforces a size limit of at most ${EXPECTED_SIZE_LIMIT} bytes`,
  { file_size_limit: limit },
);

if (failed > 0) {
  console.log(
    `\n${failed} check(s) failed. Run \`npm run setup:db\` -- it converges an existing ` +
      "bucket to the correct settings and is safe to re-run.",
  );
} else {
  console.log("\nStorage configuration is correct.");
}
// `process.exitCode`, not `process.exit()`. Exiting immediately tears down the
// Supabase client's still-open handles and libuv asserts on Windows, which
// prints a scary line after a clean PASS run. Setting the code lets node drain
// and exit on its own.
process.exitCode = failed > 0 ? 1 : 0;
