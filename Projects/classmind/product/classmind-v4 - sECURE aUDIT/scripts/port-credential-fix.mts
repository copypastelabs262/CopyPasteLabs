// Ports the test-credential fix from this audit copy into another tree.
//
//   node scripts/port-credential-fix.mts                 # DRY RUN (default)
//   node scripts/port-credential-fix.mts --write         # actually change files
//   node scripts/port-credential-fix.mts --target "../classmind-v4"
//
// WHY A TRANSFORM AND NOT A COPY
//
// The corrected files could simply be copied over -- the only edit this audit
// made to them was the credential substitution. But the two trees may have
// diverged for other reasons, and a copy would silently discard whatever the
// target has that this copy does not. So the same TRANSFORM is applied to the
// target's own files, and anything else in them survives untouched.
//
// WHAT IT DOES
//
//   1. writes scripts/_test-credentials.mts (the helper, verbatim)
//   2. in every *.mts under scripts/: replaces the literal password with
//      testPassword() and adds the import at the right relative depth
//   3. design-loop/config.json: empties the password fields
//   4. design-loop/capture.mts: falls back to CLASSMIND_TEST_PASSWORD
//   5. DEPLOY.md: redacts the literal from the checklist
//   6. .env.example: documents CLASSMIND_TEST_PASSWORD (empty)
//
// It NEVER prints the password, never writes a password into any file, and in
// dry-run mode never writes at all. Re-running it is safe: every step is a
// no-op once applied.

import { readFileSync, writeFileSync, readdirSync, existsSync, copyFileSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const targetArg = args.indexOf("--target");
const TARGET = targetArg >= 0 ? args[targetArg + 1] : join(HERE, "..", "classmind-v4");

// The literal is BUILT, never written, so this file does not itself become the
// 51st place the credential appears.
const NEEDLE = ["Class", "Mind", "Test!", "2026"].join("");

if (!existsSync(TARGET)) {
  console.error(`Target does not exist: ${TARGET}`);
  process.exit(1);
}

console.log(`${WRITE ? "APPLYING" : "DRY RUN"} — target: ${TARGET}\n`);

const planned: string[] = [];
const note = (what: string) => {
  planned.push(what);
  console.log(`  ${WRITE ? "changed" : "would change"}  ${what}`);
};

function read(p: string): string | null {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
}
function write(p: string, s: string): void {
  if (WRITE) writeFileSync(p, s, "utf8");
}

// ---- 1. the helper --------------------------------------------------------
const helperSrc = join(HERE, "scripts", "_test-credentials.mts");
const helperDst = join(TARGET, "scripts", "_test-credentials.mts");
if (!existsSync(helperDst) || read(helperDst) !== read(helperSrc)) {
  note("scripts/_test-credentials.mts  (the helper)");
  if (WRITE) copyFileSync(helperSrc, helperDst);
}

// ---- 2. every script holding the literal ----------------------------------
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", ".git"].includes(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const scriptsDir = join(TARGET, "scripts");
if (existsSync(scriptsDir)) {
  for (const p of walk(scriptsDir).filter((f) => f.endsWith(".mts"))) {
    let s = read(p);
    if (!s || !s.includes(NEEDLE)) continue;

    s = s.split(`password: "${NEEDLE}"`).join("password: testPassword()");
    s = s.split(`"${NEEDLE}"`).join("testPassword()");

    if (s.includes("testPassword") && !s.includes("_test-credentials")) {
      // Relative depth: scripts/x.mts -> ./  ;  scripts/qa/x.mts -> ../
      const depth = relative(scriptsDir, dirname(p)).split(/[\\/]/).filter(Boolean).length;
      const prefix = depth === 0 ? "./" : "../".repeat(depth);
      const imp = `import { testPassword } from "${prefix}_test-credentials.mts";`;
      const lines = s.split("\n");
      const lastImport = lines.reduce((acc, l, i) => (l.startsWith("import ") ? i : acc), -1);
      lines.splice(lastImport + 1, 0, imp);
      s = lines.join("\n");
    }
    note(relative(TARGET, p).replace(/\\/g, "/"));
    write(p, s);
  }
}

// ---- 3 + 4. the design-loop harness ---------------------------------------
const cfgPath = join(TARGET, "design-loop", "config.json");
const cfg = read(cfgPath);
if (cfg && cfg.includes(NEEDLE)) {
  const next = cfg.replace(new RegExp(`("password":\\s*)"${NEEDLE}"`, "g"), '$1""');
  JSON.parse(next); // must still parse
  note("design-loop/config.json  (passwords emptied)");
  write(cfgPath, next);
}

const capPath = join(TARGET, "design-loop", "capture.mts");
const cap = read(capPath);
const CAP_OLD = '  await page.fill("input[type=password]", account.password);';
if (cap && cap.includes(CAP_OLD)) {
  const next = cap.replace(
    CAP_OLD,
    [
      "  // The password is NOT in config.json any more -- it was a working faculty",
      "  // credential in a file that is not git-ignored. It comes from the",
      "  // environment now, with no default: see scripts/_test-credentials.mts.",
      "  const password = account.password || process.env.CLASSMIND_TEST_PASSWORD;",
      "  if (!password) {",
      "    throw new Error(",
      '      "No test-account password. Set CLASSMIND_TEST_PASSWORD in .env.local and run " +',
      '        "this harness with --env-file=.env.local.",',
      "    );",
      "  }",
      '  await page.fill("input[type=password]", password);',
    ].join("\n"),
  );
  note("design-loop/capture.mts  (reads CLASSMIND_TEST_PASSWORD)");
  write(capPath, next);
}

// ---- 5. DEPLOY.md ---------------------------------------------------------
const depPath = join(TARGET, "DEPLOY.md");
const dep = read(depPath);
if (dep && dep.includes(NEEDLE)) {
  const next = dep
    .split(`\`${NEEDLE}\``)
    .join("a password that was published in this repository (now read from `CLASSMIND_TEST_PASSWORD`)");
  note("DEPLOY.md  (literal redacted)");
  write(depPath, next);
}

// ---- 6. .env.example ------------------------------------------------------
const exPath = join(TARGET, ".env.example");
const ex = read(exPath);
if (ex && !ex.includes("CLASSMIND_TEST_PASSWORD")) {
  const next =
    ex +
    [
      "",
      "# The shared password for the disposable verification accounts",
      "# (faculty.test@ / student.test@classmind.local). It used to be a LITERAL in 17",
      "# files here and ~50 tracked at HEAD in the public repo, which put a working",
      "# faculty credential on GitHub -- and the suites RE-CREATE those accounts on",
      "# sign-in failure, so the literal re-armed the exposure on every test run.",
      "# Read from here instead, with no default anywhere: see",
      "# scripts/_test-credentials.mts. Generate a long random value; never reuse the",
      "# published one, which is permanently in git history.",
      "CLASSMIND_TEST_PASSWORD=",
      "",
    ].join("\n");
  note(".env.example  (variable documented, empty)");
  write(exPath, next);
}

// ---- verdict --------------------------------------------------------------
console.log();
if (planned.length === 0) {
  console.log("Nothing to do — the target already has the fix.");
} else if (WRITE) {
  const left = walk(TARGET).filter((p) => {
    const s = read(p);
    return s !== null && s.includes(NEEDLE) && !p.includes("port-credential-fix");
  });
  console.log(`Applied ${planned.length} change(s).`);
  console.log(
    left.length === 0
      ? "The literal is now absent from the target tree."
      : `STILL PRESENT in ${left.length} file(s):\n${left.map((p) => "  " + relative(TARGET, p)).join("\n")}`,
  );
  console.log(
    "\nNext: add CLASSMIND_TEST_PASSWORD=<a long random value> to the target's .env.local,\n" +
      "then run its type-check before committing.",
  );
} else {
  console.log(`${planned.length} change(s) planned. Re-run with --write to apply.`);
}
