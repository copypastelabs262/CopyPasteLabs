import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import ProfileClient from "@/app/_components/ProfileClient";

// The account area. Guarded like every signed-in surface; the editable bits
// (only the name) go through /api/profile, which already refuses to change the
// role. Email and role are shown, not edited — email belongs to the sign-in
// identity, and role is a deliberate, gated decision, not a profile field.
export default async function ProfilePage() {
  const user = await currentUser();
  if (!user) redirect("/signin");
  if (!user.role) redirect("/choose-role");

  return (
    <ProfileClient
      fullName={user.fullName}
      email={user.email}
      role={user.role}
    />
  );
}
