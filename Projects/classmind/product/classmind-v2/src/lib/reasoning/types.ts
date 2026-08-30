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

export interface ReasoningProvider {
  readonly id: string;
  readonly model: string;
  complete(request: ReasoningRequest): Promise<ReasoningResponse>;
}
