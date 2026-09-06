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
  | { scope: "global"; userId: string };

export interface AcademicContext {
  scope: "lecture" | "course" | "global";
  units: KnowledgeUnit[];
  // Attribution for answers that cross lecture or subject boundaries:
  // courseId -> "CODE · Title". Populated for global scope (a cross-subject
  // fact must say which subject it came from); empty otherwise, because a
  // single-course answer already knows where it is.
  courseNames: Map<string, string>;
}

// How many courses a single global read will fan out over. A student is in a
// handful of subjects; a service account is not a student, and an unbounded
// fan-out is how one request becomes forty queries.
const GLOBAL_COURSE_CAP = 12;

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
    return { scope: "lecture", units, courseNames: new Map() };
  }

  if (ref.scope === "course") {
    const units = await readKnowledge({ courseId: ref.courseId, forStudent: !ref.isOwner });
    return { scope: "course", units, courseNames: new Map() };
  }

  // ---- global: the student's whole accessible academic world ---------------
  const [ownedResult, enrolledResult] = await Promise.all([
    svc.from("courses").select("id, code, title").eq("owner_id", ref.userId),
    svc.from("enrollments").select("course_id").eq("user_id", ref.userId),
  ]);
  const owned = (ownedResult.data ?? []) as { id: string; code: string; title: string }[];
  const ownedIds = new Set(owned.map((c) => c.id));
  const enrolledIds = [
    ...new Set((enrolledResult.data ?? []).map((r) => r.course_id as string)),
  ].filter((id) => !ownedIds.has(id));

  const enrolled = enrolledIds.length
    ? (((
        await svc.from("courses").select("id, code, title").in("id", enrolledIds)
      ).data ?? []) as { id: string; code: string; title: string }[])
    : [];

  const memberships = [
    ...owned.map((c) => ({ ...c, isOwner: true })),
    ...enrolled.map((c) => ({ ...c, isOwner: false })),
  ].slice(0, GLOBAL_COURSE_CAP);

  const courseNames = new Map(memberships.map((c) => [c.id, `${c.code} · ${c.title}`]));

  // The same gated reader, once per subject, with the reader's OWN
  // relationship to each course deciding visibility — an owner reads their
  // course as its owner, a student reads theirs as a student. Wider scope,
  // identical gates.
  const perCourse = await Promise.all(
    memberships.map((c) => readKnowledge({ courseId: c.id, forStudent: !c.isOwner })),
  );

  return { scope: "global", units: perCourse.flat(), courseNames };
}
