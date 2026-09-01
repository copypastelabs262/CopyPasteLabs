// The contract every processing step fills in — not enforced by a database
// yet (Milestone 2+ wires it into Supabase), just the shape everything
// downstream agrees on. See Constitution Article IV and capture-contract.md.
export interface ProcessingProvenance {
  // The run this artefact belongs to, written into the record itself.
  //
  // Added after a replayed transcript from one recording was stored against a
  // different lecture. The row's own id was correct throughout -- the failure
  // was upstream, in which provider answered -- but a provenance record that
  // does not name its own run cannot be audited once it is copied, exported or
  // read out of context. `providerJobId` is here for the same reason: it is the
  // only identifier that ties this record to a specific call to a specific
  // provider, and it is what makes "prove this transcript came from this
  // audio" a question with an answer.
  lectureId: string
  providerJobId: string | null
  engine: string
  // Constitution IV asks for a dated snapshot and forbids a floating alias.
  // Some providers publish only an alias; when that happens the alias is
  // recorded here verbatim and `modelSnapshotIsDated` is false. A date is
  // never invented to satisfy the field.
  modelSnapshot: string
  modelSnapshotIsDated: boolean
  modelVersion: string
  decodingParams: Record<string, unknown>
  commitHash: string
  processedAt: string // ISO 8601 UTC
  processingTimeMs: number
  costEstimate: { amount: number; currency: string } | null
  // The language actually reported by the engine when it reports one,
  // otherwise the language the run was configured with.
  language: string
  // The engine's own confidence in that language, when it reports one.
  //
  // Structured rather than left as prose inside `limitations`, because the
  // question it answers -- "show me every lecture transcribed below 0.8" -- is
  // a query, and a number recoverable only by regexing an English sentence is
  // not queryable. The 0.617 that produced romanized Arabic is exactly the
  // value a sweep like that needs to find.
  languageProbability: number | null
  // The language the run was configured with. "unknown" means the engine was
  // asked to detect it rather than being told.
  configuredLanguage: string
  // Provider API version the call went through.
  apiVersion: string
  // Provenance obligations this record could not meet. Stated here rather
  // than silently dropped, so a reader can see what is missing and why.
  limitations: string[]
}
