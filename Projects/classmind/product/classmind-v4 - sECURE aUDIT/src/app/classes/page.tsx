import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import CoursesClient from "@/app/_components/CoursesClient";

// My Classes — the list of a person's classes, as contexts to open. Same guard
// as the home; the same client, in its "classes" variant, so the join/create
// dialogs and the one overview fetch are shared, not duplicated.
export default async function ClassesPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");
  if (!user.role) redirect("/choose-role");

  return (
    <CoursesClient
      user={{ fullName: user.fullName, email: user.email, role: user.role }}
      variant="classes"
    />
  );
}
