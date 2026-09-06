import { NextResponse } from "next/server";
import { requireUser, requireFaculty, errorResponse, dbFailure } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/service";

// Courses the user owns, plus courses they are enrolled in. One route, because
// the two lists are rendered together and a student may also teach.
export async function GET() {
  try {
    const user = await requireUser();
    const svc = serviceClient();

    // OWNERSHIP CONFERS THE OWNER VIEW ONLY TO FACULTY (2026-09-07, security
    // audit -- second pass). requireCourseOwner and requireCourseAccess both
    // assert this now, so a non-faculty owner cannot open any of these courses;
    // listing them here anyway would hand that account the join_code -- the
    // credential that lets anyone enrol -- for a course it cannot otherwise
    // touch. The list and the gate have to agree, or the UI shows a door that
    // every route refuses to open.
    const isFaculty = user.role === "faculty";
    const { data: owned } = isFaculty
      ? await svc
          .from("courses")
          .select("id, code, title, term, join_code, transcription_language, created_at")
          .eq("owner_id", user.id)
          .order("created_at", { ascending: false })
      : { data: [] as Record<string, unknown>[] };

    const { data: rows } = await svc
      .from("enrollments")
      .select("course_id")
      .eq("user_id", user.id);
    const ids = (rows ?? []).map((r) => r.course_id as string);

    const enrolled = ids.length
      ? (
          await svc
            .from("courses")
            .select("id, code, title, term, created_at")
            .in("id", ids)
            .order("created_at", { ascending: false })
        ).data ?? []
      : [];

    return NextResponse.json({ owned: owned ?? [], enrolled });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}

// CREATING A COURSE IS A FACULTY ACT, AND THE SERVER IS WHERE THAT IS DECIDED.
//
// Fixed 2026-09-07 (security audit). This route asked only requireUser(), so
// any signed-in student could POST here, become owner_id of a new course, and
// from that moment satisfy requireCourseOwner on every teaching route:
// /api/courses/{id}/lectures (signed upload URL), /api/lectures/{id}/transcribe
// (billable Sarvam ASR), /api/lectures/{id}/extract?force=1 (billable reasoning,
// per window, ledger bypassed), plus the candidate and knowledge review queues
// that "no unverified information reaches students" depends on.
//
// The gate existed -- FACULTY_ACCESS_CODE, checked in @/lib/faculty-code -- but
// it only decided who may hold the LABEL. CoursesClient renders the "New class"
// button behind `role === "faculty"`, which is UX and was the only thing
// standing between a free Google sign-up and the whole teaching console.
// A hidden button is not an authorization boundary.
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    requireFaculty(user);
    const body = (await request.json()) as {
      code?: string; title?: string; term?: string; transcriptionLanguage?: string;
    };
    if (!body.code?.trim() || !body.title?.trim()) {
      return NextResponse.json({ error: "Course code and title are required." }, { status: 400 });
    }
    const language = body.transcriptionLanguage ?? "en-IN";
    if (!["en-IN", "hi-IN", "unknown"].includes(language)) {
      return NextResponse.json({ error: "Unsupported transcription language." }, { status: 400 });
    }

    const svc = serviceClient();
    const { data, error } = await svc
      .from("courses")
      .insert({
        owner_id: user.id,
        code: body.code.trim(),
        title: body.title.trim(),
        term: body.term?.trim() || null,
        transcription_language: language,
      })
      .select("id, code, title, term, join_code, transcription_language")
      .single();

    if (error) throw dbFailure("courses.create", error, "Could not create the course. Please try again.");
    return NextResponse.json({ course: data });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
