/**
 * Design Master Loop — technical verification.
 *
 *   node design-loop/verify.mts [--build] [--run <runId>] [--label <label>]
 *
 * Runs the free, offline checks that gate a design iteration:
 *   1. tsc --noEmit          (type correctness)
 *   2. eslint                (lint)
 *   3. next build            (only with --build; slower, catches route-level breakage)
 *
 * Never runs anything from the paid suite list in CLAUDE.md. Writes
 * verify--<label>.json into the run directory when --run is given, and always
 * exits non-zero if any check fails.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LOOP_DIR = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(LOOP_DIR, "..");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const withBuild = process.argv.includes("--build");
const runId = arg("run");
const label = arg("label") ?? "verify";

interface CheckResult {
  name: string;
  command: string;
  ok: boolean;
  durationMs: number;
  output: string;
}

function run(name: string, command: string, args: string[]): CheckResult {
  console.log(`\n── ${name}: ${command} ${args.join(" ")}`);
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd: APP_DIR,
    shell: true,
    encoding: "utf8",
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  const ok = result.status === 0;
  console.log(output.slice(-4000));
  console.log(ok ? `   ✓ ${name} passed` : `   ✗ ${name} FAILED (exit ${result.status})`);
  return { name, command: `${command} ${args.join(" ")}`, ok, durationMs: Date.now() - started, output: output.slice(-20000) };
}

const checks: CheckResult[] = [];
checks.push(run("typescript", "npx", ["tsc", "--noEmit"]));
checks.push(run("eslint", "npx", ["eslint", "."]));
if (withBuild) checks.push(run("build", "npx", ["next", "build"]));

const allOk = checks.every((c) => c.ok);

if (runId) {
  const outDir = resolve(LOOP_DIR, "runs", runId);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, `verify--${label}.json`),
    JSON.stringify(
      { at: new Date().toISOString(), allOk, checks: checks.map(({ output, ...c }) => ({ ...c, tail: output.slice(-2000) })) },
      null,
      2,
    ),
  );
}

console.log(`\n${allOk ? "ALL CHECKS PASSED" : "CHECKS FAILED"}`);
process.exit(allOk ? 0 : 1);
