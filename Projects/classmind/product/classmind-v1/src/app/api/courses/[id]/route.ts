import { NextResponse } from "next/server";
import { requireUser, requireCourseAccess, errorResponse } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/service";

// Course workspace payload. Deliberately role-aware: course_context and the raw
// lecture list are faculty material, so a student gets neither -- they get the
// course shell and read confirmed knowledge from a different route.
export async function GET(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const { course, isOwner } = await requireCourseAccess(id, user.id);
    const svc = serviceClient();

    const { data: lectures } = await svc
      .from("lectures")
      .select("id, title, status, provider_status, original_filename, file_size_bytes, created_at, completed_at, error_message, recorded_on")
      .eq("course_id", id)
      .order("created_at", { ascending: false });

    const context = isOwner
      ? (await svc
          .from("course_context")
          .select("id, kind, title, body, created_at")
          .eq("course_id", id)
          .order("created_at", { ascending: false })).data ?? []
      : [];

    // Students only ever see lectures that reached `ready`; a half-processed
    // lecture is not course material yet.
    const visible = isOwner
      ? lectures ?? []
      : (lectures ?? []).filter((l) => l.status === "ready");

    return NextResponse.json({
      course: isOwner ? course : { ...course, join_code: undefined },
      isOwner,
      lectures: visible,
      context,
    });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
