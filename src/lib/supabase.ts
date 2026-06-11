import { createClient } from '@supabase/supabase-js'

const env = (import.meta as ImportMeta & {
  env?: Record<string, string | undefined>
}).env
const supabaseUrl = env?.VITE_SUPABASE_URL
const supabaseAnonKey = env?.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string)
  : null
