import "server-only";
import { authClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";

export interface SessionUser {
  id: string;
  email: string | null;
  fullName: string | null;
  role: "faculty" | "student";
}

// Reads the signed-in user and their profile. Returns null when signed out --
// callers decide whether that is an error or just an anonymous page.
export async function currentUser(): Promise<SessionUser | null> {
  const supabase = await authClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const svc = serviceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("full_name, role")
    .eq("id", data.user.id)
    .maybeSingle();

  // A profile is created at sign-up, but a user created another way (dashboard,
  // admin API) may not have one. Default rather than 500.
  return {
    id: data.user.id,
    email: data.user.email ?? null,
    fullName: (profile?.full_name as string | null) ?? null,
    role: ((profile?.role as string | null) ?? "faculty") as "faculty" | "student",
  };
}

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "Sign in to continue.");
  return user;
}

// Owner-only. Guards everything that can create or change course data,
// including every review action.
export async function requireCourseOwner(courseId: string, userId: string) {
  const svc = serviceClient();
  const { data, error } = await svc
    .from("courses")
    .select("id, owner_id, code, title, term, transcription_language, join_code")
    .eq("id", courseId)
    .maybeSingle();
  if (error || !data) throw new HttpError(404, "Course not found.");
  if (data.owner_id !== userId) throw new HttpError(403, "Not your course.");
  return data;
}

// Owner or enrolled student. Guards read paths only. Note that being allowed to
// READ a course never implies being allowed to see candidates -- those routes
// call requireCourseOwner instead.
export async function requireCourseAccess(courseId: string, userId: string) {
  const svc = serviceClient();
  const { data: course } = await svc
    .from("courses")
    .select("id, owner_id, code, title, term, transcription_language, join_code")
    .eq("id", courseId)
    .maybeSingle();
  if (!course) throw new HttpError(404, "Course not found.");
  if (course.owner_id === userId) return { course, isOwner: true };

  const { data: enrolment } = await svc
    .from("enrollments")
    .select("user_id")
    .eq("course_id", courseId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!enrolment) throw new HttpError(403, "You are not enrolled in this course.");
  return { course, isOwner: false };
}

export function errorResponse(err: unknown): { body: { error: string }; status: number } {
  if (err instanceof HttpError) return { body: { error: err.message }, status: err.status };
  return {
    body: { error: err instanceof Error ? err.message : "Unexpected error." },
    status: 500,
  };
}
