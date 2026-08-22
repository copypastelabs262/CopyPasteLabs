import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import LectureClient from "@/app/_components/LectureClient";

export default async function LecturePage({
  params,
}: { params: Promise<{ id: string; lectureId: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const { id, lectureId } = await params;
  // LectureClient reads ?t= through useSearchParams, which pushes everything up
  // to the nearest Suspense boundary into client-side rendering. Without one
  // that boundary is the whole route; with one it is just the transcript.
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
      <LectureClient courseId={id} lectureId={lectureId} />
    </Suspense>
  );
}
