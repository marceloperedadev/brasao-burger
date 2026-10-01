import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getAdminUserIds } from './env'

type AdminAccess = {
  client: SupabaseClient
  userId: string
  email: string | null
}

type AdminAuthResult =
  | { access: AdminAccess; response?: never }
  | { access?: never; response: NextResponse }

function error(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function requireAdmin(request: Request): Promise<AdminAuthResult> {
  const token = request.headers
    .get('authorization')
    ?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return { response: error('Entre com uma conta autorizada.', 401) }

  const userIds = getAdminUserIds()
  if (userIds.length === 0) {
    return { response: error('O acesso administrativo ainda não foi configurado.', 503) }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !publicKey || !secretKey) {
    return { response: error('A autenticação administrativa está indisponível.', 503) }
  }

  const authClient = createClient(url, publicKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  let data: Awaited<ReturnType<typeof authClient.auth.getUser>>['data']
  let authError: Awaited<ReturnType<typeof authClient.auth.getUser>>['error']
  try {
    const result = await authClient.auth.getUser(token)
    data = result.data
    authError = result.error
  } catch {
    return { response: error('Não foi possível validar sua sessão agora.', 503) }
  }
  if (authError || !data.user) {
    return { response: error('Sua sessão expirou. Entre novamente.', 401) }
  }
  if (!userIds.includes(data.user.id.toLowerCase())) {
    return { response: error('Sua conta não tem acesso administrativo.', 403) }
  }

  return {
    access: {
      client: createClient(url, secretKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      }),
      userId: data.user.id,
      email: data.user.email ?? null,
    },
  }
}