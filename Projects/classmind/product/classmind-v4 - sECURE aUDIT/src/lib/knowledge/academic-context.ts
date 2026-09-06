import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readKnowledge, type KnowledgeUnit } from "./read.ts";

// THE THREE-LEVEL ACADEMIC CONTEXT — one retrieval architecture, three
// explicit boundaries. The scope is an AUTHORITATIVE retrieval ceiling, never
// a hint:
//
//   lecture   one lecture's knowledge, nothing else
//   course    every lecture in ONE subject (course = subject in this product)
//   global    every subject the authenticated student can access
//
// All three read the SAME canonical knowledge through the SAME gated reader
// (readKnowledge: replay/quarantine/visibility rules apply identically), so a
// wider scope is a wider read — never a second knowledge layer, and never a
// bypass of a narrower gate.
//
// ACCESS IS ENUMERATED SERVER-SIDE. The lecture and course boundaries arrive
// through routes that have already passed requireCourseAccess; the global
// boundary is built HERE from the session user's own memberships (courses
// they own + courses they are enrolled in) — no client-supplied id can widen
// it, because no client-supplied id participates in it.

export type AcademicScopeRef =
  | { scope: "lecture"; courseId: string; lectureId: string; isOwner: boolean }
  | { scope: "course"; courseId: string; isOwner: boolean }
  | { scope: "global"; userId: string; isFaculty: boolean };

export interface AcademicContext {
  scope: "lecture" | "course" | "global";
  units: KnowledgeUnit[];
  // Attribution for answers that cross lecture or subject boundaries:
  // courseId -> "CODE · Title". Populated for global scope (a cross-subject
  // fact must say which subject it came from); empty otherwise, because a
  // single-course answer already knows where it is.
  courseNames: Map<string, string>;
  // Subjects that exist but were NOT read because the fan-out cap cut them
  // off. Zero almost always; when it isn't, the answer layer must say so
  // rather than present a truncated world as the whole one.
  subjectsOmitted: number;
}

// How many courses a single global read will fan out over. A student is in a
// handful of subjects; a service account is not a student, and an unbounded
// fan-out is how one request becomes forty queries.
const GLOBAL_COURSE_CAP = 12;

export interface CourseMembership {
  id: string;
  code: string;
  title: string;
  isOwner: boolean;
}

// EVERY course this user can currently access, with their relationship to
// each — the single definition of "the student's academic world". Used by the
// global retrieval boundary AND by the conversation read route's access
// re-check, so the two can never disagree about what is accessible.
//
// Enrolled subjects come FIRST, then owned ones, each in a deterministic
// (oldest-first) order: when a cap is applied downstream, the student life of
// an account that also owns many courses must survive the cut, and two
// identical requests must truncate identically.
// `isFaculty` decides whether OWNING a course confers the owner view here, and
// it is required rather than optional so no caller can omit it and silently get
// the permissive answer (2026-09-07, security audit).
//
// The invariant this keeps is "isOwner implies faculty", which requireCourseOwner
// and requireCourseAccess now enforce on every route. Without it, the GLOBAL ask
// corpus was the one place the old rule survived: a student-role account that
// owns a leftover course would read that course with forStudent:false and see
// its pending, unconfirmed and rejected-adjacent knowledge -- the material the
// review queue exists to keep from students -- while every per-course route
// refused them.
export async function listCourseMemberships(
  svc: SupabaseClient,
  userId: string,
  isFaculty: boolean,
): Promise<CourseMembership[]> {
  const [ownedResult, enrolledResult] = await Promise.all([
    svc
      .from("courses")
      .select("id, code, title")
      .eq("owner_id", userId)
      .order("created_at", { ascending: true }),
    svc.from("enrollments").select("course_id").eq("user_id", userId),
  ]);
  const owned = (ownedResult.data ?? []) as { id: string; code: string; title: string }[];
  const ownedIds = new Set(owned.map((c) => c.id));
  const enrolledIds = [
    ...new Set((enrolledResult.data ?? []).map((r) => r.course_id as string)),
  ].filter((id) => !ownedIds.has(id));

  const enrolled = enrolledIds.length
    ? (((
        await svc
          .from("courses")
          .select("id, code, title")
          .in("id", enrolledIds)
          .order("created_at", { ascending: true })
      ).data ?? []) as { id: string; code: string; title: string }[])
    : [];

  return [
    ...enrolled.map((c) => ({ ...c, isOwner: false })),
    ...owned.map((c) => ({ ...c, isOwner: isFaculty })),
  ];
}

export async function loadAcademicContext(
  svc: SupabaseClient,
  ref: AcademicScopeRef,
): Promise<AcademicContext> {
  if (ref.scope === "lecture") {
    const units = await readKnowledge({
      courseId: ref.courseId,
      lectureId: ref.lectureId,
      forStudent: !ref.isOwner,
    });
    return { scope: "lecture", units, courseNames: new Map(), subjectsOmitted: 0 };
  }

  if (ref.scope === "course") {
    const units = await readKnowledge({ courseId: ref.courseId, forStudent: !ref.isOwner });
    return { scope: "course", units, courseNames: new Map(), subjectsOmitted: 0 };
  }

  // ---- global: the student's whole accessible academic world ---------------
  const all = await listCourseMemberships(svc, ref.userId, ref.isFaculty);
  const memberships = all.slice(0, GLOBAL_COURSE_CAP);

  const courseNames = new Map(memberships.map((c) => [c.id, `${c.code} · ${c.title}`]));

  // The same gated reader, once per subject, with the reader's OWN
  // relationship to each course deciding visibility — an owner reads their
  // course as its owner, a student reads theirs as a student. Wider scope,
  // identical gates.
  const perCourse = await Promise.all(
    memberships.map((c) => readKnowledge({ courseId: c.id, forStudent: !c.isOwner })),
  );

  return {
    scope: "global",
    units: perCourse.flat(),
    courseNames,
    subjectsOmitted: all.length - memberships.length,
  };
}
