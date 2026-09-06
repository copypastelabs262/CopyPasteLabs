import { NextResponse } from "next/server";
import { requireUser, errorResponse } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/service";
import { parseRole } from "@/lib/profile-role";
import {
  verifyFacultyCode,
  facultyCodeConfigured,
  facultyAttemptBlocked,
  recordFacultyFailure,
  clearFacultyAttempts,
} from "@/lib/faculty-code";

// Creates the caller's own profile row, or updates their name. Never takes a
// user id from the request body -- it uses the session, so one account cannot
// write another's.
//
// ROLE RULES (the 2026-09-06 fix):
//  - Creating a profile REQUIRES an explicit, valid role. The old behaviour --
//    "anything that isn't 'student' is 'faculty'" -- was one of the five silent
//    fallbacks that created students as faculty accounts.
//  - An existing profile's role is IMMUTABLE here. No sign-in, re-submit, or
//    stray call changes who an account is; changing a role would be a
//    deliberate product feature with its own confirmation, and it does not
//    exist yet.
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as { fullName?: string; role?: unknown };
    const requestedRole = parseRole(body.role);
    const fullName =
      typeof body.fullName === "string" && body.fullName.trim() ? body.fullName.trim() : null;

    const svc = serviceClient();
    const { data: existing } = await svc
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (!existing) {
      if (!requestedRole) {
        return NextResponse.json(
          { error: "Choose 'student' or 'faculty' to finish setting up your account." },
          { status: 400 },
        );
      }
      const { error } = await svc
        .from("profiles")
        .insert({ id: user.id, full_name: fullName, role: requestedRole });
      if (error) {
        // A race with another provisioning pass (OAuth callback, /choose-role,
        // a second tab): the first writer wins, and this caller is told what
        // actually stands rather than silently overwriting it.
        const { data: raced } = await svc
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();
        if (!raced) return NextResponse.json({ error: error.message }, { status: 500 });
        if (raced.role !== requestedRole) {
          return NextResponse.json(
            { error: `This account is already set up as ${raced.role}.` },
            { status: 409 },
          );
        }
        return NextResponse.json({ ok: true, role: raced.role });
      }
      return NextResponse.json({ ok: true, role: requestedRole });
    }

    if (requestedRole && requestedRole !== existing.role) {
      return NextResponse.json(
        { error: `This account's role is already set to ${existing.role} and cannot be changed here.` },
        { status: 409 },
      );
    }

    if (fullName) {
      const { error } = await svc
        .from("profiles")
        .update({ full_name: fullName })
        .eq("id", user.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, role: existing.role });
  } catch (err) {
    const { body, status } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
