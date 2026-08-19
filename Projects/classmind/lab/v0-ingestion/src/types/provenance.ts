// The contract every processing step fills in — not enforced by a database
// yet (Milestone 2+ wires it into Supabase), just the shape everything
// downstream agrees on. See Constitution Article IV and capture-contract.md.
export interface ProcessingProvenance {
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
  // The language the run was configured with. "unknown" means the engine was
  // asked to detect it rather than being told.
  configuredLanguage: string
  // Provider API version the call went through.
  apiVersion: string
  // Provenance obligations this record could not meet. Stated here rather
  // than silently dropped, so a reader can see what is missing and why.
  limitations: string[]
}
