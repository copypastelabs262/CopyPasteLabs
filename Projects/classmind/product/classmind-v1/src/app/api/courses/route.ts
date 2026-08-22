import { NextResponse } from "next/server";
import { requireUser, errorResponse } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/service";

// Courses the user owns, plus courses they are enrolled in. One route, because
// the two lists are rendered together and a student may also teach.
export async function GET() {
  try {
    const user = await requireUser();
    const svc = serviceClient();

    const { data: owned } = await svc
      .from("courses")
      .select("id, code, title, term, join_code, transcription_language, created_at")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });

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

export async function POST(request: Request) {
  try {
    const user = await requireUser();
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

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ course: data });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
