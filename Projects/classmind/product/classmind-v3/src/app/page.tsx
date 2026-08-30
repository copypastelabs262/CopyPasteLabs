import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { ButtonLink } from "./_components/ui";

// The only screen an anonymous visitor sees, and it has exactly one job: get
// them signed in. Anyone who already has a session is sent to their courses
// before this renders.
//
// One call to action — and one picture. The product's whole claim is "every
// answer traced back to the second it was spoken", which is the most
// demo-able sentence in the building, so the right half of the hero SHOWS it:
// an answer, its timestamp, and the waveform underneath with the playhead lit
// at that second. The Trace. No screenshots, no feature grid.

// The vignette's waveform. Deterministic pseudo-random heights so the server
// and client render the same bars — Math.random() here would be a hydration
// error wearing a costume.
const BARS = Array.from({ length: 48 }, (_, i) => {
  const h = 8 + Math.abs(Math.sin(i * 2.7)) * 22 + Math.abs(Math.sin(i * 0.9)) * 8;
  return Math.round(h);
});
const PLAYHEAD = 31; // index of the lit bar — "42:17"

const STEPS: { title: string; body: string }[] = [
  {
    title: "Upload a lecture recording",
    body: "One audio file, straight from the classroom. That is the only input.",
  },
  {
    title: "It is transcribed, then read",
    body: "First into words, then into what was actually taught, assigned, and announced.",
  },
  {
    title: "The lecturer confirms what matters",
    body: "Only the things students must act on wait for a human. Teaching goes live on its own.",
  },
  {
    title: "Students ask, answers cite",
    body: "What was covered, what was assigned, what they missed — every answer traced to its second.",
  },
];

export default async function Home() {
  const user = await currentUser();
  if (user) redirect("/courses");

  return (
    <div className="motion-rise">
      {/* The hero: claim on the left, proof on the right. */}
      <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-6">
          <p className="eyebrow-mono">for classrooms that talk faster than notes</p>
          <h1 className="font-display mt-3 text-[2.7rem] leading-[1.04] font-medium tracking-[-0.015em] text-balance text-ink sm:text-[3.6rem]">
            Understand any lecture you missed.
          </h1>
          <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-ink-soft">
            ClassMind listens to a recorded lecture and turns it into knowledge students can ask
            questions of &mdash; with every answer traced back to the second it was spoken.
          </p>
          <div className="mt-9">
            <ButtonLink tone="primary" size="lg" href="/signin">
              Sign in
            </ButtonLink>
          </div>
        </div>

        {/* The Trace. Decorative composition, real promise: aria-hidden
            because the headline and steps already say everything it shows. */}
        <div className="lg:col-span-6" aria-hidden="true">
          <div className="glass-hero rounded-2xl p-6 sm:p-7">
            <p className="eyebrow-mono">asked in cc101</p>
            <p className="mt-2 text-[15px] font-medium text-ink">
              &ldquo;What was assigned this week?&rdquo;
            </p>

            <div className="glass-2 mt-5 rounded-xl p-4">
              <p className="text-sm leading-relaxed text-ink-soft">
                Prepare the virtualization case study before Friday&rsquo;s class &mdash; your
                lecturer called it{" "}
                <span className="cm-flash rounded px-0.5 text-ink">
                  &ldquo;the one thing I will assume you have read.&rdquo;
                </span>
              </p>
              <p className="mt-3">
                <span
                  className="chip-mono inline-flex items-center gap-1.5 !border-warn/30 text-warn"
                  style={{ background: "rgba(232,177,92,0.10)" }}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-warn" />
                  spoken at 42:17
                </span>
              </p>
            </div>

            {/* The waveform, with the cited second lit. */}
            <div className="mt-6 flex h-12 items-end gap-[3px]">
              {BARS.map((h, i) => (
                <span
                  key={i}
                  className="flex-1 rounded-full"
                  style={
                    i === PLAYHEAD
                      ? {
                          height: "100%",
                          background: "var(--warn)",
                          boxShadow: "0 0 14px rgba(232,177,92,0.16)",
                        }
                      : {
                          height: `${h}px`,
                          background:
                            i < PLAYHEAD ? "rgba(148,163,184,0.38)" : "rgba(148,163,184,0.16)",
                        }
                  }
                />
              ))}
            </div>
            <div className="mt-2 flex justify-between font-mono text-[10px] tracking-[0.12em] text-ink-faint uppercase">
              <span>00:00</span>
              <span className="text-warn">42:17</span>
              <span>58:40</span>
            </div>
          </div>
        </div>
      </div>

      {/* The sequence — a numbered spine, not a feature grid. It says what
          happens to a recording, which is the only thing a first-time visitor
          is actually trying to work out. */}
      <ol className="mt-20 max-w-2xl sm:mt-24">
        {STEPS.map((step, i) => (
          <li key={step.title} className="relative flex gap-5 pb-10 last:pb-0">
            {/* The spine connecting the steps. */}
            {i < STEPS.length - 1 ? (
              <span
                aria-hidden="true"
                className="absolute top-8 left-[15px] h-[calc(100%-2.4rem)] w-px bg-line"
              />
            ) : null}
            <span className="chip-mono z-10 flex h-8 w-8 shrink-0 items-center justify-center !rounded-full text-[12px] text-ink-soft">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0 pt-1">
              <h2 className="text-[15px] font-semibold tracking-[-0.008em] text-ink">
                {step.title}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
