import { NextResponse } from "next/server";
import { requireUser, errorResponse, dbFailure } from "@/lib/auth";
import { enforceMemoryLimit, LIMITS } from "@/lib/rate-limit";
import { serviceClient } from "@/lib/supabase/service";

// Students join with the course's join code. No invitations, no roster import --
// a code is the smallest thing that works and is trivially revocable.
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    // join_code is encode(gen_random_bytes(4),'hex'): 32 bits, and this
    // route said yes or no to a guess as fast as the network allowed. A
    // correct guess enrols the attacker into a stranger's course and hands
    // them its published lectures, knowledge and evidence. Guessing is now
    // budgeted; the code itself is unchanged.
    enforceMemoryLimit("enroll", user.id, LIMITS.enroll, "join");
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
    if (error) throw dbFailure("enroll", error, "Could not join that course. Please try again.");

    return NextResponse.json({ course: { id: course.id, code: course.code, title: course.title } });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
