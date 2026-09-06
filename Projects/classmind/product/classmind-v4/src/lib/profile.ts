import "server-only";
import type { User } from "@supabase/supabase-js";
import { serviceClient } from "@/lib/supabase/service";
import { parseRole, planProfileProvision, type ProfileRole } from "@/lib/profile-role";

// THE ONE PLACE a profiles row is provisioned from auth signals. The OAuth
// callback and the /choose-role page both call this; the decision itself is
// planProfileProvision, which is pure and tested offline. Keeping the write
// here means "insert, never upsert" is enforced once: an existing row is never
// touched, so no sign-in path can overwrite a role.

export interface EnsuredProfile {
  role: ProfileRole | null;
  created: boolean;
}

export async function ensureProfile(
  user: Pick<User, "id" | "user_metadata">,
  pendingRole: ProfileRole | null,
): Promise<EnsuredProfile> {
  const svc = serviceClient();
  const { data: existing } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const metadata = (user.user_metadata ?? null) as
    | { full_name?: string; name?: string; role?: unknown }
    | null;

  const plan = planProfileProvision({
    hasProfile: Boolean(existing),
    pendingRole,
    metadataRole: parseRole(metadata?.role),
  });

  if (plan.action === "keep") return { role: parseRole(existing?.role), created: false };
  if (plan.action === "choose") return { role: null, created: false };

  const { error } = await svc.from("profiles").insert({
    id: user.id,
    full_name: metadata?.full_name?.trim() || metadata?.name?.trim() || null,
    role: plan.role,
  });
  if (error) {
    // A race with another provisioning pass (two tabs, callback + chooser):
    // the first writer wins, this caller reports what actually exists. Any
    // other failure reports "no role" -- which routes to the chooser, never
    // to a silently invented role.
    const { data: raced } = await svc
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    return { role: parseRole(raced?.role), created: false };
  }
  return { role: plan.role, created: true };
}
