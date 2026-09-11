// Starts the v3 dev server with LIVE SARVAM SPENDING ENABLED -- for exactly as
// long as this process lives, and not one second longer.
//
//   npm run dev:spend
//
// This is the per-process opt-in the transcription guard was designed around
// (src/lib/transcription/index.ts: "opted into per shell, deliberately").
// Nothing is written to .env.local or any other file: stop this server and the
// authorization is gone. It has no effect on replay safety or on deployments
// -- ALLOW_LIVE_SARVAM can only ever permit spending on a developer machine.
import { spawn } from "node:child_process";

console.log(`
==============================================================================
  LIVE SARVAM SPENDING IS ENABLED FOR THIS SERVER PROCESS

  Transcribing a lecture that names no replay fixture will make a real,
  billable Sarvam ASR call. A successful transcription then flows straight
  into extraction, which bills the reasoning provider (Groq) per token.

  This authorization lives and dies with this process. Stop the server
  (Ctrl+C) and the next 'npm run dev' starts with spending off again.
==============================================================================
`);

const child = spawn("npx", ["next", "dev", "-p", "3500"], {
  stdio: "inherit",
  env: { ...process.env, ALLOW_LIVE_SARVAM: "1" },
  // npx is npx.cmd on Windows, which spawn only finds through a shell.
  shell: process.platform === "win32",
});
child.on("exit", (code) => process.exit(code ?? 0));
