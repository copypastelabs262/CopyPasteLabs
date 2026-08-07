import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getSupabaseUrl, readEnv } from '@/lib/env'

// Bypasses Row Level Security. The `server-only` import above turns any
// accidental import of this file from client code into a build-time error.
export function createServiceRoleClient() {
  const serviceRoleKey = readEnv('SUPABASE_SERVICE_ROLE_KEY')
  if (!serviceRoleKey) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env.local and fill in your Supabase project values.',
    )
  }
  return createSupabaseClient(getSupabaseUrl(), serviceRoleKey, {
    auth: { persistSession: false },
  })
}

export interface SupabaseConfigStatus {
  configured: boolean
  missing: string[]
}

const REQUIRED_SUPABASE_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const

export function getSupabaseConfigStatus(): SupabaseConfigStatus {
  const missing = REQUIRED_SUPABASE_VARS.filter((name) => !readEnv(name))
  return { configured: missing.length === 0, missing }
}
