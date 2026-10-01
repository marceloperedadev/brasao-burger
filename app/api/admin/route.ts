import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'

const PAGE_SIZE = 50
const ORDER_FIELDS = 'id,created_at,customer_name,customer_phone,delivery_method,payment_method,payment_status,status,subtotal,delivery_fee,total'
const ORDER_DETAIL_FIELDS = `${ORDER_FIELDS},address,address_number,complement,neighborhood,zip_code,reference,change_for,user_id`
const PRODUCT_FIELDS = 'id,category_id,name,description,price,image_url,featured,available,sort_order'
const CATEGORY_FIELDS = 'id,name,slug,sort_order,active'
const CUSTOMER_FIELDS = 'user_id,name,phone,address,number,complement,neighborhood,zip_code,city,state,reference,created_at'
const ORDER_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['out_for_delivery', 'completed', 'cancelled'],
  out_for_delivery: ['completed'],
}
const PAYMENT_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['refunded'],
}

function safeSearch(value: string) {
  return value.trim().replace(/[%_(),.\\]/g, ' ').replace(/\s+/g, ' ').slice(0, 80)
}

function parsePage(value: string | null) {
  const page = Number(value)
  return Number.isSafeInteger(page) && page > 0 ? Math.min(page, 100_000) : 1
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request)
  if (!auth.access) return auth.response

  const url = new URL(request.url)
  const resource = url.searchParams.get('resource')
  const page = parsePage(url.searchParams.get('page'))
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  const search = safeSearch(url.searchParams.get('q') ?? '')

  try {
    if (resource === 'session') {
      return NextResponse.json({ userId: auth.access.userId, email: auth.access.email }, { headers: { 'Cache-Control': 'no-store' } })
    }

    if (resource === 'dashboard') {
      const [recent, pending, preparing, ready, completed, cancelled, paymentPending] = await Promise.all([
        auth.access.client.from('orders').select(ORDER_FIELDS).order('created_at', { ascending: false }).limit(8),
        auth.access.client.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        auth.access.client.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'preparing'),
        auth.access.client.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'ready'),
        auth.access.client.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
        auth.access.client.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'cancelled'),
        auth.access.client.from('orders').select('id', { count: 'exact', head: true }).eq('payment_status', 'pending'),
      ])
      const failure = [recent, pending, preparing, ready, completed, cancelled, paymentPending].find((result) => result.error)
      if (failure?.error) throw failure.error
      return NextResponse.json({
        recent: recent.data ?? [],
        counts: {
          pending: pending.count ?? 0,
          preparing: preparing.count ?? 0,
          ready: ready.count ?? 0,
          completed: completed.count ?? 0,
          cancelled: cancelled.count ?? 0,
          paymentPending: paymentPending.count ?? 0,
        },
      }, { headers: { 'Cache-Control': 'no-store' } })
    }

    if (resource === 'orders') {
      let query = auth.access.client.from('orders').select(ORDER_FIELDS, { count: 'exact' })
      const status = url.searchParams.get('status')
      const payment = url.searchParams.get('payment')
      if (status) query = query.eq('status', status)
      if (payment) query = query.eq('payment_method', payment)
      if (search) {
        const filters = [`customer_name.ilike.%${search}%`, `customer_phone.ilike.%${search}%`]
        if (/^[0-9a-f-]{36}$/i.test(search)) filters.push(`id.eq.${search}`)
        query = query.or(filters.join(','))
      }
      const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, to)
      if (error) throw error
      return NextResponse.json({ rows: data ?? [], count: count ?? 0, page, pageSize: PAGE_SIZE }, { headers: { 'Cache-Control': 'no-store' } })
    }

    if (resource === 'order') {
      const id = url.searchParams.get('id') ?? ''
      if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })
      const [order, items] = await Promise.all([
        auth.access.client.from('orders').select(ORDER_DETAIL_FIELDS).eq('id', id).maybeSingle(),
        auth.access.client.from('order_items').select('id,product_id,product_name,quantity,unit_price,line_total').eq('order_id', id).order('id'),
      ])
      if (order.error || items.error) throw order.error ?? items.error
      if (!order.data) return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 })
      const userLookup = order.data.user_id
        ? await auth.access.client.auth.admin.getUserById(order.data.user_id)
        : null
      return NextResponse.json({
        order: order.data,
        items: items.data ?? [],
        customerEmail: userLookup && !userLookup.error ? userLookup.data.user.email ?? null : null,
      }, { headers: { 'Cache-Control': 'no-store' } })
    }

    if (resource === 'products') {
      let query = auth.access.client.from('products').select(PRODUCT_FIELDS, { count: 'exact' })
      const categoryId = Number(url.searchParams.get('categoryId'))
      if (Number.isSafeInteger(categoryId) && categoryId > 0) query = query.eq('category_id', categoryId)
      if (search) query = query.ilike('name', `%${search}%`)
      const { data, error, count } = await query.order('sort_order').order('name').range(from, to)
      if (error) throw error
      return NextResponse.json({ rows: data ?? [], count: count ?? 0, page, pageSize: PAGE_SIZE }, { headers: { 'Cache-Control': 'no-store' } })
    }

    if (resource === 'categories') {
      let query = auth.access.client.from('categories').select(CATEGORY_FIELDS, { count: 'exact' })
      if (search) query = query.ilike('name', `%${search}%`)
      const { data, error, count } = await query.order('sort_order').order('name').range(from, to)
      if (error) throw error
      return NextResponse.json({ rows: data ?? [], count: count ?? 0, page, pageSize: PAGE_SIZE }, { headers: { 'Cache-Control': 'no-store' } })
    }

    if (resource === 'customers') {
      let query = auth.access.client.from('customer_profiles').select(CUSTOMER_FIELDS, { count: 'exact' })
      if (search) query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`)
      const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, to)
      if (error) throw error
      return NextResponse.json({ rows: data ?? [], count: count ?? 0, page, pageSize: PAGE_SIZE }, { headers: { 'Cache-Control': 'no-store' } })
    }

    if (resource === 'customer') {
      const userId = url.searchParams.get('id') ?? ''
      if (!/^[0-9a-f-]{36}$/i.test(userId)) return NextResponse.json({ error: 'Cliente inválido.' }, { status: 400 })
      const [customer, orders, authUser] = await Promise.all([
        auth.access.client.from('customer_profiles').select(CUSTOMER_FIELDS).eq('user_id', userId).maybeSingle(),
        auth.access.client.from('orders').select('id,created_at,payment_method,payment_status,status,total').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
        auth.access.client.auth.admin.getUserById(userId),
      ])
      if (customer.error || orders.error || authUser.error) throw customer.error ?? orders.error ?? authUser.error
      if (!customer.data) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })
      return NextResponse.json({ customer: customer.data, email: authUser.data.user.email ?? null, orders: orders.data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
    }

    return NextResponse.json({ error: 'Consulta administrativa inválida.' }, { status: 400 })
  } catch (cause) {
    console.error('Falha ao consultar o painel administrativo.', cause)
    return NextResponse.json({ error: 'Não foi possível carregar esses dados agora.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}

async function readJson(request: Request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) return null
  const length = Number(request.headers.get('content-length'))
  if (Number.isFinite(length) && length > 16_384) return null
  if (!request.body) return null
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 16_384) {
        await reader.cancel().catch(() => undefined)
        return null
      }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes))
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
  } catch {
    return null
  }
}

function validImageUrl(value: unknown) {
  if (value === null || value === '') return true
  if (typeof value !== 'string' || value.length > 2_048) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
  } catch {
    return false
  }
}

function slugify(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100)
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request)
  if (!auth.access) return auth.response
  const body = await readJson(request)
  if (!body) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 })

  try {
    if (body.resource === 'product') {
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      const categoryId = typeof body.categoryId === 'number' ? body.categoryId : Number.NaN
      const price = typeof body.price === 'number' ? body.price : Number.NaN
      const sortOrder = body.sortOrder === undefined ? 0 : typeof body.sortOrder === 'number' ? body.sortOrder : Number.NaN
      const description = body.description === '' ? null : body.description
      if (!name || name.length > 160 || !Number.isSafeInteger(categoryId) || categoryId <= 0 ||
          !Number.isFinite(price) || price < 0 || price > 1_000_000 || !Number.isSafeInteger(sortOrder) ||
          (description !== null && (typeof description !== 'string' || description.length > 4_000)) ||
          typeof body.available !== 'boolean' || typeof body.featured !== 'boolean' || !validImageUrl(body.imageUrl)) {
        return NextResponse.json({ error: 'Revise nome, categoria, preço, descrição e imagem.' }, { status: 400 })
      }
      const { data: category, error: categoryError } = await auth.access.client.from('categories')
        .select('id,active').eq('id', categoryId).maybeSingle()
      if (categoryError) throw categoryError
      if (!category || !category.active) return NextResponse.json({ error: 'Escolha uma categoria ativa.' }, { status: 400 })

      const record = {
        name,
        category_id: categoryId,
        description,
        price: Math.round(price * 100) / 100,
        image_url: body.imageUrl || null,
        featured: body.featured,
        available: body.available,
        sort_order: sortOrder,
      }
      const id = Number(body.id)
      if (body.id !== undefined && (!Number.isSafeInteger(id) || id <= 0)) return NextResponse.json({ error: 'Produto inválido.' }, { status: 400 })
      const query = Number.isSafeInteger(id) && id > 0
        ? auth.access.client.from('products').update(record).eq('id', id)
        : auth.access.client.from('products').insert(record)
      const { data, error } = await query.select(PRODUCT_FIELDS).maybeSingle()
      if (error) throw error
      if (!data) return NextResponse.json({ error: 'Produto não encontrado.' }, { status: 404 })
      return NextResponse.json({ product: data }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
    }

    if (body.resource === 'category') {
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      const slug = typeof body.slug === 'string' && body.slug.trim() ? slugify(body.slug) : slugify(name)
      const sortOrder = body.sortOrder === undefined ? 0 : typeof body.sortOrder === 'number' ? body.sortOrder : Number.NaN
      if (!name || name.length > 120 || !slug || !Number.isSafeInteger(sortOrder) || typeof body.active !== 'boolean') {
        return NextResponse.json({ error: 'Revise nome, URL e ordem da categoria.' }, { status: 400 })
      }
      const record = { name, slug, sort_order: sortOrder, active: body.active }
      const id = Number(body.id)
      if (body.id !== undefined && (!Number.isSafeInteger(id) || id <= 0)) return NextResponse.json({ error: 'Categoria inválida.' }, { status: 400 })
      const query = Number.isSafeInteger(id) && id > 0
        ? auth.access.client.from('categories').update(record).eq('id', id)
        : auth.access.client.from('categories').insert(record)
      const { data, error } = await query.select(CATEGORY_FIELDS).maybeSingle()
      if (error) throw error
      if (!data) return NextResponse.json({ error: 'Categoria não encontrada.' }, { status: 404 })
      return NextResponse.json({ category: data }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
    }

    return NextResponse.json({ error: 'Operação administrativa inválida.' }, { status: 400 })
  } catch (cause) {
    console.error('Falha ao salvar registro do painel administrativo.', cause)
    return NextResponse.json({ error: 'Não foi possível salvar. Verifique os dados e tente novamente.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request)
  if (!auth.access) return auth.response
  const body = await readJson(request)
  if (!body) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 })

  try {
    if (body.resource === 'order') {
      if (typeof body.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.id)) {
        return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })
      }
      const { data: current, error: currentError } = await auth.access.client.from('orders')
        .select('id,status,payment_status,delivery_method').eq('id', body.id).maybeSingle()
      if (currentError) throw currentError
      if (!current) return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 })

      if (typeof body.status === 'string') {
        const next = body.status
        const allowed = ORDER_STATUS_TRANSITIONS[current.status] ?? []
        const deliveryAllowed = next !== 'out_for_delivery' || current.delivery_method === 'delivery'
        const pickupAllowed = next !== 'completed' || current.delivery_method === 'pickup' || current.status === 'out_for_delivery'
        if (!allowed.includes(next) || !deliveryAllowed || !pickupAllowed) {
          return NextResponse.json({ error: 'Essa mudança de status não é permitida.' }, { status: 409 })
        }
        const { data, error } = await auth.access.client.from('orders').update({ status: next })
          .eq('id', body.id).eq('status', current.status).select(ORDER_DETAIL_FIELDS).maybeSingle()
        if (error) throw error
        if (!data) return NextResponse.json({ error: 'O pedido mudou em outra sessão. Atualize e tente novamente.' }, { status: 409 })
        return NextResponse.json({ order: data }, { headers: { 'Cache-Control': 'no-store' } })
      }

      if (typeof body.paymentStatus === 'string') {
        const next = body.paymentStatus
        const currentPayment = String(current.payment_status ?? 'pending')
        if (!PAYMENT_STATUS_TRANSITIONS[currentPayment]?.includes(next)) {
          return NextResponse.json({ error: 'Essa mudança de pagamento não é permitida.' }, { status: 409 })
        }
        const { data, error } = await auth.access.client.from('orders').update({ payment_status: next })
          .eq('id', body.id).eq('payment_status', currentPayment).select(ORDER_DETAIL_FIELDS).maybeSingle()
        if (error) throw error
        if (!data) return NextResponse.json({ error: 'O pagamento mudou em outra sessão. Atualize e tente novamente.' }, { status: 409 })
        return NextResponse.json({ order: data }, { headers: { 'Cache-Control': 'no-store' } })
      }
    }

    if (body.resource === 'product') {
      if (!Number.isSafeInteger(body.id) || Number(body.id) <= 0 || typeof body.available !== 'boolean') {
        return NextResponse.json({ error: 'Produto inválido.' }, { status: 400 })
      }
      const { data, error } = await auth.access.client.from('products').update({ available: body.available })
        .eq('id', body.id).select(PRODUCT_FIELDS).maybeSingle()
      if (error) throw error
      if (!data) return NextResponse.json({ error: 'Produto não encontrado.' }, { status: 404 })
      return NextResponse.json({ product: data }, { headers: { 'Cache-Control': 'no-store' } })
    }

    if (body.resource === 'category') {
      if (!Number.isSafeInteger(body.id) || Number(body.id) <= 0 || typeof body.active !== 'boolean') {
        return NextResponse.json({ error: 'Categoria inválida.' }, { status: 400 })
      }
      const { data, error } = await auth.access.client.from('categories').update({ active: body.active })
        .eq('id', body.id).select(CATEGORY_FIELDS).maybeSingle()
      if (error) throw error
      if (!data) return NextResponse.json({ error: 'Categoria não encontrada.' }, { status: 404 })
      return NextResponse.json({ category: data }, { headers: { 'Cache-Control': 'no-store' } })
    }

    return NextResponse.json({ error: 'Operação administrativa inválida.' }, { status: 400 })
  } catch (cause) {
    console.error('Falha ao atualizar registro do painel administrativo.', cause)
    return NextResponse.json({ error: 'Não foi possível concluir a alteração agora.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}