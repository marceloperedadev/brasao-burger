import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

import { SITE_CONFIG } from '@/app/config/site'
import { calculateDeliveryFee, parseDeliveryFees } from '@/lib/delivery-fees'

type DeliveryMethod = 'delivery' | 'pickup'
type PaymentMethod = 'pix' | 'cash' | 'card'
type ItemInput = { productId: number; quantity: number }
type OrderInput = {
  idempotencyKey: string
  deliveryMethod: DeliveryMethod
  paymentMethod: PaymentMethod
  name: string
  phone: string
  address: string
  number: string
  complement: string
  neighborhood: string
  zipCode: string
  reference: string
  changeFor: string
  items: ItemInput[]
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !secretKey) throw new Error('Order persistence is not configured.')
  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function getOptionalUserId(request: Request): Promise<string | null> {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return null

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !publicKey) throw new Error('Supabase authentication is not configured.')

  const client = createClient(url, publicKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user?.id) throw new Error('INVALID_AUTH')
  return data.user.id
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function bounded(value: unknown, maxLength: number) {
  const result = text(value)
  return result.length <= maxLength ? result : ''
}

function readInput(value: unknown): OrderInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const body = value as Record<string, unknown>
  if (body.deliveryMethod !== 'delivery' && body.deliveryMethod !== 'pickup') return null
  if (body.paymentMethod !== 'pix' && body.paymentMethod !== 'cash' && body.paymentMethod !== 'card') return null
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) return null

  const items: ItemInput[] = []
  for (const item of body.items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null
    const record = item as Record<string, unknown>
    if (!Number.isSafeInteger(record.productId) || Number(record.productId) <= 0) return null
    if (!Number.isInteger(record.quantity) || Number(record.quantity) < 1 || Number(record.quantity) > 999) return null
    items.push({ productId: Number(record.productId), quantity: Number(record.quantity) })
  }

  const idempotencyKey = text(body.idempotencyKey)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) return null

  const customer = body.customer
  if (!customer || typeof customer !== 'object' || Array.isArray(customer)) return null
  const details = customer as Record<string, unknown>
  const textLimits: Array<[unknown, number]> = [
    [details.name, 120],
    [details.phone, 20],
    [details.address, 200],
    [details.number, 30],
    [details.complement, 120],
    [details.neighborhood, 120],
    [details.zipCode, 12],
    [details.reference, 180],
    [body.changeFor, 24],
  ]
  if (textLimits.some(([field, limit]) => typeof field !== 'string' || field.length > limit)) return null
  const phone = bounded(details.phone, 20).replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')
  const zipCode = bounded(details.zipCode, 12).replace(/\D/g, '')

  return {
    idempotencyKey,
    deliveryMethod: body.deliveryMethod,
    paymentMethod: body.paymentMethod,
    name: bounded(details.name, 120),
    phone,
    address: bounded(details.address, 200),
    number: bounded(details.number, 30),
    complement: bounded(details.complement, 120),
    neighborhood: bounded(details.neighborhood, 120),
    zipCode,
    reference: bounded(details.reference, 180),
    changeFor: bounded(body.changeFor, 24),
    items,
  }
}

function acceptedPayment(method: PaymentMethod) {
  const configId = method === 'cash' ? 'dinheiro' : method === 'card' ? 'cartao' : 'pix'
  return SITE_CONFIG.payment.accepted.some((item) => item.id === configId)
}

function parseChangeFor(value: string): number | null {
  if (!value) return null
  if (!/^\d[\d.]*,\d{2}$/.test(value)) return Number.NaN
  const amount = Number(value.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : Number.NaN
}

export async function POST(request: Request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) {
    return jsonError('Invalid content type.', 415)
  }

  let body: unknown
  try {
    const contentLength = Number(request.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength > 16_384) return jsonError('Request is too large.', 413)
    const raw = await request.text()
    if (new TextEncoder().encode(raw).byteLength > 16_384) return jsonError('Request is too large.', 413)
    body = JSON.parse(raw)
  } catch {
    return jsonError('Invalid request body.', 400)
  }

  const input = readInput(body)
  if (!input) return jsonError('Review the order details and try again.', 400)
  if (!input.name || input.phone.length < 10 || input.phone.length > 11) {
    return jsonError('Enter a valid name and WhatsApp number.', 400)
  }
  if (!acceptedPayment(input.paymentMethod)) return jsonError('This payment method is unavailable.', 400)

  if (input.deliveryMethod === 'delivery') {
    if (!input.address || !input.number || !input.neighborhood || input.zipCode.length !== 8) {
      return jsonError('Complete the delivery address and CEP.', 400)
    }
  } else if (input.zipCode && input.zipCode.length !== 8) {
    return jsonError('Enter a valid CEP.', 400)
  }

  let userId: string | null
  try {
    userId = await getOptionalUserId(request)
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_AUTH') {
      return jsonError('Your session expired. Sign in again or continue as a guest.', 401)
    }
    console.error('Could not validate the order session.', error)
    return jsonError('Could not validate your session.', 503)
  }

  let deliveryFee: number
  if (input.deliveryMethod === 'pickup') {
    deliveryFee = 0
  } else {
    const fees = parseDeliveryFees(process.env.NEXT_PUBLIC_DELIVERY_FEES)
    const configuredFee = calculateDeliveryFee(fees, input.zipCode, input.neighborhood)
    if (configuredFee === null) return jsonError('Delivery is not configured for this address.', 422)
    deliveryFee = configuredFee
  }

  const changeFor = input.paymentMethod === 'cash' ? parseChangeFor(input.changeFor) : null
  if (Number.isNaN(changeFor)) return jsonError('Enter a valid change amount.', 400)

  try {
    const supabase = createAdminClient()
    const orderPayload = {
      idempotencyKey: input.idempotencyKey,
      userId,
      name: input.name,
      phone: input.phone,
      deliveryMethod: input.deliveryMethod,
      address: input.deliveryMethod === 'delivery' ? input.address : '',
      number: input.deliveryMethod === 'delivery' ? input.number : '',
      complement: input.deliveryMethod === 'delivery' ? input.complement : '',
      neighborhood: input.deliveryMethod === 'delivery' ? input.neighborhood : '',
      zipCode: input.deliveryMethod === 'delivery' ? input.zipCode : '',
      reference: input.deliveryMethod === 'delivery' ? input.reference : '',
      paymentMethod: input.paymentMethod,
      changeFor: changeFor?.toFixed(2) ?? '',
      deliveryFee,
    }

    const { data: order, error } = await supabase.rpc('create_order_atomic', {
      p_order: orderPayload,
      p_items: input.items,
    })
    if (error) {
      if (error.message.includes('PRODUCT_UNAVAILABLE')) {
        return jsonError('An item in your order is unavailable. Refresh the menu and try again.', 409)
      }
      if (error.message.includes('INVALID_CHANGE_FOR')) {
        return jsonError('The change amount must be greater than the order total.', 400)
      }
      if (error.message.includes('IDEMPOTENCY_CONFLICT')) {
        return jsonError('This checkout attempt no longer matches the saved order. Refresh your order and try again.', 409)
      }
      throw error
    }
    if (!order || typeof order !== 'object' || !('id' in order)) {
      throw new Error('Order persistence returned an invalid result.')
    }

    return NextResponse.json({ order }, {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('Failed to persist customer order.', error)
    return jsonError('The order could not be saved. Please retry before opening WhatsApp.', 503)
  }
}
