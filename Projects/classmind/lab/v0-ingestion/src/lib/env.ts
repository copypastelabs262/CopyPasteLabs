export function readEnv(name: string): string | undefined {
  const value = process.env[name]
  return value && value.length > 0 ? value : undefined
}

export function getSupabaseUrl(): string {
  const url = readEnv('NEXT_PUBLIC_SUPABASE_URL')
  if (!url) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL. Copy .env.example to .env.local and fill in your Supabase project values.',
    )
  }
  return url
}

export function getSupabaseAnonKey(): string {
  const key = readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  if (!key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill in your Supabase project values.',
    )
  }
  return key
}
