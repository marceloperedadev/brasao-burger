/**
 * Typed, validated access to environment variables.
 * Parsed once per process so misconfiguration fails early with a clear message
 * instead of silently falling back to empty strings deep inside route handlers.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Parse the ADMIN_USER_IDS CSV into a normalized list of lowercase UUIDs. */
export function parseAdminUserIds(raw: string | undefined | null): string[] {
  return (raw ?? '')
    .split(',')
    .map((userId) => userId.trim().toLowerCase())
    .filter((userId) => UUID_PATTERN.test(userId))
}

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    )
  }
  return value
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback
}

function secret(name: string, legacyName: string): string {
  const value = process.env[name] ?? process.env[legacyName]
  if (!value) {
    throw new Error(`Missing required environment variable ${name} (or legacy ${legacyName}).`)
  }
  return value
}

export type SupabasePublicConfig = {
  url: string
  publishableKey: string
}

export type SupabaseAdminConfig = SupabasePublicConfig & {
  secretKey: string
}

export function getSupabasePublic(): SupabasePublicConfig {
  return {
    url: required('NEXT_PUBLIC_SUPABASE_URL'),
    publishableKey: secret(
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    ),
  }
}

export function getSupabaseAdmin(): SupabaseAdminConfig {
  return {
    ...getSupabasePublic(),
    secretKey: secret('SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'),
  }
}

export function getAdminUserIds(): string[] {
  return parseAdminUserIds(process.env.ADMIN_USER_IDS)
}

export function getStorageBucket(): string {
  return optional('SUPABASE_STORAGE_BUCKET', 'product-images')
}

export function getSiteUrl(): string {
  return optional('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000').replace(/\/$/, '')
}