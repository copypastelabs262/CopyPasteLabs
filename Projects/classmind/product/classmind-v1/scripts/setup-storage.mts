// Creates the storage bucket the product needs, idempotently.
//
//   node --env-file=.env.local scripts/setup-storage.mts
//
// The SQL schema is applied separately (supabase/migrations/); this covers only
// the part of provisioning that is not SQL. Safe to re-run.
//
// It uses listBuckets() rather than probing getBucket() on purpose. Lab v0's
// version probed, and a missing bucket comes back from the SDK as `status` 400
// with `statusCode` "404" -- a STRING, in a different field -- so the existence
// check read as a fatal error and the bucket could never be created. Listing
// has no such ambiguity.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. See .env.example.");
  process.exit(1);
}

const BUCKET = "lectures";
// 50 MiB is the Supabase Free plan's GLOBAL ceiling, not a preference. A
// per-bucket limit above it is rejected outright at creation time.
const FILE_SIZE_LIMIT = 52_428_800;
const ALLOWED = [
  "audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4",
  "audio/m4a", "audio/webm", "audio/ogg",
];

const svc = createClient(url, key, { auth: { persistSession: false } });

const { data: buckets, error: listError } = await svc.storage.listBuckets();
if (listError) {
  console.error(`Could not list buckets: ${listError.message}`);
  process.exit(1);
}

const existing = (buckets ?? []).find((b) => b.name === BUCKET);
if (existing) {
  console.log(`Bucket "${BUCKET}" already exists (public=${existing.public}, limit=${existing.file_size_limit}). Nothing to do.`);
  process.exit(0);
}

// Private. Audio is reached only through short-lived signed URLs minted by a
// server route that has already checked who is asking.
const { error: createError } = await svc.storage.createBucket(BUCKET, {
  public: false,
  fileSizeLimit: FILE_SIZE_LIMIT,
  allowedMimeTypes: ALLOWED,
});
if (createError) {
  console.error(`Could not create bucket "${BUCKET}": ${createError.message}`);
  process.exit(1);
}
console.log(`Created private bucket "${BUCKET}" (limit ${FILE_SIZE_LIMIT} bytes).`);
