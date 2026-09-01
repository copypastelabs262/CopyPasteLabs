import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import ClassShell from "@/app/_components/shell/ClassShell";

// Everything inside one class — Home, Ask, Lectures (and each lecture),
// Assignments — renders through this layout, which is what makes the class
// context persistent instead of rediscovered per page. The guard lives here
// once; the child pages no longer each re-check the session.
export default async function ClassLayout({
  children, params,
}: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const { id } = await params;
  return <ClassShell courseId={id}>{children}</ClassShell>;
}
