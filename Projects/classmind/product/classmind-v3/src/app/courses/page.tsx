import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import CoursesClient from "@/app/_components/CoursesClient";

// The signed-in home. The guard stays on the server so an unauthenticated
// visitor never receives the markup at all, rather than being bounced by the
// client after a flash of someone else's shell.
export default async function CoursesPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  // Only the three fields the screen actually renders or branches on. Passing
  // the whole SessionUser would put the account id into the HTML of every page
  // load for no reason the interface can point at.
  return <CoursesClient user={{ fullName: user.fullName, email: user.email, role: user.role }} />;
}
