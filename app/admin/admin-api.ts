'use client'

import { supabase } from '@/lib/supabase'

type AdminResult<T> = T & { error?: string }

export async function adminRequest<T>(url: string, init: RequestInit = {}): Promise<AdminResult<T>> {
  const { data, error } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (error || !token) throw new Error('Sua sessão terminou. Entre novamente.')

  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const response = await fetch(url, { ...init, headers, cache: 'no-store' })
  const result = await response.json().catch(() => ({})) as AdminResult<T>
  if (!response.ok) throw new Error(result.error || 'Não foi possível concluir a operação.')
  return result
}

export function adminResourceUrl(resource: string, params: Record<string, string> = {}) {
  const search = new URLSearchParams({ resource, ...params })
  return `/api/admin?${search.toString()}`
}