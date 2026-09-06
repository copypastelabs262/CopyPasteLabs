import { Suspense } from "react";
import AskChat from "@/app/_components/AskChat";

// A class's landing IS its Ask — now the same chat WORKSPACE as Global Ask,
// scoped to this course (Phase 4): a conversation sidebar of this course's
// threads on the left, the conversation on the right, over the same grounded,
// cited, cost-routed intelligence. Course access is enforced server-side by the
// shell's layout guard and by every API this calls (requireCourseAccess); the
// courseId only selects the scope's endpoints and label.
//
// Suspense because AskChat's children read ?c= (the resumed conversation)
// through useSearchParams, which would otherwise force this route to client
// render. The session guard and the class shell live in layout.tsx.
export default async function ClassAskLandingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<p className="py-10 text-sm text-ink-faint">Loading…</p>}>
      <AskChat courseId={id} />
    </Suspense>
  );
}
