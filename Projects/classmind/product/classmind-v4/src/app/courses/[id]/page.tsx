import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import CourseClient from "@/app/_components/CourseClient";

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const { id } = await params;
  return <CourseClient courseId={id} />;
}
