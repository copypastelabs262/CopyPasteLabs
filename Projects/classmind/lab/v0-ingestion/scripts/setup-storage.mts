// One-time infra setup: create the Storage bucket Milestone 2 needs.
// Not run per-request or wired into any route -- bucket provisioning is a
// deliberate, explicit command, not implicit magic inside a request handler.
//
// Runs outside the Next.js runtime, so it loads .env.local itself the way
// Next.js docs recommend for exactly this case (@next/env's loadEnvConfig),
// and talks to Supabase directly rather than importing
// src/lib/supabase/server.ts (which pulls in the `server-only` guard that
// has no meaning outside a bundled Next.js build).
//
// Run with: npm run setup:storage

import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
import { createClient } from "@supabase/supabase-js";
import {
  AUDIO_BUCKET as BUCKET_NAME,
  FILE_SIZE_LIMIT_BYTES,
  ALLOWED_MIME_TYPES,
} from "../src/lib/storage/runs-bucket.ts";

loadEnvConfig(process.cwd());

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env.local and fill in your Supabase project values.`,
    );
  }
  return value;
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: existing, error: getError } =
    await supabase.storage.getBucket(BUCKET_NAME);

  if (getError && !isNotFound(getError)) {
    throw new Error(`Could not check for existing bucket: ${getError.message}`);
  }

  if (existing) {
    console.log(`Bucket "${BUCKET_NAME}" already exists — leaving it as is.`);
    console.log(
      "To change its size/MIME limits, edit them in the Supabase dashboard " +
        "or extend this script with updateBucket() explicitly.",
    );
    return;
  }

  const { error: createError } = await supabase.storage.createBucket(
    BUCKET_NAME,
    {
      public: false,
      fileSizeLimit: FILE_SIZE_LIMIT_BYTES,
      allowedMimeTypes: ALLOWED_MIME_TYPES,
    },
  );

  if (createError) {
    throw new Error(`Could not create bucket: ${createError.message}`);
  }

  console.log(`Created bucket "${BUCKET_NAME}".`);
  console.log(`  fileSizeLimit: ${FILE_SIZE_LIMIT_BYTES} bytes (500 MiB)`);
  console.log(`  allowedMimeTypes: ${ALLOWED_MIME_TYPES.join(", ")}`);
}

function isNotFound(error: { status?: number }): boolean {
  return error.status === 404;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
