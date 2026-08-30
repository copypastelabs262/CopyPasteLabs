import { NextResponse } from "next/server";
import { requireUser, errorResponse } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/service";
import { readKnowledge, fetchLectureGateRows, lectureVisibleToStudents } from "@/lib/knowledge/read";

// "What matters to me right now", in ONE request.
//
// The home screen used to assemble this in the browser: list the courses, then
// fetch every course, then fetch knowledge per lecture. That is O(lectures)
// round trips over the network to answer a question the database can answer in
// a handful of queries, and it got slower every week an account got fuller.
//
// The payload is ROLE-SHAPED, not role-filtered. A teacher and a student do not
// receive the same object with some fields blanked out -- they receive two
// different objects, because the two screens ask different questions. That also
// makes the safety property structural: the student shape has no field that
// could carry an unreviewed item, so no later edit can accidentally populate
// one.
//
// The one thing a student IS told about unreviewed work is HOW MANY items are
// waiting. Same rule as the lecture route, for the same reason: withholding the
// CONTENT of an unconfirmed assignment is the product's central promise, but
// withholding the FACT that something is coming makes the product quietly
// dishonest -- a student reading "nothing to do" cannot otherwise tell that
// from "your lecturer has not looked at it yet".

// Caps. Each exists so that one busy account cannot make the response
// unbounded, and each is reported next to its total, so a screen can say
// "12 of 40" rather than silently truncating.
const RECENT_LECTURE_LIMIT = 6;
const ATTENTION_LIMIT = 8;
const TODO_LIMIT = 12;

const PROCESSING = new Set(["transcribing", "extracting"]);

// The only lecture status a student may be shown at all. A half-processed
// lecture is not course material yet.
const PUBLISHED = "ready";

// What "you have to do" means. These are exactly the kinds `initialStatus` in
// src/lib/knowledge/store.ts gates behind human review -- so an item of one of
// these kinds that a student can see is one a human vouched for. Other
// actionable kinds (an announcement, a piece of advice) are real knowledge and
// live on the lecture; they are not homework, and putting them in a to-do list
// would teach the reader to distrust it.
const OBLIGATION_KINDS = new Set(["assignment", "deadline", "exam_instruction"]);

interface CourseRow {
  id: string;
  code: string;
  title: string;
  term: string | null;
  join_code?: string | null;
  created_at: string;
}

interface LectureRow {
  id: string;
  course_id: string;
  title: string;
  status: string;
  error_message: string | null;
  created_at: string;
}

export async function GET() {
  try {
    const user = await requireUser();
    const svc = serviceClient();

    // Neither list depends on the other, so they go together.
    const [ownedResult, enrolmentResult] = await Promise.all([
      svc
        .from("courses")
        .select("id, code, title, term, join_code, created_at")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false }),
      svc.from("enrollments").select("course_id").eq("user_id", user.id),
    ]);

    const owned = (ownedResult.data ?? []) as CourseRow[];
    const ownedIds = new Set(owned.map((c) => c.id));
    // A course you own and are also enrolled in is one course, and owning wins:
    // it is the stronger relationship and it decides what you are shown.
    const enrolledIds = [
      ...new Set((enrolmentResult.data ?? []).map((r) => r.course_id as string)),
    ].filter((id) => !ownedIds.has(id));

    const enrolled = enrolledIds.length
      ? (((
          await svc
            .from("courses")
            .select("id, code, title, term, created_at")
            .in("id", enrolledIds)
            .order("created_at", { ascending: false })
        ).data ?? []) as CourseRow[])
      : [];

    const courses = [
      ...owned.map((course) => ({ course, isOwner: true })),
      ...enrolled.map((course) => ({ course, isOwner: false })),
    ];
    const courseById = new Map(courses.map((entry) => [entry.course.id, entry]));
    const courseIds = courses.map((entry) => entry.course.id);

    const isStudent = user.role === "student";
    const ownedIdList = [...ownedIds];

    // Two queries that both depend only on the course ids, so they go together.
    // What this page costs is round trips, not rows -- every one of these is a
    // few dozen bytes off a remote database -- so the shape to optimise for is
    // the number of times it waits, not the number of records it reads.
    //
    //  - EVERY lecture in EVERY one of those courses. This is the request the
    //    old home screen made once per course, and it is where most of the
    //    saving is.
    //  - The role's one knowledge question. A student needs to know which
    //    courses could possibly contain something to do; a teacher needs the
    //    rows still waiting on their verdict. Neither is useful to the other
    //    role, so only one of them is ever issued.
    const [lectureResult, knowledgeResult] = await Promise.all([
      courseIds.length
        ? svc
            .from("lectures")
            .select("id, course_id, title, status, error_message, created_at")
            .in("course_id", courseIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
      isStudent
        ? // A narrow, indexed probe carrying NO visibility logic of its own: it
          // only says "there is actionable knowledge somewhere in this course",
          // and readKnowledge decides what of it this reader may see. Skipping
          // the courses that cannot contribute is what stops the read below
          // being one knowledge query per enrolled course -- most courses have
          // nothing actionable in them at all.
          courseIds.length
          ? svc
              .from("knowledge_items")
              .select("course_id")
              .in("course_id", courseIds)
              .eq("category", "actionable")
          : Promise.resolve({ data: [] })
        : // Everything still waiting on this teacher's verdict. No visibility
          // rule applies -- an owner may see every item in their own course by
          // definition -- so this asks for exactly the rows the queue is made
          // of, rather than reading knowledge in order to discard most of it.
          ownedIdList.length
          ? svc
              .from("knowledge_items")
              .select("lecture_id, created_at, course_id")
              .in("course_id", ownedIdList)
              .eq("status", "pending")
          : Promise.resolve({ data: [] }),
    ]);

    const lectures = (lectureResult.data ?? []) as LectureRow[];
    const knowledgeRows = (knowledgeResult.data ?? []) as Record<string, string>[];

    const counts = new Map<string, { total: number; processing: number; published: number }>();
    for (const id of courseIds) counts.set(id, { total: 0, processing: 0, published: 0 });
    for (const lecture of lectures) {
      const entry = counts.get(lecture.course_id);
      if (!entry) continue;
      entry.total += 1;
      if (PROCESSING.has(lecture.status)) entry.processing += 1;
      if (lecture.status === PUBLISHED) entry.published += 1;
    }

    const courseSummaries = courses.map(({ course, isOwner }) => {
      const count = counts.get(course.id) ?? { total: 0, processing: 0, published: 0 };
      return {
        id: course.id,
        code: course.code,
        title: course.title,
        term: course.term,
        // The join code is how new people get into a course, so it belongs to
        // the owner and is absent from an enrolled reader's copy entirely.
        joinCode: isOwner ? (course.join_code ?? null) : null,
        isOwner,
        // A reader who is not the owner is counting what EXISTS for them. Six
        // lectures of which two are published is "two lectures" to a student;
        // telling them six and showing two reads as a bug, and the four they
        // cannot open are not theirs to know about.
        lectureCount: isOwner ? count.total : count.published,
        processingCount: isOwner ? count.processing : 0,
      };
    });

    function decorate(lecture: LectureRow) {
      const entry = courseById.get(lecture.course_id);
      return {
        id: lecture.id,
        title: lecture.title,
        status: lecture.status,
        createdAt: lecture.created_at,
        errorMessage: lecture.error_message,
        courseId: lecture.course_id,
        courseCode: entry?.course.code ?? "",
        courseTitle: entry?.course.title ?? "",
      };
    }

    /* ------------------------------------------------------------------
       STUDENT
    ------------------------------------------------------------------ */
    if (isStudent) {
      const published = lectures.filter((l) => l.status === PUBLISHED);
      const publishedIds = published.map((l) => l.id);
      const publishedAt = new Map(published.map((l) => [l.id, l.created_at]));

      const mayContribute = [...new Set(knowledgeRows.map((r) => r.course_id))];

      // The ONE definition of "a student may see this" lives in readKnowledge.
      // This route does not get its own, and does not get to relax it.
      //
      // The count of items awaiting the lecturer goes in the same wait: it is a
      // COUNT, never content (see the note at the top of this file), and it
      // depends on nothing the knowledge reads produce.
      const [perCourse, awaitingResult] = await Promise.all([
        Promise.all(mayContribute.map((courseId) => readKnowledge({ courseId, forStudent: true }))),
        publishedIds.length
          ? svc
              .from("knowledge_items")
              .select("id", { count: "exact", head: true })
              .in("lecture_id", publishedIds)
              .eq("status", "pending")
          : Promise.resolve({ count: 0 }),
      ]);

      const todo = perCourse
        .flat()
        .filter((unit) => unit.category === "actionable" && OBLIGATION_KINDS.has(unit.kind))
        .map((unit) => {
          const entry = courseById.get(unit.courseId);
          return {
            id: unit.id,
            kind: unit.kind,
            title: unit.title,
            summary: unit.summary,
            steps: unit.steps,
            // What the lecturer did NOT say travels with the item. Dropping it
            // here would turn "no deadline was given" into silence, which reads
            // as "there is no deadline".
            unspecified: unit.unspecified,
            courseId: unit.courseId,
            courseCode: entry?.course.code ?? "",
            courseTitle: entry?.course.title ?? "",
            lectureId: unit.lectureId,
            lectureTitle: unit.lectureTitle,
            // Knowledge items carry no due date column. The lecturer's own
            // wording about timing is inside `summary`, so the newest lecture
            // leads -- the closest honest proxy for "most likely to still
            // matter" that the data actually supports.
            lectureAt: publishedAt.get(unit.lectureId) ?? "",
          };
        })
        .sort((a, b) => b.lectureAt.localeCompare(a.lectureAt));

      // A replayed lecture must not even be ADVERTISED to a student. The knowledge
    // gate already withholds its content, but listing it here would show a title
    // the student cannot open -- they click it and receive a 403.
    const gateRows = await fetchLectureGateRows({ ids: published.map((l) => l.id as string) });
    const visibleById = new Map(gateRows.map((r) => [r.id, lectureVisibleToStudents(r)]));
    const visiblePublished = published.filter((l) => visibleById.get(l.id as string) === true);

    return NextResponse.json({
        role: "student",
        courses: courseSummaries,
        todo: todo.slice(0, TODO_LIMIT),
        todoTotal: todo.length,
        awaitingReview: awaitingResult.count ?? 0,
        recentLectures: visiblePublished.slice(0, RECENT_LECTURE_LIMIT).map(decorate),
        recentLecturesTotal: published.length,
      });
    }

    /* ------------------------------------------------------------------
       TEACHER
    ------------------------------------------------------------------ */
    // A pending item on a lecture that never published is not reviewable: the
    // review UI hangs off a published lecture, and a quarantined one is
    // reported below as its own, different problem.
    const publishedOwned = new Set(
      lectures.filter((l) => l.status === PUBLISHED && ownedIds.has(l.course_id)).map((l) => l.id),
    );
    const queueByLecture = new Map<string, { count: number; since: string }>();
    for (const row of knowledgeRows) {
      const lectureId = row.lecture_id;
      if (!publishedOwned.has(lectureId)) continue;
      const at = row.created_at;
      const seen = queueByLecture.get(lectureId);
      if (!seen) {
        queueByLecture.set(lectureId, { count: 1, since: at });
        continue;
      }
      seen.count += 1;
      // How long the LECTURE has waited is how long its oldest item has waited.
      if (at.localeCompare(seen.since) < 0) seen.since = at;
    }

    const lectureById = new Map(lectures.map((l) => [l.id, l]));
    const reviewQueue = [...queueByLecture.entries()]
      .map(([lectureId, entry]) => {
        const lecture = lectureById.get(lectureId)!;
        const course = courseById.get(lecture.course_id);
        return {
          lectureId,
          lectureTitle: lecture.title,
          courseId: lecture.course_id,
          courseCode: course?.course.code ?? "",
          pendingCount: entry.count,
          waitingSince: entry.since,
        };
      })
      // Oldest first: a review queue is worked from the end that has waited
      // longest, not the end that arrived last.
      .sort((a, b) => a.waitingSince.localeCompare(b.waitingSince));

    // Held back, or broken. Not the same problem: a quarantined lecture has a
    // transcript nobody should trust, a failed one has no transcript at all.
    const blocked = lectures
      .filter(
        (l) => ownedIds.has(l.course_id) && (l.status === "quarantined" || l.status === "failed"),
      )
      .map(decorate);

    return NextResponse.json({
      role: "faculty",
      courses: courseSummaries,
      reviewQueue: reviewQueue.slice(0, ATTENTION_LIMIT),
      reviewQueueTotal: reviewQueue.length,
      reviewItemsTotal: reviewQueue.reduce((sum, entry) => sum + entry.pendingCount, 0),
      blocked: blocked.slice(0, ATTENTION_LIMIT),
      blockedTotal: blocked.length,
      processingCount: lectures.filter((l) => PROCESSING.has(l.status)).length,
      // The pending count rides along so a recent row can say what is actually
      // outstanding on that lecture rather than repeating the generic status
      // sentence for every published one.
      recentLectures: lectures.slice(0, RECENT_LECTURE_LIMIT).map((lecture) => ({
        ...decorate(lecture),
        pendingCount: queueByLecture.get(lecture.id)?.count ?? 0,
      })),
      recentLecturesTotal: lectures.length,
    });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
