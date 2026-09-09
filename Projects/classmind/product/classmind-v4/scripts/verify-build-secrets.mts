// Does the build output contain live secrets? Run with:
//
//   npm run verify:build-secrets
//
// FREE and offline. Reads .env.local and greps the build output for those exact
// values. Never prints a secret -- only which variable, how many files, and one
// example path.
//
// TWO QUESTIONS, AND THEY HAVE DIFFERENT ANSWERS
//
//   .next/static/**   The CLIENT bundle. A server secret here is CRITICAL: it is
//                     served to every visitor. This check must always pass.
//
//   .next/cache/**    Turbopack's persistent build cache. Verified 2026-09-07:
//                     it stores the resolved values of the environment it read,
//                     in CLEARTEXT, and it does so again on every build -- so
//                     deleting it is housekeeping, not a fix.
//
// WHY THE CACHE MATTERS EVEN THOUGH .next IS GIT-IGNORED
//
// It is not published to GitHub, and that is genuinely the important half. What
// remains is that `.env.local` was deliberately kept out of the repository while
// the same values sit in a build artefact nobody thinks of as secret:
//
//   - zipping or copying the project folder carries live API keys, even though
//     the one file everyone knows to exclude was excluded;
//   - a shared or remote build cache (Turborepo, Vercel Remote Cache, a CI
//     artifact upload, a Docker layer) carries them off the machine;
//   - a backup of a developer's working directory contains them in cleartext.
//
// There is no code fix here -- this is how the bundler's cache works. The
// mitigation is knowing, so the rule can be "treat .next as secret-bearing"
// rather than "we exclude .env.local, so we are fine". This script is that
// knowing.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath, not .pathname: this directory name contains spaces, and a
// URL pathname percent-encodes them, which produces a path that exists nowhere.
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ENV = join(ROOT, ".env.local");
const NEXT = join(ROOT, ".next");

if (!existsSync(ENV)) {
  console.log("No .env.local — nothing to compare against. Skipping.");
  process.exit(0);
}
if (!existsSync(NEXT)) {
  console.log("No .next — run `npm run build` first. Skipping.");
  process.exit(0);
}

// Only values long enough to be a real credential, and only server-side ones:
// NEXT_PUBLIC_* are in the client bundle BY DESIGN (the anon key is
// publishable, and every table has RLS on with zero policies, so it can read
// nothing).
const secrets = new Map<string, string>();
for (const line of readFileSync(ENV, "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const [rawKey, ...rest] = t.split("=");
  const key = rawKey.trim();
  const value = rest.join("=").trim().replace(/^["']|["']$/g, "");
  if (value.length >= 20 && !key.startsWith("NEXT_PUBLIC_")) secrets.set(key, value);
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function scan(dir: string): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of walk(dir)) {
    let data: Buffer;
    try {
      data = readFileSync(file);
    } catch {
      continue;
    }
    for (const [key, value] of secrets) {
      if (data.includes(value)) {
        if (!found.has(key)) found.set(key, []);
        found.get(key)!.push(file.slice(ROOT.length));
      }
    }
  }
  return found;
}

console.log(`Comparing ${secrets.size} server-side value(s) from .env.local against the build.\n`);

let failed = 0;

// ---- the one that must never happen -------------------------------------
const client = scan(join(NEXT, "static"));
if (client.size === 0) {
  console.log("PASS  no server secret in .next/static (the client bundle)");
} else {
  failed += 1;
  console.log("FAIL  SERVER SECRET IN THE CLIENT BUNDLE — this is served to every visitor:");
  for (const [key, files] of client) {
    console.log(`        ${key}: ${files.length} file(s), e.g. ${files[0]}`);
  }
}

// ---- the one that is expected, and is reported rather than asserted ------
const cache = scan(join(NEXT, "cache"));
if (cache.size === 0) {
  console.log("PASS  no server secret in .next/cache");
} else {
  console.log(
    `NOTE  ${cache.size} server value(s) are in the Turbopack build cache, in cleartext:`,
  );
  for (const [key, files] of cache) {
    console.log(`        ${key}: ${files.length} file(s), e.g. ${files[0]}`);
  }
  console.log(
    "      This is how the bundler's persistent cache works and it comes back on\n" +
      "      every build. .next is git-ignored, so it is NOT published — but treat\n" +
      "      .next as secret-bearing: do not zip it, do not upload it as a CI\n" +
      "      artifact, and do not enable a shared/remote build cache without\n" +
      "      knowing these values travel with it.",
  );
}

console.log(failed > 0 ? "\nFAILED" : "\nNo secret is served to the browser.");
process.exitCode = failed > 0 ? 1 : 0;
