// Typed env access. Reads are explicit so a missing variable fails loudly at the
// point of use rather than as `undefined` three layers down.
type Key =
  | "NEXT_PUBLIC_SUPABASE_URL"
  | "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  | "SUPABASE_SERVICE_ROLE_KEY"
  // TRANSCRIPTION ONLY. Locked 2026-08-30: once a transcript is stored, no
  // processing step may call Sarvam again for that lecture. This key is read by
  // src/lib/transcription/sarvam.ts and -- unless ALLOW_PAID_REASONING is
  // explicitly set -- by nothing else. See the registry in ./reasoning/index.ts.
  | "SARVAM_API_KEY"
  // ---- REASONING -------------------------------------------------------
  // Which adapter answers. No default: an unset value is an error, never a
  // reason to reach for the paid transcription provider.
  | "REASONING_PROVIDER"
  | "GEMINI_API_KEY"
  | "GEMINI_MODEL"
  | "GEMINI_BASE_URL"
  | "GROQ_API_KEY"
  | "GROQ_MODEL"
  | "GROQ_BASE_URL"
  | "OLLAMA_MODEL"
  | "OLLAMA_BASE_URL"
  // The single switch that makes a PAID reasoning adapter usable. Unset in
  // development and in production. Setting it is a deliberate, costly act.
  | "ALLOW_PAID_REASONING";

export function readEnv(key: Key): string | undefined {
  const value = process.env[key];
  return value && value.length > 0 ? value : undefined;
}

export function requireEnv(key: Key): string {
  const value = readEnv(key);
  if (!value) throw new Error(`Missing ${key}. Add it to .env.local.`);
  return value;
}

export function publicConfigStatus(): { configured: boolean; missing: string[] } {
  const missing = (
    ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"] as const
  ).filter((k) => !readEnv(k));
  return { configured: missing.length === 0, missing: [...missing] };
}
