import "server-only";
import { execFileSync } from "node:child_process";

let cached: string | undefined;

function run(args: string[]): string {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

// Constitution IV wants the exact code that produced the artefact. A bare
// HEAD sha lies when the working tree is dirty -- the recorded commit would
// not reproduce the result -- so a dirty tree is labelled rather than passed
// off as a clean commit. GIT_COMMIT wins when set, for builds that ship
// without a .git directory.
export function getCommitHash(): string {
  if (cached !== undefined) return cached;

  const fromEnv = process.env.GIT_COMMIT;
  if (fromEnv) {
    cached = fromEnv;
    return cached;
  }

  try {
    const head = run(["rev-parse", "HEAD"]);
    const dirty = run(["status", "--porcelain"]).length > 0;
    cached = dirty ? head + "-dirty" : head;
  } catch {
    cached = "unknown";
  }

  return cached;
}
