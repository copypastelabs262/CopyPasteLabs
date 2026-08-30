import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { ButtonLink } from "./_components/ui";

// The only screen an anonymous visitor sees, and it has exactly one job: get
// them signed in. Anyone who already has a session has no business reading a
// pitch for the product they are logged into, so they are sent to their
// courses before this renders.
//
// No feature grid and no second call to action. A landing page with three
// buttons is a landing page that has decided its visitor's next step is a
// choice, and here it is not one.

export default async function Home() {
  const user = await currentUser();
  if (user) redirect("/courses");

  return (
    <div className="motion-rise mx-auto max-w-2xl">
      <h1 className="text-4xl leading-[1.08] font-semibold tracking-[-0.025em] text-balance text-ink sm:text-5xl">
        Understand any lecture you missed.
      </h1>
      <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-ink-soft">
        ClassMind listens to a recorded lecture and turns it into knowledge students can
        ask questions of &mdash; with every answer traced back to the second it was spoken.
      </p>

      <div className="mt-10">
        <ButtonLink tone="primary" size="lg" href="/signin">
          Sign in
        </ButtonLink>
      </div>

      {/* The sequence, not a feature list -- it says what happens to a
          recording, which is the only thing a first-time visitor is actually
          trying to work out. Hairlines rather than cards: three sentences are
          not three groups. */}
      <ul className="mt-16 border-t border-line text-sm text-ink-soft sm:mt-20">
        <li className="border-b border-line py-4">Upload a lecture recording.</li>
        <li className="border-b border-line py-4">
          It is transcribed, then read for what was actually taught.
        </li>
        <li className="border-b border-line py-4">
          Students can ask what was covered, what was assigned, and what they missed.
        </li>
        <li className="border-b border-line py-4">
          You are asked to confirm only the things students must act on.
        </li>
      </ul>
    </div>
  );
}
