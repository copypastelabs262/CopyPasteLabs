import { Suspense } from "react";
import AskWorkspace from "@/app/_components/AskWorkspace";

// Ask as a destination, not a widget: the class's conversation surface.
// The Suspense boundary exists because AskWorkspace reads ?c= (the resumed
// conversation) through useSearchParams, which pushes everything above the
// nearest boundary into client-side rendering.
export default function AskPage() {
  return (
    <Suspense fallback={<p className="py-10 text-sm text-ink-faint">Loading…</p>}>
      <AskWorkspace />
    </Suspense>
  );
}
