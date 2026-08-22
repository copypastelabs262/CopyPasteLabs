// Typed env access. Reads are explicit so a missing variable fails loudly at the
// point of use rather than as `undefined` three layers down.
type Key =
  | "NEXT_PUBLIC_SUPABASE_URL"
  | "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  | "SUPABASE_SERVICE_ROLE_KEY"
  | "SARVAM_API_KEY";

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
