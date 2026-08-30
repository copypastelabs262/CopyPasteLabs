import { NextResponse } from "next/server";
import { requireUser, errorResponse } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/service";

// Students join with the course's join code. No invitations, no roster import --
// a code is the smallest thing that works and is trivially revocable.
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { joinCode } = (await request.json()) as { joinCode?: string };
    if (!joinCode?.trim()) return NextResponse.json({ error: "Enter a join code." }, { status: 400 });

    const svc = serviceClient();
    const { data: course } = await svc
      .from("courses").select("id, code, title, owner_id")
      .eq("join_code", joinCode.trim().toLowerCase()).maybeSingle();
    if (!course) return NextResponse.json({ error: "No course with that join code." }, { status: 404 });
    if (course.owner_id === user.id) {
      return NextResponse.json({ error: "You already own this course." }, { status: 400 });
    }

    const { error } = await svc
      .from("enrollments")
      .upsert({ course_id: course.id, user_id: user.id, role: "student" }, { onConflict: "course_id,user_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ course: { id: course.id, code: course.code, title: course.title } });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
