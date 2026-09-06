import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import AskWorkspace from "@/app/_components/AskWorkspace";
import { Page } from "@/app/_components/ui";

// STUDENT ASK — the global scope, as a destination. "I am talking to
// ClassMind about my entire academic life." No class shell around it, because
// no single class IS it: the server enumerates the student's whole accessible
// academic world and answers within exactly that boundary.
//
// Server-guarded like /courses: an anonymous visitor never receives the
// markup, and an account that never chose a role is sent to choose one.
export default async function StudentAskPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");
  if (!user.role) redirect("/choose-role");

  return (
    <Page>
      <Suspense fallback={<p className="py-10 text-sm text-ink-faint">Loading…</p>}>
        <AskWorkspace
          global
          intro={{
            title: "Your academic context, in one place",
            description:
              "Ask across every subject you're in — assignments, deadlines, what was taught, what to work on. Every answer is grounded in what was actually recorded, and says which subject it came from.",
          }}
          suggestions={[
            "Do I have anything to do?",
            "What assignments do I have?",
            "What topics were covered?",
            "What should I work on first?",
          ]}
        />
      </Suspense>
    </Page>
  );
}
