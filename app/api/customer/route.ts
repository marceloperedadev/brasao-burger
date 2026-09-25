import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

type DeliveryMethod = 'delivery' | 'pickup'

type CustomerInput = {
  name: string
  phone: string
  deliveryMethod: DeliveryMethod
  address: string
  number: string
  complement: string
  neighborhood: string
  zipCode: string
  reference: string
}

const PROFILE_FIELDS =
  'user_id,name,phone,address,number,complement,neighborhood,zip_code,reference'

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { 'Cache-Control': 'no-store' } }
  )
}

function createAuthenticatedClient(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !publishableKey) {
    throw new Error('Supabase não está configurado no servidor.')
  }

  return createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

async function getAuthenticatedUser(request: Request) {
  const token = request.headers
    .get('authorization')
    ?.match(/^Bearer\s+(.+)$/i)?.[1]

  if (!token) {
    return { error: jsonError('Entre com sua conta Google para continuar.', 401) }
  }

  const client = createAuthenticatedClient(token)
  const { data, error } = await client.auth.getUser(token)

  if (error || !data.user?.id || !data.user.email) {
    return { error: jsonError('Sua sessão expirou. Entre novamente.', 401) }
  }

  return { client, user: data.user }
}

function readCustomerInput(value: unknown): CustomerInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const body = value as Record<string, unknown>
  const clean = (field: unknown) =>
    typeof field === 'string' ? field.trim() : ''

  if (body.deliveryMethod !== 'delivery' && body.deliveryMethod !== 'pickup') {
    return null
  }

  return {
    name: clean(body.name),
    phone: clean(body.phone).replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, ''),
    deliveryMethod: body.deliveryMethod,
    address: clean(body.address),
    number: clean(body.number),
    complement: clean(body.complement),
    neighborhood: clean(body.neighborhood),
    zipCode: clean(body.zipCode).replace(/\D/g, ''),
    reference: clean(body.reference),
  }
}

function validateCustomer(customer: CustomerInput) {
  if (!customer.name || customer.name.length > 120) return 'Informe um nome válido.'
  if (customer.phone.length < 10 || customer.phone.length > 11) {
    return 'Informe um WhatsApp válido.'
  }
  if (customer.deliveryMethod === 'delivery') {
    if (!customer.address || !customer.number || !customer.neighborhood) {
      return 'Preencha o endereço, número e bairro para entrega.'
    }
    if (!/^\d{8}$/.test(customer.zipCode)) return 'Informe um CEP válido.'
  }
  if (
    customer.address.length > 200 ||
    customer.number.length > 30 ||
    customer.complement.length > 120 ||
    customer.neighborhood.length > 120 ||
    customer.reference.length > 180 ||
    (customer.zipCode && !/^\d{8}$/.test(customer.zipCode))
  ) {
    return 'Revise os dados informados.'
  }
  return null
}

export async function GET(request: Request) {
  try {
    const auth = await getAuthenticatedUser(request)
    if (auth.error) return auth.error

    const { data, error } = await auth.client
      .from('customer_profiles')
      .select(PROFILE_FIELDS)
      .eq('user_id', auth.user.id)
      .maybeSingle()

    if (error) {
      console.error('Falha ao consultar perfil do cliente.', error)
      return jsonError('Não foi possível carregar seus dados agora.', 500)
    }

    return NextResponse.json(
      { customer: data, email: auth.user.email },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('Falha ao autenticar consulta de perfil.', error)
    return jsonError('Não foi possível carregar seus dados agora.', 503)
  }
}

export async function POST(request: Request) {
  try {
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) {
      return jsonError('Tipo de conteúdo inválido.', 415)
    }

    let body: unknown
    try {
      const contentLength = Number(request.headers.get('content-length'))
      if (Number.isFinite(contentLength) && contentLength > 8_192) {
        return jsonError('Requisição muito grande.', 413)
      }

      const reader = request.body?.getReader()
      if (!reader) return jsonError('Requisição inválida.', 400)

      const chunks: Uint8Array[] = []
      let totalBytes = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        totalBytes += value.byteLength
        if (totalBytes > 8_192) {
          await reader.cancel().catch(() => undefined)
          return jsonError('Requisição muito grande.', 413)
        }
        chunks.push(value)
      }

      const bytes = new Uint8Array(totalBytes)
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.byteLength
      }
      body = JSON.parse(new TextDecoder().decode(bytes))
    } catch {
      return jsonError('Requisição inválida.', 400)
    }

    const customer = readCustomerInput(body)
    if (!customer) return jsonError('Requisição inválida.', 400)

    const validationError = validateCustomer(customer)
    if (validationError) return jsonError(validationError, 400)

    const auth = await getAuthenticatedUser(request)
    if (auth.error) return auth.error

    const profile = {
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      number: customer.number,
      complement: customer.complement || null,
      neighborhood: customer.neighborhood,
      zip_code: customer.zipCode,
      reference: customer.reference || null,
    }

    const { data, error } = await auth.client
      .from('customer_profiles')
      .upsert(profile, { onConflict: 'user_id' })
      .select(PROFILE_FIELDS)
      .single()

    if (error) {
      console.error('Falha ao salvar perfil do cliente.', error)
      return jsonError('Não foi possível salvar seus dados agora.', 500)
    }

    return NextResponse.json(
      { customer: data, email: auth.user.email },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      }
    )
  } catch (error) {
    console.error('Falha ao processar perfil do cliente.', error)
    return jsonError('Não foi possível salvar seus dados agora.', 503)
  }
}
