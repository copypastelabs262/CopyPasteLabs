import { NextResponse } from "next/server";
import { requireUser, errorResponse } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/service";

// Creates or updates the caller's own profile row. Never takes a user id from
// the request body -- it uses the session, so one account cannot write another's.
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as { fullName?: string; role?: string };
    const role = body.role === "student" ? "student" : "faculty";
    const svc = serviceClient();
    const { error } = await svc.from("profiles").upsert({
      id: user.id, full_name: body.fullName?.trim() || null, role,
    }, { onConflict: "id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, role });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
