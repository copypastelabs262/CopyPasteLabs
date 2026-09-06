import { Suspense } from "react";
import AskWorkspace from "@/app/_components/AskWorkspace";

// A class's landing IS its Ask. The old "Home" tab merely re-listed the
// Assignments and Lectures tabs, so it was removed (Phase 2): opening a class
// drops you straight into the thing the product is for — asking it questions,
// scoped to this class. The session guard and the shell live in layout.tsx.
//
// Suspense because AskWorkspace reads ?c= (a resumed conversation) through
// useSearchParams, which would otherwise push this whole route to client render.
export default function ClassAskLandingPage() {
  return (
    <Suspense fallback={<p className="py-10 text-sm text-ink-faint">Loading…</p>}>
      <AskWorkspace />
    </Suspense>
  );
}
