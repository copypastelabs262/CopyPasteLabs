// LIVE verification of the role-selection fix, against the real Supabase auth
// service and the running dev server. Run with:
//
//   npm run verify:auth
//   (= node --conditions=react-server --env-file=.env.local scripts/verify-auth-roles.mts)
//
// COST: $0. Supabase auth and database calls are free; nothing here goes near
// Sarvam, Gemini, /extract, /ask or /transcribe. The dev server must be up on
// port 3500 (plain `npm run dev` is fine).
//
// WHAT IS AND IS NOT VERIFIED HERE -- read this before trusting the output:
//
//   VERIFIED FOR REAL: profile provisioning against the live database via
//   ensureProfile -- the exact function the OAuth callback and /choose-role
//   run -- plus the /api/profile HTTP contract and the /api/me/overview
//   role guard, driven through the real server with real bearer sessions.
//
//   SIMULATED: the Google consent screen itself. ensureProfile(user, role) is
//   called with the pending role the callback would have read from the
//   cm-pending-role cookie; the browser leg (click Google, consent, redirect)
//   can only be verified by a human in a browser, and needs the Supabase
//   redirect allow-list to include http://localhost:3500/**.
//
// Every account this script creates is a throwaway (cm-verify-*@classmind.local)
// and is deleted at the end, profiles cascading with it.

import { createClient } from "@supabase/supabase-js";
import { ensureProfile } from "../src/lib/profile.ts";

const BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3500";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL_ || !SERVICE || !ANON) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  process.exit(1);
}

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = () => createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

let passed = 0;
let failed = 0;
function check(ok: boolean, label: string, detail?: unknown): void {
  if (ok) { passed += 1; console.log(`PASS  ${label}`); }
  else {
    failed += 1;
    console.log(`FAIL  ${label}`);
    if (detail !== undefined) console.log(`        ${typeof detail === "string" ? detail : JSON.stringify(detail)?.slice(0, 400)}`);
  }
}

const PASSWORD = "CmVerify!2026-role";
const stamp = Date.now().toString(36);
const createdIds: string[] = [];

async function createUser(tag: string, metadata: Record<string, unknown>): Promise<{ id: string; email: string; user_metadata: Record<string, unknown> }> {
  const email = `cm-verify-${stamp}-${tag}@classmind.local`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true, user_metadata: metadata,
  });
  if (error || !data.user) throw new Error(`could not create ${tag}: ${error?.message}`);
  createdIds.push(data.user.id);
  return { id: data.user.id, email, user_metadata: data.user.user_metadata ?? {} };
}

async function profileRow(id: string): Promise<{ role: string; full_name: string | null } | null> {
  const { data } = await admin.from("profiles").select("role, full_name").eq("id", id).maybeSingle();
  return (data as { role: string; full_name: string | null } | null) ?? null;
}

async function signIn(email: string): Promise<string> {
  const { data, error } = await anon().auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.session) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  return data.session.access_token;
}

async function api(path: string, token: string, body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${BASE}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: Record<string, unknown> = {};
  try { json = (await res.json()) as Record<string, unknown>; } catch { /* non-JSON is fine for status checks */ }
  return { status: res.status, json };
}

try {
  // Preflight: the server must be the one serving this working tree.
  const ping = await fetch(BASE).catch(() => null);
  if (!ping || !ping.ok) {
    console.error(`Dev server not reachable at ${BASE} -- start it with npm run dev.`);
    process.exit(1);
  }

  console.log("--- A: Google sign-up as Student (pending-role cookie, simulated at ensureProfile) ---");
  const a = await createUser("a", { full_name: "Verify Student A" });
  const aFirst = await ensureProfile(admin, a, "student");
  check(aFirst.role === "student" && aFirst.created, "first sign-in with pending student creates a student profile", aFirst);
  const aRow = await profileRow(a.id);
  check(aRow?.role === "student", "database row says student", aRow);

  console.log("\n--- C + no-overwrite: the same account signs in again, hostile signals ignored ---");
  const aAgain = await ensureProfile(admin, a, "faculty");
  check(aAgain.role === "student" && !aAgain.created, "a later sign-in with a stray faculty signal does NOT change the role", aAgain);
  check((await profileRow(a.id))?.role === "student", "database row still says student");

  console.log("\n--- B + D: Google sign-up as Faculty, then a plain re-sign-in ---");
  const b = await createUser("b", { full_name: "Verify Faculty B" });
  const bFirst = await ensureProfile(admin, b, "faculty");
  check(bFirst.role === "faculty" && bFirst.created, "first sign-in with pending faculty creates a faculty profile", bFirst);
  const bAgain = await ensureProfile(admin, b, null);
  check(bAgain.role === "faculty" && !bAgain.created, "re-sign-in with no signal keeps faculty", bAgain);

  console.log("\n--- Email-confirmation detour: role recorded in user_metadata at sign-up ---");
  const m = await createUser("m", { full_name: "Verify Metadata M", role: "student" });
  const mFirst = await ensureProfile(admin, m, null);
  check(mFirst.role === "student" && mFirst.created, "metadata role provisions a student profile with no cookie", mFirst);
  const mRow = await profileRow(m.id);
  check(mRow?.full_name === "Verify Metadata M", "full name carried from metadata", mRow);

  console.log("\n--- E: missing/invalid signal must NOT silently become faculty ---");
  const e = await createUser("e", { full_name: "Verify Roleless E" });
  const eFirst = await ensureProfile(admin, e, null);
  check(eFirst.role === null && !eFirst.created, "no signal -> no role, no row -- the account is sent to choose", eFirst);
  check((await profileRow(e.id)) === null, "no profiles row was invented");

  const eToken = await signIn(e.email);
  const overviewBlocked = await api("/api/me/overview", eToken);
  check(overviewBlocked.status === 403 && String(overviewBlocked.json.error ?? "").includes("choose-role"),
    "role-shaped API refuses a role-less account with 403 naming /choose-role", overviewBlocked);

  const badRole = await api("/api/profile", eToken, { role: "banana" });
  check(badRole.status === 400, "an invalid role is rejected with 400, not coerced to faculty", badRole);
  check((await profileRow(e.id)) === null, "still no row after the invalid attempt");

  const chose = await api("/api/profile", eToken, { role: "student", fullName: "Verify Roleless E" });
  check(chose.status === 200 && chose.json.role === "student", "the explicit /choose-role selection creates the student profile", chose);
  check((await profileRow(e.id))?.role === "student", "database row says student");

  console.log("\n--- Role immutability through /api/profile ---");
  const flip = await api("/api/profile", eToken, { role: "faculty" });
  check(flip.status === 409, "changing an existing role is refused with 409", flip);
  check((await profileRow(e.id))?.role === "student", "row unchanged after the refused flip");
  const rename = await api("/api/profile", eToken, { fullName: "Verify E Renamed" });
  check(rename.status === 200 && rename.json.role === "student", "a name-only update succeeds and reports the standing role", rename);
  const eRow = await profileRow(e.id);
  check(eRow?.full_name === "Verify E Renamed" && eRow?.role === "student", "name updated, role untouched", eRow);

  console.log("\n--- Overview works once the role exists ---");
  const overviewOk = await api("/api/me/overview", eToken);
  check(overviewOk.status === 200, "role-shaped API serves the account after the choice", overviewOk.status);
} finally {
  for (const id of createdIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.log(`WARN  cleanup failed for ${id}: ${error.message}`);
  }
  const leftover = await Promise.all(createdIds.map((id) => profileRow(id)));
  check(leftover.every((row) => row === null), "cleanup: all throwaway accounts and their profiles removed");
}

console.log(`\n${passed} passed, ${failed} failed`);
console.log("NOT verified here: the real Google consent round trip (needs a human browser");
console.log("and http://localhost:3500/** on the Supabase redirect allow-list).");
process.exit(failed > 0 ? 1 : 0);
