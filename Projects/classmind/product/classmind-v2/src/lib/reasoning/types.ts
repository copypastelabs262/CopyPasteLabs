import type { ProviderTelemetry } from "./scheduler.ts";

// The boundary between this app and any reasoning model.
//
// Deliberately narrow: one method, JSON in and JSON out, no streaming, no chat
// history, no tools. Everything the product asks a model to do is a single
// bounded question about a bounded slice of one transcript, and keeping the
// interface that small is what makes the model swappable and the calls
// auditable.

export interface ReasoningRequest {
  // Kept separate so the adapter can place them however the provider expects.
  system: string;
  user: string;
  // Callers always want JSON. Providers differ in how they are asked for it,
  // so the request states the intent and the adapter handles the mechanics.
  expectJson: boolean;
  // THE ENGINE'S OUTPUT CONTRACT, as a JSON Schema.
  //
  // Declared here, by the engine, because the shape of a ClassMind knowledge
  // item is ClassMind's decision -- not Gemini's, and not the adapter's. The
  // adapter's job is to translate this into whatever the provider understands:
  // a strict json_schema where one is supported, a looser json_object where it
  // is not, and prose instructions where neither exists. Every provider gets
  // asked for the SAME contract in its own dialect, which is what keeps the
  // output comparable when the model is swapped.
  //
  // Optional: a caller that only needs prose (the student answer composer) sets
  // expectJson false and omits this entirely.
  jsonSchema?: object;
  maxTokens?: number;
}

export interface ReasoningResponse {
  text: string;
  model: string;
  // The provider's own request id, kept so a bad reconstruction can be traced
  // to the exact call that produced it.
  requestId: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
}

// What this provider can take, as opposed to what sarvam-105b happened to need.
//
// NOTHING READS THIS YET, deliberately. The window size and completion cap in
// reconstruct.ts were tuned to one model's thinking overhead, and moving them
// onto the provider changes how the lecture is divided -- which changes recall.
// That is an optimisation, and the agreed order is provider replacement first,
// evaluation second, optimisation third. The shape is declared now so the
// adapters can carry honest values from the start; reconstruct.ts starts
// reading them only once the harness can prove the change costs nothing.
export interface ProviderCapabilities {
  maxWindowChars: number;
  maxCompletionTokens: number;
  supportsJsonSchema: boolean;
  // ---- EXECUTION LIMITS -------------------------------------------------
  //
  // How fast this provider will tolerate being asked, declared HERE rather
  // than in reconstruct.ts. The pipeline says what work it needs done; how
  // quickly a given provider can be asked to do it is a property of the
  // provider, and putting Gemini's free-tier ceiling inside the reconstruction
  // loop would make swapping providers a code change again.
  //
  // These are read by the scheduler and by inParallel. Nothing else.
  requestsPerMinute: number;
  maxConcurrency: number;
}

export interface ReasoningProvider {
  readonly id: string;
  readonly model: string;
  // Optional so a hand-built stub -- the reconstruction suite's fake provider,
  // for one -- stays a valid provider without restating limits it does not have.
  readonly capabilities?: ProviderCapabilities;
  // Live request counters for this provider instance. Read once at the end of a
  // run so the ledger can record what went over the wire, not just how many
  // windows were attempted. Optional for the same reason as capabilities.
  readonly telemetry?: ProviderTelemetry;
  complete(request: ReasoningRequest): Promise<ReasoningResponse>;
}

export type { ProviderTelemetry } from "./scheduler.ts";
