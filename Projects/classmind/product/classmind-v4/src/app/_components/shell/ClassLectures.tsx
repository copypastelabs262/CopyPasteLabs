"use client";

import FacultyWorkspace from "../FacultyWorkspace";
import StudentCourseView from "../StudentCourseView";
import { Page, Skeleton } from "@/app/_components/ui";
import { useClassData } from "./ClassContext";

// LECTURES — the recordings themselves.
//
// The owner's surface is the working pipeline view (upload, per-lecture
// progress, course context); the student's is the readable index. Both are
// the v3 components re-homed into the tab, slimmed of the concerns that now
// have tabs of their own (Ask, assignments, the course-wide knowledge dump).
export default function ClassLectures() {
  const { courseId, isOwner, lectures, context, loading, refresh } = useClassData();

  if (loading) {
    return (
      <Page>
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </Page>
    );
  }

  return (
    <Page>
      {isOwner ? (
        <FacultyWorkspace
          courseId={courseId}
          lectures={lectures}
          context={context}
          onChanged={refresh}
        />
      ) : (
        <StudentCourseView courseId={courseId} lectures={lectures} />
      )}
    </Page>
  );
}
