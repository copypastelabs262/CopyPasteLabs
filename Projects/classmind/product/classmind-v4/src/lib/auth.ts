import "server-only";
import { headers } from "next/headers";
import { authClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { parseRole, type ProfileRole } from "@/lib/profile-role";

export interface SessionUser {
  id: string;
  email: string | null;
  fullName: string | null;
  // Null means NO ROLE HAS EVER BEEN CHOSEN for this account -- there is no
  // profiles row (or no readable role on it). It is a real state, not an
  // error: the product routes it to /choose-role. It is never defaulted;
  // "missing profile means faculty" is how students were silently created as
  // faculty accounts until 2026-09-06.
  role: ProfileRole | null;
}

// Reads the signed-in user and their profile. Returns null when signed out --
// callers decide whether that is an error or just an anonymous page.
export async function currentUser(): Promise<SessionUser | null> {
  let userId: string | null = null;
  let email: string | null = null;

  // Cookie session first -- this is how the browser authenticates.
  const supabase = await authClient();
  const { data, error } = await supabase.auth.getUser();
  if (!error && data.user) {
    userId = data.user.id;
    email = data.user.email ?? null;
  } else {
    // Bearer token fallback. The same session, presented by something that is
    // not a browser: scripts, integration tests, and eventually a mobile client.
    // Verified against Supabase rather than decoded locally, so a forged or
    // expired token fails the same way an unauthenticated request does.
    const bearer = (await headers()).get("authorization");
    const token = bearer?.toLowerCase().startsWith("bearer ") ? bearer.slice(7).trim() : null;
    if (!token) return null;
    const { data: viaToken, error: tokenError } = await serviceClient().auth.getUser(token);
    if (tokenError || !viaToken.user) return null;
    userId = viaToken.user.id;
    email = viaToken.user.email ?? null;
  }

  const svc = serviceClient();
  const { data: profile, error: profileError } = await svc
    .from("profiles")
    .select("full_name, role")
    .eq("id", userId)
    .maybeSingle();

  // A FAILED READ IS NOT AN ABSENT PROFILE (2026-09-07, security audit).
  //
  // This error was discarded, so a timeout or a transient PostgREST failure
  // produced `profile: null`, which reads as "this account has no role". That
  // was survivable when a null role only routed to /choose-role. It is not now:
  // requireFaculty gates course creation and, through requireCourseOwner, every
  // teaching and paid route -- so one dropped query would silently strip a
  // lecturer of their own courses and send them to a role chooser for an account
  // that already has a role.
  //
  // Refused loudly instead. "We could not read your account" and "you have not
  // chosen a role" are different answers and the caller gets the true one.
  if (profileError) {
    console.error("[auth] profile read failed:", profileError.message);
    throw new HttpError(503, "Could not read your account just now. Please try again.");
  }

  // A profile is created by an explicit role selection. A user created any
  // other way (dashboard, admin API, a lost signal) has none -- and that is
  // reported as role: null for the caller to route, never papered over with a
  // default.
  return {
    id: userId,
    email,
    fullName: (profile?.full_name as string | null) ?? null,
    role: parseRole(profile?.role),
  };
}

// For code that BRANCHES on the role. An account that never completed role
// selection cannot be assumed into either branch -- least of all the
// privileged one -- so it is refused with the way forward named.
export function requireRole(user: SessionUser): ProfileRole {
  if (!user.role) throw new HttpError(403, "Choose your role at /choose-role to continue.");
  return user.role;
}

// THE FACULTY CAPABILITY GATE (added 2026-09-07, security audit).
//
// @/lib/faculty-code gates who may BE faculty. Nothing gated what a faculty
// account may DO, and the two are not the same boundary: until this function
// existed, `POST /api/courses` asked only requireUser(), so any signed-in
// student could create a course, become its owner, and thereby satisfy
// requireCourseOwner on every teaching route behind it -- upload, transcribe,
// extract, review, delete. The faculty code protected the label while the
// capability it was protecting stood open.
//
// The UI has always known the rule: CoursesClient renders "New class" only
// when role === "faculty". That check is UX. This one is the boundary.
//
// Deliberately separate from requireRole: "has chosen a role" and "is faculty"
// are different questions, and collapsing them is how a null role would fall
// into the privileged branch.
export function requireFaculty(user: SessionUser): void {
  if (requireRole(user) !== "faculty") {
    throw new HttpError(
      403,
      "Only a faculty account can do this. Ask your institution's ClassMind admin for the faculty code.",
    );
  }
}

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "Sign in to continue.");
  return user;
}

// Owner-only. Guards everything that can create or change course data,
// including every review action and every paid processing route.
//
// TWO CONDITIONS, NOT ONE (second added 2026-09-07, security audit). Owning a
// course is a FACULTY act, so this asserts the role as well as the ownership.
// The role check is not redundant with the one on course creation: it is what
// makes the gate hold for rows that already exist. Any course created through
// the pre-fix hole -- a student POSTing /api/courses -- is still owned by that
// student, and an ownership-only check would keep handing them upload,
// transcribe, extract and delete on it forever. Checking the role at USE time
// closes the existing rows as well as the new ones.
//
// Takes the SessionUser rather than a bare id on purpose: an id cannot carry a
// role, and a helper that has to be told the role separately is a helper a
// caller can forget to tell.
export async function requireCourseOwner(courseId: string, user: SessionUser) {
  requireFaculty(user);
  const svc = serviceClient();
  const { data, error } = await svc
    .from("courses")
    .select("id, owner_id, code, title, term, transcription_language, join_code")
    .eq("id", courseId)
    .maybeSingle();
  if (error || !data) throw new HttpError(404, "Course not found.");
  if (data.owner_id !== user.id) throw new HttpError(403, "Not your course.");
  return data;
}

// Owner or enrolled student. Guards read paths only. Note that being allowed to
// READ a course never implies being allowed to see candidates -- those routes
// call requireCourseOwner instead.
export async function requireCourseAccess(courseId: string, user: SessionUser) {
  const svc = serviceClient();
  const { data: course } = await svc
    .from("courses")
    .select("id, owner_id, code, title, term, transcription_language, join_code")
    .eq("id", courseId)
    .maybeSingle();
  if (!course) throw new HttpError(404, "Course not found.");
  // OWNERSHIP GRANTS THE OWNER VIEW ONLY TO A FACULTY ACCOUNT (2026-09-07,
  // security audit -- second pass).
  //
  // The first pass added the role check to requireCourseOwner, which covers
  // every WRITE. It did not cover this, which is the READ side, and `isOwner`
  // here is what decides whether the caller sees extraction_candidates, the raw
  // provider response, an unpublished lecture and a signed audio URL -- the
  // exact payload "no unverified information reaches students" is about.
  //
  // A student-role account that owns a course is only possible as a leftover of
  // the pre-fix POST /api/courses hole. Leaving the read side open would have
  // meant those accounts kept the whole teaching view of the courses they made,
  // while merely losing the ability to write to them -- a half-closed door.
  //
  // A non-faculty owner falls through to the enrolment check below and is
  // refused there, which is the correct fail-closed answer: the course should
  // not exist, and reinstating access to it is an operator decision about data,
  // not something this function should quietly grant.
  if (course.owner_id === user.id && user.role === "faculty") {
    return { course, isOwner: true };
  }

  const { data: enrolment } = await svc
    .from("enrollments")
    .select("user_id")
    .eq("course_id", courseId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!enrolment) throw new HttpError(403, "You are not enrolled in this course.");
  return { course, isOwner: false };
}

// A DATABASE FAILURE IS THE OPERATOR'S DETAIL, NOT THE CALLER'S (2026-09-07,
// security audit).
//
// Eight routes returned `error.message` from a Supabase call straight to the
// browser with a 500. PostgREST messages are not opaque: they carry table and
// column names, constraint names, the offending value, and enough of the shape
// of the schema to plan against it -- "insert or update on table
// \"enrollments\" violates foreign key constraint \"enrollments_course_id_fkey\"",
// "invalid input syntax for type uuid: ...". None of it helps the person who
// hit it, and all of it helps someone mapping the system.
//
// POST /api/profile and the conversation store already did the right thing and
// said why ("machine exhaust and, in the worst case, leaks schema detail" /
// "diagnostic detail is the operator's, not the caller's"). This is that rule,
// lifted into one function so the remaining routes get it by calling it rather
// than by remembering it.
//
// The message still exists -- it goes to the server log with a scope tag, which
// is where an operator debugging a 500 was always going to look.
export function dbFailure(
  scope: string,
  error: { message?: string | null } | null | undefined,
  humanMessage: string,
): HttpError {
  console.error(`[${scope}]`, error?.message ?? "unknown database error");
  return new HttpError(500, humanMessage);
}

export function errorResponse(err: unknown): { body: { error: string }; status: number } {
  if (err instanceof HttpError) return { body: { error: err.message }, status: err.status };
  return {
    body: { error: err instanceof Error ? err.message : "Unexpected error." },
    status: 500,
  };
}
