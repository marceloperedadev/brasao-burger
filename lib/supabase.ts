import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Lazily resolves a public Supabase env var.
 *
 * Resolution is deferred (and errors are only raised when the client is
 * actually used) so that `next build` does not fail on machines/CI where the
 * env vars are not injected yet.
 */
function readPublicEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]
    if (value) return value
  }
  throw new Error(
    `Missing environment variable: expected one of ${names.join(', ')}. ` +
      'Define it in .env.local or in your hosting provider settings.',
  )
}

const supabaseUrl: string = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const supabasePublishableKey: string =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  ''

function getSupabase() {
  if (!supabaseUrl) readPublicEnv('NEXT_PUBLIC_SUPABASE_URL')
  if (!supabasePublishableKey) {
    readPublicEnv(
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    )
  }
  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: false,
    },
  })
}

let client: SupabaseClient | null = null

/** Lazily creates the shared Supabase client (throws only when first used). */
export function getSupabaseClient(): SupabaseClient {
  if (!client) client = getSupabase()
  return client
}

/**
 * Backwards-compatible `supabase` export. The underlying client is created on
 * first property access, so importing this module never throws (keeps
 * `next build` working without env vars injected at compile time).
 */
export const supabase: SupabaseClient = new Proxy(
  {} as SupabaseClient,
  {
    get(_target, prop, receiver) {
      const value = Reflect.get(getSupabaseClient(), prop, receiver)
      return typeof value === 'function' ? value.bind(getSupabaseClient()) : value
    },
  },
)
