import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import CoursesClient from "@/app/_components/CoursesClient";

export default async function CoursesPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");
  return <CoursesClient />;
}
