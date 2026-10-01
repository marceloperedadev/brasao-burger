import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'

export const runtime = 'nodejs'

const MAX_OPTIMIZED_BYTES = 3 * 1024 * 1024
const MAX_MULTIPART_BYTES = MAX_OPTIMIZED_BYTES + 64 * 1024
const MAX_DIMENSION = 1600

async function readBoundedForm(request: Request) {
  if (!request.body) return { form: null, tooLarge: false }
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_MULTIPART_BYTES) {
        await reader.cancel().catch(() => undefined)
        return { form: null, tooLarge: true }
      }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  const headers = new Headers(request.headers)
  headers.delete('content-length')
  try {
    const boundedRequest = new Request(request.url, { method: 'POST', headers, body: bytes })
    return { form: await boundedRequest.formData(), tooLarge: false }
  } catch {
    return { form: null, tooLarge: false }
  }
}

function readWebpDimensions(bytes: Buffer) {
  if (bytes.length < 30 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') return null
  const declaredSize = bytes.readUInt32LE(4) + 8
  if (declaredSize > bytes.length || declaredSize < 30) return null

  let offset = 12
  while (offset + 8 <= declaredSize) {
    const type = bytes.toString('ascii', offset, offset + 4)
    const chunkSize = bytes.readUInt32LE(offset + 4)
    const data = offset + 8
    if (data + chunkSize > declaredSize) return null
    if (type === 'VP8X' && chunkSize >= 10) {
      return {
        width: 1 + bytes.readUIntLE(data + 4, 3),
        height: 1 + bytes.readUIntLE(data + 7, 3),
      }
    }
    if (type === 'VP8 ' && chunkSize >= 10 && bytes[data + 3] === 0x9d && bytes[data + 4] === 0x01 && bytes[data + 5] === 0x2a) {
      return {
        width: bytes.readUInt16LE(data + 6) & 0x3fff,
        height: bytes.readUInt16LE(data + 8) & 0x3fff,
      }
    }
    if (type === 'VP8L' && chunkSize >= 5 && bytes[data] === 0x2f) {
      const bits = bytes.readUInt32LE(data + 1)
      return {
        width: 1 + (bits & 0x3fff),
        height: 1 + ((bits >> 14) & 0x3fff),
      }
    }
    offset = data + chunkSize + (chunkSize % 2)
  }
  return null
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request)
  if (!auth.access) return auth.response
  const contentLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_OPTIMIZED_BYTES + 32_768) {
    return NextResponse.json({ error: 'A imagem otimizada ultrapassa 3 MB.' }, { status: 413 })
  }

  const parsed = await readBoundedForm(request)
  if (parsed.tooLarge) return NextResponse.json({ error: 'A imagem otimizada deve ter até 3 MB.' }, { status: 413 })
  const form = parsed.form
  if (!form) return NextResponse.json({ error: 'Não foi possível ler a imagem enviada.' }, { status: 400 })
  const image = form.get('image')
  if (!(image instanceof File) || image.type !== 'image/webp' || !image.name.toLowerCase().endsWith('.webp')) {
    return NextResponse.json({ error: 'Envie uma imagem WebP otimizada.' }, { status: 415 })
  }
  if (image.size < 1 || image.size > MAX_OPTIMIZED_BYTES) {
    return NextResponse.json({ error: 'A imagem otimizada deve ter até 3 MB.' }, { status: 413 })
  }

  const bytes = Buffer.from(await image.arrayBuffer())
  const dimensions = readWebpDimensions(bytes)
  if (!dimensions || dimensions.width < 1 || dimensions.height < 1 || dimensions.width > MAX_DIMENSION || dimensions.height > MAX_DIMENSION) {
    return NextResponse.json({ error: 'A imagem WebP é inválida ou excede 1600 px.' }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !secretKey) {
    return NextResponse.json({ error: 'O armazenamento de imagens não está configurado.' }, { status: 503 })
  }
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'product-images'
  const storage = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } }).storage
  const digest = createHash('sha256').update(bytes).digest('hex')
  const path = `products/${digest}.webp`
  const { data: existing, error: listError } = await storage.from(bucket).list('products', { search: `${digest}.webp`, limit: 1 })
  if (listError) {
    console.error('Falha ao verificar imagem otimizada no Storage.', listError)
    return NextResponse.json({ error: 'Não foi possível verificar o armazenamento de imagens.' }, { status: 503 })
  }
  if (!existing?.some((object) => object.name === `${digest}.webp`)) {
    const { error } = await storage.from(bucket).upload(path, bytes, {
      contentType: 'image/webp',
      cacheControl: '31536000',
      upsert: false,
    })
    if (error) {
      const { data: concurrentObject } = await storage.from(bucket).list('products', { search: `${digest}.webp`, limit: 1 })
      if (!concurrentObject?.some((object) => object.name === `${digest}.webp`)) {
        console.error('Falha ao enviar imagem otimizada ao Storage.', error)
        return NextResponse.json({ error: 'Não foi possível armazenar a imagem.' }, { status: 503 })
      }
    }
  }

  const { data } = storage.from(bucket).getPublicUrl(path)
  return NextResponse.json({
    imageUrl: data.publicUrl,
    storagePath: path,
    size: bytes.byteLength,
    width: dimensions.width,
    height: dimensions.height,
  }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin(request)
  if (!auth.access) return auth.response
  const path = new URL(request.url).searchParams.get('path') ?? ''
  if (!/^products\/[0-9a-f]{64}\.webp$/i.test(path)) {
    return NextResponse.json({ error: 'Referência de imagem inválida.' }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !secretKey) return NextResponse.json({ error: 'O armazenamento de imagens não está configurado.' }, { status: 503 })
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'product-images'
  const storage = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } }).storage
  const imageUrl = storage.from(bucket).getPublicUrl(path).data.publicUrl
  const { count, error: referenceError } = await createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }).from('products').select('id', { count: 'exact', head: true }).eq('image_url', imageUrl)
  if (referenceError) {
    console.error('Falha ao conferir referências antes de remover imagem.', referenceError)
    return NextResponse.json({ error: 'Não foi possível conferir se a imagem ainda está em uso.' }, { status: 503 })
  }
  if ((count ?? 0) > 0) {
    return NextResponse.json({ removed: false, stillReferenced: true }, { headers: { 'Cache-Control': 'no-store' } })
  }
  const { error } = await storage.from(bucket).remove([path])
  if (error) {
    console.error('Falha ao remover imagem de produto do Storage.', error)
    return NextResponse.json({ error: 'Não foi possível remover a imagem antiga.' }, { status: 503 })
  }
  return NextResponse.json({ removed: true }, { headers: { 'Cache-Control': 'no-store' } })
}