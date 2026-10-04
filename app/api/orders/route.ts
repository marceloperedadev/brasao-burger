import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

import { SITE_CONFIG } from '@/app/config/site'
import {
  DELIVERY_ZONE_KEYS,
  isDeliveryQuoteSnapshotCurrent,
  loadDeliveryConfig,
  resolveDeliveryQuote,
  type DeliveryQuoteSnapshot,
} from '@/lib/delivery-zones'

type DeliveryMethod = 'delivery' | 'pickup'
type PaymentMethod = 'pix' | 'cash' | 'card'
type ItemInput = { productId: number; quantity: number; expectedUnitPriceCents: number }
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
  expectedDeliveryQuote: DeliveryQuoteSnapshot | null
  items: ItemInput[]
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

class RequestTooLargeError extends Error {}

async function readRequestBody(request: Request, maxBytes: number): Promise<string> {
  if (!request.body) return ''

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel()
        } catch {
          // The size limit still takes precedence if stream cancellation fails.
        }
        throw new RequestTooLargeError()
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
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
  let totalQuantity = 0
  for (const item of body.items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null
    const record = item as Record<string, unknown>
    if (!Number.isSafeInteger(record.productId) || Number(record.productId) <= 0) return null
    if (!Number.isInteger(record.quantity) || Number(record.quantity) < 1 || Number(record.quantity) > 999) return null
    totalQuantity += Number(record.quantity)
    if (totalQuantity > 100) return null
    if (!Number.isSafeInteger(record.expectedUnitPriceCents) || Number(record.expectedUnitPriceCents) < 0) return null
    items.push({
      productId: Number(record.productId),
      quantity: Number(record.quantity),
      expectedUnitPriceCents: Number(record.expectedUnitPriceCents),
    })
  }

  const idempotencyKey = text(body.idempotencyKey)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) return null

  let expectedDeliveryQuote: DeliveryQuoteSnapshot | null = null
  if (body.expectedDeliveryQuote !== undefined && body.expectedDeliveryQuote !== null) {
    if (!body.expectedDeliveryQuote || typeof body.expectedDeliveryQuote !== 'object' || Array.isArray(body.expectedDeliveryQuote)) return null
    const quote = body.expectedDeliveryQuote as Record<string, unknown>
    if (!Number.isSafeInteger(quote.feeCents) || Number(quote.feeCents) < 0 ||
        typeof quote.zoneKey !== 'string' || !DELIVERY_ZONE_KEYS.includes(quote.zoneKey as (typeof DELIVERY_ZONE_KEYS)[number])) return null
    expectedDeliveryQuote = { feeCents: Number(quote.feeCents), zoneKey: quote.zoneKey as DeliveryQuoteSnapshot['zoneKey'] }
  }
  if (body.deliveryMethod === 'delivery' && !expectedDeliveryQuote) return null

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
    expectedDeliveryQuote,
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
    const raw = await readRequestBody(request, 16_384)
    body = JSON.parse(raw)
  } catch (error) {
    if (error instanceof RequestTooLargeError) return jsonError('Request is too large.', 413)
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
  let verifiedNeighborhood = ''
  let deliveryZoneName: string | null = null
  if (input.deliveryMethod === 'pickup') {
    deliveryFee = 0
  } else {
    try {
      const settingsClient = createAdminClient()
      const config = await loadDeliveryConfig(settingsClient)

      const postalResponse = await fetch(`https://viacep.com.br/ws/${input.zipCode}/json/`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(5_000),
      })
      if (!postalResponse.ok) return jsonError('Could not validate the delivery ZIP code. Try again.', 503)
      const postal = await postalResponse.json() as { erro?: boolean; localidade?: string; uf?: string; bairro?: string }
      if (postal.erro || !postal.localidade || !postal.uf) return jsonError('Enter a valid delivery ZIP code.', 400)
      const quote = resolveDeliveryQuote('delivery', postal.localidade, postal.uf, postal.bairro ?? '', config)
      if (!quote.ok) {
        if (quote.reason === 'disabled') return jsonError('Delivery is currently unavailable.', 422)
        if (quote.reason === 'outside_area') return jsonError(`Delivery is limited to ${config.serviceCity}, ${config.serviceState}.`, 422)
        if (quote.reason === 'zone_not_found') return jsonError('We could not identify a delivery zone for this address.', 422)
        if (quote.reason === 'manual_confirmation_required') return jsonError('This delivery address requires manual confirmation.', 422)
        if (quote.reason === 'not_ready') return jsonError('Delivery zones have not been configured yet.', 422)
        if (quote.reason === 'ambiguous_zone') return jsonError('Delivery zones need to be reviewed before this address can be served.', 503)
        return jsonError('Delivery configuration is invalid or unavailable.', 503)
      }
      const expectedQuote = input.expectedDeliveryQuote
      if (!expectedQuote || !isDeliveryQuoteSnapshotCurrent(expectedQuote, quote)) {
        return NextResponse.json({
          error: 'DELIVERY_QUOTE_CHANGED',
          previousQuote: expectedQuote,
          currentQuote: {
            feeCents: Math.round(quote.fee * 100),
            fee: quote.fee,
            zoneKey: quote.zone?.zoneKey ?? null,
            zoneName: quote.zone?.name ?? null,
            reason: 'current_server_quote_differs_from_checkout_preview',
          },
          config,
          verifiedAddress: {
            city: postal.localidade,
            state: postal.uf,
            neighborhood: postal.bairro ?? '',
          },
        }, { status: 409, headers: { 'Cache-Control': 'no-store' } })
      }
      deliveryFee = quote.fee
      deliveryZoneName = quote.zone?.name ?? null
      verifiedNeighborhood = postal.bairro ?? ''
    } catch (error) {
      console.error('Could not validate delivery configuration or ZIP code.', error)
      return jsonError('Could not validate delivery right now. Try again.', 503)
    }
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
      neighborhood: input.deliveryMethod === 'delivery' ? verifiedNeighborhood : '',
      zipCode: input.deliveryMethod === 'delivery' ? input.zipCode : '',
      reference: input.deliveryMethod === 'delivery' ? input.reference : '',
      paymentMethod: input.paymentMethod,
      changeFor: changeFor?.toFixed(2) ?? '',
      deliveryFee,
    }

    const { data: result, error } = await supabase.rpc('create_order_atomic_checked', {
      p_order: orderPayload,
      p_items: input.items.map(({ productId, quantity }) => ({ productId, quantity })),
      p_expected_items: input.items.map(({ productId, expectedUnitPriceCents }) => ({ productId, expectedUnitPriceCents })),
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
    if (result && typeof result === 'object' && 'staleCatalog' in result && result.staleCatalog === true) {
      return NextResponse.json({
        error: 'MENU_CHANGED',
        products: 'products' in result && Array.isArray(result.products) ? result.products : [],
      }, { status: 409, headers: { 'Cache-Control': 'no-store' } })
    }
    const order = result && typeof result === 'object' && 'order' in result ? result.order : null
    if (!order || typeof order !== 'object' || !('id' in order)) {
      throw new Error('Order persistence returned an invalid result.')
    }

    return NextResponse.json({
      order: deliveryZoneName ? { ...order, deliveryZone: deliveryZoneName } : order,
    }, {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('Failed to persist customer order.', error)
    return jsonError('The order could not be saved. Please retry before opening WhatsApp.', 503)
  }
}
