import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type DeliveryMethod = 'delivery' | 'pickup'

type CustomerInput = {
  name: string
  phone: string
  deliveryMethod: DeliveryMethod
  address: string
  number: string
  complement: string
  neighborhood: string
  reference: string
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '')
  return digits.startsWith('55') && (digits.length === 12 || digits.length === 13)
    ? digits.slice(2)
    : digits
}

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: { 'Cache-Control': 'no-store' },
    }
  )
}

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  const secretKey = process.env.SUPABASE_SECRET_KEY

  if (!url || !publishableKey || !secretKey) {
    throw new Error('Configuração Supabase incompleta no servidor.')
  }

  return { url, publishableKey, secretKey }
}

async function getVerifiedPhone(request: Request) {
  const authorization = request.headers.get('authorization')
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]

  if (!token) {
    return { error: jsonError('Verifique seu telefone para continuar.', 401) }
  }

  const { url, publishableKey } = getSupabaseConfig()
  const authClient = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await authClient.auth.getUser(token)

  if (error || !data.user?.phone || !data.user.phone_confirmed_at) {
    return { error: jsonError('Verificação de telefone inválida ou expirada.', 401) }
  }

  const phone = normalizePhone(data.user.phone)
  if (phone.length < 10 || phone.length > 11) {
    return { error: jsonError('Telefone verificado inválido.', 401) }
  }

  return { phone, config: getSupabaseConfig() }
}

function readCustomerInput(value: unknown): CustomerInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const body = value as Record<string, unknown>
  const clean = (field: unknown) =>
    typeof field === 'string' ? field.trim() : ''
  const deliveryMethod: DeliveryMethod =
    body.deliveryMethod === 'pickup' ? 'pickup' : 'delivery'

  return {
    name: clean(body.name),
    phone: normalizePhone(clean(body.phone)),
    deliveryMethod,
    address: clean(body.address),
    number: clean(body.number),
    complement: clean(body.complement),
    neighborhood: clean(body.neighborhood),
    reference: clean(body.reference),
  }
}

function validateCustomer(customer: CustomerInput) {
  if (!customer.name || customer.name.length > 120) {
    return 'Informe um nome válido.'
  }
  if (customer.phone.length < 10 || customer.phone.length > 11) {
    return 'WhatsApp inválido.'
  }
  if (customer.deliveryMethod === 'delivery') {
    if (!customer.address || !customer.number || !customer.neighborhood) {
      return 'Endereço, número e bairro são obrigatórios para entrega.'
    }
  }
  if (
    customer.address.length > 200 ||
    customer.number.length > 30 ||
    customer.complement.length > 120 ||
    customer.neighborhood.length > 120 ||
    customer.reference.length > 180
  ) {
    return 'Revise os campos do endereço.'
  }
  return null
}

export async function GET(request: Request) {
  try {
    const verified = await getVerifiedPhone(request)
    if (verified.error) return verified.error

    const requestedPhone = normalizePhone(
      new URL(request.url).searchParams.get('phone') ?? ''
    )
    if (!requestedPhone || requestedPhone !== verified.phone) {
      return jsonError('O telefone consultado não corresponde ao telefone verificado.', 403)
    }

    const supabaseAdmin = createClient(
      verified.config.url,
      verified.config.secretKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data, error } = await supabaseAdmin
      .from('customers')
      .select('id,name,phone,address,number,complement,neighborhood,reference')
      .eq('phone', verified.phone)
      .maybeSingle()

    if (error) {
      console.error('Falha ao consultar cadastro de cliente.', error)
      return jsonError('Não foi possível consultar o cadastro agora.', 500)
    }

    return NextResponse.json(
      { customer: data },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('Falha ao autenticar consulta de cliente.', error)
    return jsonError('Não foi possível verificar seu telefone agora.', 503)
  }
}

export async function POST(request: Request) {
  try {
    const verified = await getVerifiedPhone(request)
    if (verified.error) return verified.error

    let body: unknown
    try {
      const rawBody = await request.text()
      if (new TextEncoder().encode(rawBody).byteLength > 8_192) {
        return jsonError('Requisição muito grande.', 413)
      }
      body = JSON.parse(rawBody)
    } catch {
      return jsonError('Requisição inválida.', 400)
    }

    const customer = readCustomerInput(body)
    if (!customer) return jsonError('Requisição inválida.', 400)

    const validationError = validateCustomer(customer)
    if (validationError) return jsonError(validationError, 400)
    if (customer.phone !== verified.phone) {
      return jsonError('O telefone do cadastro não corresponde ao telefone verificado.', 403)
    }

    const supabaseAdmin = createClient(
      verified.config.url,
      verified.config.secretKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from('customers')
      .select('id')
      .eq('phone', verified.phone)
      .maybeSingle()

    if (lookupError) {
      console.error('Falha ao localizar cadastro de cliente.', lookupError)
      return jsonError('Não foi possível salvar o cadastro agora.', 500)
    }

    const payload = {
      name: customer.name,
      ...(customer.deliveryMethod === 'delivery' || customer.address
        ? {
            address: customer.address,
            number: customer.number,
            complement: customer.complement || null,
            neighborhood: customer.neighborhood,
            reference: customer.reference || null,
          }
        : {}),
    }

    const query = existing
      ? supabaseAdmin
          .from('customers')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
      : supabaseAdmin.from('customers').insert({
          ...payload,
          phone: verified.phone,
          address: customer.address,
          number: customer.number,
          complement: customer.complement || null,
          neighborhood: customer.neighborhood,
          reference: customer.reference || null,
        })

    const { data, error } = await query
      .select('id,name,phone,address,number,complement,neighborhood,reference')
      .single()

    if (error) {
      console.error('Falha ao salvar cadastro de cliente.', error)
      return jsonError('Não foi possível salvar o cadastro agora.', 500)
    }

    return NextResponse.json(
      { customer: data, created: !existing },
      {
        status: existing ? 200 : 201,
        headers: { 'Cache-Control': 'no-store' },
      }
    )
  } catch (error) {
    console.error('Falha ao processar cadastro de cliente.', error)
    return jsonError('Não foi possível salvar o cadastro agora.', 503)
  }
}
