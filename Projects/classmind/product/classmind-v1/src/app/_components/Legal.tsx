// Shared shell for /privacy and /terms.
//
// Two pages that must stay visually and structurally identical -- Google's OAuth
// consent review checks both, and a policy that looks improvised undermines the
// one thing these documents exist to establish. Kept here rather than duplicated
// so a change to one is a change to both.

export function LegalPage({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  updated: string;
  intro: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <article className="mx-auto max-w-2xl py-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500">
        Last updated {updated}
      </p>
      <div className="mt-6 rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
        {intro}
      </div>
      {children}
    </article>
  );
}

export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-10 text-base font-semibold">{children}</h2>;
}

export function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{children}</p>
  );
}

export function UL({ children }: { children: React.ReactNode }) {
  return (
    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
      {children}
    </ul>
  );
}

// For the disclosures a reader would be worst served by skimming past.
export function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-md border-l-2 border-zinc-900 bg-zinc-50 p-4 text-sm leading-6 text-zinc-800 dark:border-zinc-100 dark:bg-zinc-900 dark:text-zinc-200">
      {children}
    </div>
  );
}
