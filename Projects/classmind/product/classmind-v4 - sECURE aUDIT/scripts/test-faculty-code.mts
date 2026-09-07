// Self-test for the faculty gate's server-side verifier. Run with:
//
//   node --conditions=react-server scripts/test-faculty-code.mts
//
// FREE and offline. The verifier is pure over process.env and node:crypto, so
// every property that matters -- fail-closed when unset, constant-time compare
// semantics, length mismatch is a "no", and the per-user brute-force throttle --
// is checked here without a server or a network. The `--conditions=react-server`
// flag makes the `server-only` import a no-op so this module loads under node.

import {
  verifyFacultyCode,
  facultyCodeConfigured,
  facultyAttemptBlocked,
  recordFacultyFailure,
  clearFacultyAttempts,
} from "../src/lib/faculty-code.ts";

let passed = 0;
let failed = 0;
function check(ok: boolean, label: string): void {
  if (ok) { passed += 1; console.log(`PASS  ${label}`); }
  else { failed += 1; console.log(`FAIL  ${label}`); }
}

// ---- fail closed when no code is configured ----
delete process.env.FACULTY_ACCESS_CODE;
check(facultyCodeConfigured() === false, "unset -> not configured");
check(verifyFacultyCode("anything") === false, "unset -> every candidate is rejected (fail closed)");
check(verifyFacultyCode("") === false, "unset + empty -> rejected");

// ---- correctness of the compare ----
process.env.FACULTY_ACCESS_CODE = "s3cret-Faculty-Code-2026";
check(facultyCodeConfigured() === true, "set -> configured");
check(verifyFacultyCode("s3cret-Faculty-Code-2026") === true, "exact match -> accepted");
check(verifyFacultyCode("s3cret-faculty-code-2026") === false, "case difference -> rejected");
check(verifyFacultyCode("s3cret-Faculty-Code-2026 ") === false, "trailing space (length mismatch) -> rejected");
check(verifyFacultyCode("s3cret-Faculty-Code-202") === false, "one char short -> rejected");
check(verifyFacultyCode("") === false, "empty candidate -> rejected");
check(verifyFacultyCode(null) === false, "null candidate -> rejected");
check(verifyFacultyCode(12345) === false, "non-string candidate -> rejected");

// ---- the per-user throttle ----
const now = 1_000_000;
const user = "user-abc";
clearFacultyAttempts(user);
check(facultyAttemptBlocked(user, now) === false, "no prior failures -> not blocked");
for (let i = 0; i < 5; i += 1) recordFacultyFailure(user, now + i);
check(facultyAttemptBlocked(user, now + 6) === true, "5 failures within the window -> blocked");
check(facultyAttemptBlocked("other-user", now + 6) === false, "throttle is per-user, not global");
clearFacultyAttempts(user);
check(facultyAttemptBlocked(user, now + 6) === false, "a successful verify clears the count");
// The window expires.
recordFacultyFailure(user, now);
for (let i = 0; i < 5; i += 1) recordFacultyFailure(user, now + i);
check(facultyAttemptBlocked(user, now + 11 * 60 * 1000) === false, "failures older than the window no longer block");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
