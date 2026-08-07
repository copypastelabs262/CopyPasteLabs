// The contract every processing step fills in — not enforced by a database
// yet (Milestone 2+ wires it into Supabase), just the shape everything
// downstream agrees on. See Constitution Article IV and capture-contract.md.
export interface ProcessingProvenance {
  engine: string
  // Dated, never a floating alias (Constitution IV) — e.g.
  // "saarika:v2.5-2026-06-15", not "latest".
  modelSnapshot: string
  modelVersion: string
  decodingParams: Record<string, unknown>
  commitHash: string
  processedAt: string // ISO 8601 UTC
  processingTimeMs: number
  costEstimate: { amount: number; currency: string } | null
  language: string
}
