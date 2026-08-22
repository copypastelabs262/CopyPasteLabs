import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import LectureClient from "@/app/_components/LectureClient";

export default async function LecturePage({
  params,
}: { params: Promise<{ id: string; lectureId: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const { id, lectureId } = await params;
  return <LectureClient courseId={id} lectureId={lectureId} />;
}
