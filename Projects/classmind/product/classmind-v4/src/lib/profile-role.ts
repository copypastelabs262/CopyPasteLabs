// The role-selection contract, pure and importable from anywhere: the sign-in
// page (client), the OAuth callback (server), profile provisioning (server),
// and the offline test suite.
//
// THE RULE THIS MODULE ENFORCES: a role exists only where a person explicitly
// chose one. Before 2026-09-06 five independent code paths resolved a missing
// role to "faculty" -- UI initial state, callback query fallback, /api/profile
// coercion, the schema default, and the session fallback -- so every dropped
// signal silently created the privileged account type. All five are gone; a
// missing role is now a state the product routes to /choose-role, never a
// value it invents.

export type ProfileRole = "faculty" | "student";

// The ONLY parser for role signals. Strict equality: "FACULTY", "Faculty ",
// "admin", null and undefined are all the same answer -- no signal. Callers
// treat null as "ask the user", never as a default.
export function parseRole(value: unknown): ProfileRole | null {
  return value === "faculty" || value === "student" ? value : null;
}

// Carries the role selected on the sign-in page across the Google OAuth round
// trip. A COOKIE, deliberately not a query param: Supabase glob-matches the
// entire redirect URL against its allow-list, and an entry that does not match
// the query string silently reroutes to the Site URL, dropping the param --
// the recorded 2026-08-31 failure, and the mechanism that created students as
// faculty. A cookie set on this origin survives the provider round trip no
// matter what the allow-list says. Short-lived and single-use: the callback
// deletes it on every pass, consumed or not.
export const PENDING_ROLE_COOKIE = "cm-pending-role";
export const PENDING_ROLE_MAX_AGE_SECONDS = 600;

export interface ProvisionInput {
  // A profiles row already exists for this account.
  hasProfile: boolean;
  // Explicit selection carried across the OAuth redirect (the cookie).
  pendingRole: ProfileRole | null;
  // Explicit selection recorded in auth user_metadata at email sign-up. This
  // is how a role survives the email-confirmation detour, where the sign-up
  // page's /api/profile call never runs because there is no session yet.
  metadataRole: ProfileRole | null;
}

export type ProvisionPlan =
  // A profile exists: signals are IGNORED, whatever they say. Signing in again
  // must never overwrite a role, so an existing row always wins.
  | { action: "keep" }
  // No profile, and an explicit selection is on record: create from it. The
  // pending cookie outranks metadata because it is the more recent choice.
  | { action: "create"; role: ProfileRole; source: "pending" | "metadata" }
  // No profile and no explicit selection has EVER happened for this account.
  // The answer is a question to the user, not a guess.
  | { action: "choose" };

export function planProfileProvision(input: ProvisionInput): ProvisionPlan {
  if (input.hasProfile) return { action: "keep" };
  if (input.pendingRole) return { action: "create", role: input.pendingRole, source: "pending" };
  if (input.metadataRole) return { action: "create", role: input.metadataRole, source: "metadata" };
  return { action: "choose" };
}
