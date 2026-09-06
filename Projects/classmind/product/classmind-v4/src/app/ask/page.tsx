import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import AskChat from "@/app/_components/AskChat";
import { Page } from "@/app/_components/ui";

// STUDENT ASK — the global scope, as a persistent chat WORKSPACE (Phase 3).
// "I open ClassMind and continue my academic work." A conversation sidebar on
// the left (history + new chat), the conversation itself on the right, over the
// same grounded, cited, cost-routed intelligence the course and lecture Ask
// already use. No class shell around it, because no single class IS it: the
// server enumerates the student's whole accessible academic world and answers
// within exactly that boundary.
//
// Server-guarded like /courses: an anonymous visitor never receives the markup,
// and an account that never chose a role is sent to choose one. Suspense
// because AskChat's children read ?c= (the resumed conversation) through
// useSearchParams, which would otherwise force the whole route to client render.
export default async function StudentAskPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");
  if (!user.role) redirect("/choose-role");

  return (
    <Page>
      <Suspense fallback={<p className="py-10 text-sm text-ink-faint">Loading…</p>}>
        <AskChat />
      </Suspense>
    </Page>
  );
}
