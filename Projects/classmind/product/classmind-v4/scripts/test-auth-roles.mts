// Self-test for the role-selection contract. Run with:
//
//   node scripts/test-auth-roles.mts
//
// FREE and offline: `profile-role.ts` is pure (no server-only marker, no I/O),
// which is the point -- the decision that used to be smeared across five call
// sites with five silent "faculty" fallbacks is now one pure function, and this
// file pins every row of its truth table. The side-effectful half (the insert)
// lives in `lib/profile.ts` and is exercised against the real database by
// `verify:auth`, which needs .env.local and the dev server.

import {
  parseRole,
  planProfileProvision,
  PENDING_ROLE_COOKIE,
} from "../src/lib/profile-role.ts";

let passed = 0;
let failed = 0;

function check(ok: boolean, label: string, detail?: unknown): void {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${label}`);
    if (detail !== undefined) console.log(`        ${JSON.stringify(detail)}`);
  }
}

console.log("--- parseRole: the only two values that are a signal ---");
check(parseRole("student") === "student", "'student' parses");
check(parseRole("faculty") === "faculty", "'faculty' parses");
check(parseRole("FACULTY") === null, "case variants are NOT a signal");
check(parseRole(" faculty") === null, "whitespace variants are NOT a signal");
check(parseRole("admin") === null, "unknown roles are NOT a signal");
check(parseRole("") === null, "empty string is NOT a signal");
check(parseRole(null) === null, "null is NOT a signal");
check(parseRole(undefined) === null, "undefined is NOT a signal");
check(parseRole(1) === null, "non-strings are NOT a signal");

console.log("\n--- planProfileProvision: an existing profile always wins ---");
// Scenario C/D of the verification brief: a returning user's role is kept, and
// no combination of stray signals can overwrite it.
for (const pendingRole of ["student", "faculty", null] as const) {
  for (const metadataRole of ["student", "faculty", null] as const) {
    const plan = planProfileProvision({ hasProfile: true, pendingRole, metadataRole });
    check(
      plan.action === "keep",
      `existing profile + pending=${pendingRole} + metadata=${metadataRole} -> keep`,
      plan,
    );
  }
}

console.log("\n--- planProfileProvision: explicit selections create ---");
// Scenario A: Google sign-up with Student selected (the cookie).
{
  const plan = planProfileProvision({ hasProfile: false, pendingRole: "student", metadataRole: null });
  check(plan.action === "create" && plan.role === "student" && plan.source === "pending",
    "pending student -> create student (Google sign-up, scenario A)", plan);
}
// Scenario B: Google sign-up with Faculty selected.
{
  const plan = planProfileProvision({ hasProfile: false, pendingRole: "faculty", metadataRole: null });
  check(plan.action === "create" && plan.role === "faculty" && plan.source === "pending",
    "pending faculty -> create faculty (Google sign-up, scenario B)", plan);
}
// The email-confirmation detour: role chosen at sign-up, recorded in metadata,
// profile created only after the user confirms and comes back.
{
  const plan = planProfileProvision({ hasProfile: false, pendingRole: null, metadataRole: "student" });
  check(plan.action === "create" && plan.role === "student" && plan.source === "metadata",
    "metadata student -> create student (email-confirmation flow)", plan);
}
// Precedence: the cookie is the more recent explicit choice.
{
  const plan = planProfileProvision({ hasProfile: false, pendingRole: "faculty", metadataRole: "student" });
  check(plan.action === "create" && plan.role === "faculty" && plan.source === "pending",
    "pending outranks metadata -- the most recent explicit choice wins", plan);
}

console.log("\n--- planProfileProvision: no signal NEVER becomes faculty ---");
// Scenario E, the bug itself: a missing/invalid signal must produce a QUESTION.
{
  const plan = planProfileProvision({ hasProfile: false, pendingRole: null, metadataRole: null });
  check(plan.action === "choose", "no profile + no signal -> choose, not faculty", plan);
}
{
  const plan = planProfileProvision({
    hasProfile: false,
    pendingRole: parseRole("definitely-not-a-role"),
    metadataRole: parseRole("FACULTY"),
  });
  check(plan.action === "choose", "invalid signals parse to null -> choose, not faculty", plan);
}

console.log("\n--- the cookie contract ---");
check(PENDING_ROLE_COOKIE === "cm-pending-role", "cookie name is pinned -- the sign-in page and callback must agree");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
