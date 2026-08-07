import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getSupabaseUrl, getSupabaseAnonKey } from '@/lib/env'

// Anon key only — safe to bundle into the browser. Never import server.ts's
// service-role client from anything that reaches the client.
export function createClient() {
  return createSupabaseClient(getSupabaseUrl(), getSupabaseAnonKey())
}
