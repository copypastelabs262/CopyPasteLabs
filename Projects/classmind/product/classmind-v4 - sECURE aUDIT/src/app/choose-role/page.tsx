import { redirect } from "next/navigation";
import { authClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { ensureProfile } from "@/lib/profile";
import { safeNext } from "@/lib/safe-next";
import ChooseRoleForm from "./ChooseRoleForm";

// Where an authenticated account with NO role lands. Two ways to get here: a
// Google user whose sign-up carried no role selection (they used the sign-in
// mode, or the pending-role cookie was lost), and an email user who confirmed
// their address later so sign-up's /api/profile call never ran.
//
// This page is the LAST resort, not the first: ensureProfile below replays any
// explicit selection already on record (user_metadata.role from email sign-up)
// before asking, so a user who already answered the question is never asked
// twice. What this page will never do is guess -- an account with no recorded
// selection gets a question, not a default. That is the whole fix for the
// students-created-as-faculty bug.
export default async function ChooseRolePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const dest = safeNext(next ?? null);

  const supabase = await authClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/signin");

  // Replays a STUDENT selection from metadata when present; insert-only, so an
  // existing profile is never touched, and a faculty signal is never
  // auto-provisioned (it routes here to enter the code). A role on record means
  // nothing to ask.
  const ensured = await ensureProfile(serviceClient(), data.user, null);
  if (ensured.role) redirect(dest);

  // Prefill the name from the Google/identity profile so the common case is a
  // single confirmation, while staying fully editable.
  const meta = (data.user.user_metadata ?? {}) as { full_name?: string; name?: string };
  const initialName = (meta.full_name ?? meta.name ?? "").trim();

  return <ChooseRoleForm next={dest} initialName={initialName} />;
}
