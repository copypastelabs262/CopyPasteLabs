import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import LectureClient from "@/app/_components/LectureClient";
import { Skeleton } from "@/app/_components/ui";

// Shaped like the lecture that is about to replace it -- an eyebrow, a large
// title, a line of metadata, then content -- so the page does not jump when the
// payload lands. "Loading…" would be honest and would guarantee that jump.
function LectureSkeleton() {
  return (
    <div role="status" aria-label="Loading the lecture" className="space-y-6">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-9 w-2/3 max-w-md" />
      <Skeleton className="h-4 w-56" />
      <Skeleton className="h-40 w-full rounded-2xl" />
    </div>
  );
}

export default async function LecturePage({
  params,
}: { params: Promise<{ id: string; lectureId: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const { id, lectureId } = await params;
  // LectureClient reads ?t= through useSearchParams, which pushes everything up
  // to the nearest Suspense boundary into client-side rendering. Without one
  // that boundary is the whole route; with one it is just this subtree.
  return (
    <Suspense fallback={<LectureSkeleton />}>
      <LectureClient courseId={id} lectureId={lectureId} />
    </Suspense>
  );
}
