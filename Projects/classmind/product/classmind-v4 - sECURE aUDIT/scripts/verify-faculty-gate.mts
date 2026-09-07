// LIVE verification of the Phase 1 faculty gate + role integrity, against the
// real server and database. Run with:
//
//   npm run verify:faculty-gate
//   (= node --env-file=.env.local scripts/verify-faculty-gate.mts)
//
// FREE: /api/profile creates a profile row -- no reasoning or transcription is
// touched. It creates two throwaway auth users and deletes them (and their
// profiles) in a finally. The dev server must be running on 3500 WITH
// FACULTY_ACCESS_CODE set (restart it after adding the var).

import { createClient } from "@supabase/supabase-js";

const BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3500";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CODE = process.env.FACULTY_ACCESS_CODE ?? "";

let passed = 0;
let failed = 0;
function check(ok: boolean, label: string, detail?: unknown): void {
  if (ok) { passed += 1; console.log(`PASS  ${label}`); }
  else {
    failed += 1;
    console.log(`FAIL  ${label}`);
    if (detail !== undefined) console.log(`        ${typeof detail === "string" ? detail : JSON.stringify(detail)?.slice(0, 300)}`);
  }
}
const section = (t: string) => console.log(`\n--- ${t} ---`);

if (!CODE) { console.error("FACULTY_ACCESS_CODE is not set in this server's env. Restart the dev server after adding it."); process.exit(1); }
const ping = await fetch(`${BASE}/signin`).catch(() => null);
if (!ping?.ok) { console.error(`Dev server not reachable at ${BASE}.`); process.exit(1); }

const svc = createClient(URL_, SVC, { auth: { persistSession: false } });
const anon = () => createClient(URL_, ANON, { auth: { persistSession: false } });
const PW = "Phase1-Gate-Test!2026";
const stamp = Date.now();
const emailA = `phase1-gate-a-${stamp}@classmind.test`;
const emailB = `phase1-gate-b-${stamp}@classmind.test`;
const created: string[] = [];

async function makeUser(email: string): Promise<string> {
  const { data, error } = await svc.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  created.push(data.user.id);
  return data.user.id;
}
async function token(email: string): Promise<string> {
  const { data, error } = await anon().auth.signInWithPassword({ email, password: PW });
  if (error || !data.session) throw new Error(`sign-in failed: ${error?.message}`);
  return data.session.access_token;
}
async function api(tok: string, body: unknown): Promise<{ status: number; json: { error?: string; role?: string; ok?: boolean } }> {
  const res = await fetch(`${BASE}/api/profile`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let json = {};
  try { json = await res.json(); } catch { /* status only */ }
  return { status: res.status, json };
}
async function roleInDb(id: string): Promise<string | null> {
  const { data } = await svc.from("profiles").select("role").eq("id", id).maybeSingle();
  return (data?.role as string) ?? null;
}

try {
  const idA = await makeUser(emailA);
  const idB = await makeUser(emailB);
  const tokA = await token(emailA);
  const tokB = await token(emailB);

  section("Student onboarding needs no code");
  {
    const r = await api(tokA, { fullName: "Gate Student", role: "student" });
    check(r.status === 200 && r.json.role === "student", "student profile created", r);
    check((await roleInDb(idA)) === "student", "…and the DB row says student");
  }

  section("Faculty is refused without / with a wrong code (and NO profile is written)");
  {
    const noCode = await api(tokB, { fullName: "Gate Faculty", role: "faculty" });
    check(noCode.status === 403, "faculty with no code -> 403", noCode.status);
    check((await roleInDb(idB)) === null, "…no profile row was created");

    const wrong = await api(tokB, { fullName: "Gate Faculty", role: "faculty", facultyCode: "definitely-wrong" });
    check(wrong.status === 403, "faculty with a wrong code -> 403", wrong.status);
    check((await roleInDb(idB)) === null, "…still no profile row");
    check(!JSON.stringify(wrong.json).includes(CODE), "…the response never contains the real code");
  }

  section("Faculty is created with the correct code");
  {
    const ok = await api(tokB, { fullName: "Gate Faculty", role: "faculty", facultyCode: CODE });
    check(ok.status === 200 && ok.json.role === "faculty", "correct code -> faculty profile created", ok);
    check((await roleInDb(idB)) === "faculty", "…and the DB row says faculty");
  }

  section("Role is immutable — a student cannot escalate, faculty cannot flip");
  {
    // Existing STUDENT tries to become faculty even WITH the code -> refused.
    const escalate = await api(tokA, { role: "faculty", facultyCode: CODE });
    check(escalate.status === 409, "existing student + correct code -> 409, no escalation", escalate.status);
    check((await roleInDb(idA)) === "student", "…the student is still a student");
    // Existing FACULTY tries to become student -> refused.
    const flip = await api(tokB, { role: "student" });
    check(flip.status === 409, "existing faculty -> student -> 409", flip.status);
    check((await roleInDb(idB)) === "faculty", "…the faculty account is unchanged");
    // Name-only update on an existing profile still works, role untouched.
    const rename = await api(tokA, { fullName: "Renamed Student" });
    check(rename.status === 200 && rename.json.role === "student", "name-only update keeps the role", rename);
  }

  section("The secret never reaches the client");
  {
    for (const path of ["/signin", "/choose-role"]) {
      const html = await fetch(`${BASE}${path}`).then((r) => r.text()).catch(() => "");
      check(!html.includes(CODE), `${path} HTML does not contain the faculty code`);
    }
  }
} finally {
  section("Cleanup");
  for (const id of created) {
    await svc.from("profiles").delete().eq("id", id);
    await svc.auth.admin.deleteUser(id).catch(() => {});
  }
  console.log(`deleted ${created.length} throwaway account(s)`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
