'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Image from 'next/image'
import { adminRequest } from '../../admin-api'
import { formatImageSize, imageSavingsPercent, optimizeProductImage, type OptimizedProductImage } from '@/lib/optimize-product-image'
import styles from '../../admin.module.css'

type Category = { id: number; name: string; active: boolean }
export type Product = {
  id: number
  category_id: number
  name: string
  description: string | null
  price: number
  image_url: string | null
  featured: boolean
  available: boolean
  sort_order: number
}

function managedImagePath(imageUrl: string | null) {
  if (!imageUrl) return null
  try {
    const path = new URL(imageUrl).pathname
    return path.match(/\/storage\/v1\/object\/public\/[^/]+\/(products\/[0-9a-f]{64}\.webp)$/i)?.[1] ?? null
  } catch { return null }
}

export default function ProductForm({ product, categories, onCancel, onSaved }: {
  product: Product | null
  categories: Category[]
  onCancel: () => void
  onSaved: (notice?: string) => void
}) {
  const [name, setName] = useState(product?.name ?? '')
  const [categoryId, setCategoryId] = useState(String(product?.category_id ?? categories.find((category) => category.active)?.id ?? ''))
  const [description, setDescription] = useState(product?.description ?? '')
  const [price, setPrice] = useState(String(product?.price ?? ''))
  const [sortOrder, setSortOrder] = useState(String(product?.sort_order ?? 0))
  const [featured, setFeatured] = useState(product?.featured ?? false)
  const [available, setAvailable] = useState(product?.available ?? true)
  const [imageUrl, setImageUrl] = useState(product?.image_url ?? '')
  const [previewUrl, setPreviewUrl] = useState(product?.image_url ?? '')
  const [optimized, setOptimized] = useState<OptimizedProductImage | null>(null)
  const [processing, setProcessing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => () => {
    if (previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  async function selectImage(file?: File) {
    if (!file) return
    setError('')
    setMessage('')
    setOptimized(null)
    setPreviewUrl(URL.createObjectURL(file))
    setProcessing(true)
    try {
      const result = await optimizeProductImage(file)
      setOptimized(result)
      setPreviewUrl(URL.createObjectURL(result.file))
      setMessage(result.reused ? 'WebP já otimizado; será reutilizado sem recompressão.' : 'Prévia otimizada pronta. O arquivo só vai ao Storage ao salvar o produto.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível processar essa foto.')
    } finally { setProcessing(false) }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || processing) return
    setSaving(true)
    setError('')
    setMessage('')
    let uploadedPath = ''
    let finalImageUrl = imageUrl || null
    try {
      if (optimized) {
        const form = new FormData()
        form.set('image', optimized.file)
        const uploaded = await adminRequest<{ imageUrl: string; storagePath: string }>('/api/admin/images', { method: 'POST', body: form })
        finalImageUrl = uploaded.imageUrl
        uploadedPath = uploaded.storagePath
      }

      const result = await adminRequest<{ product: Product }>('/api/admin', {
        method: 'POST',
        body: JSON.stringify({
          resource: 'product', id: product?.id, name, categoryId: Number(categoryId), description,
          price: Number(price), imageUrl: finalImageUrl, featured, available, sortOrder: Number(sortOrder),
        }),
      })

      const oldPath = managedImagePath(product?.image_url ?? null)
      const newPath = managedImagePath(result.product.image_url)
      let savedNotice = 'Produto salvo.'
      if (oldPath && oldPath !== newPath) {
        try {
          await adminRequest(`/api/admin/images?path=${encodeURIComponent(oldPath)}`, { method: 'DELETE' })
        } catch {
          savedNotice = 'Produto salvo, mas não foi possível remover a foto anterior do Storage.'
        }
      }
      onSaved(savedNotice)
    } catch (cause) {
      let cleanupWarning = ''
      if (uploadedPath) {
        try {
          await adminRequest(`/api/admin/images?path=${encodeURIComponent(uploadedPath)}`, { method: 'DELETE' })
        } catch {
          cleanupWarning = ' A imagem enviada não pôde ser removida; verifique o Storage.'
        }
      }
      setError(`${cause instanceof Error ? cause.message : 'Não foi possível salvar o produto.'}${cleanupWarning}`)
    } finally { setSaving(false) }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label className={styles.field}>Nome do produto
        <input className={styles.input} required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className={styles.field}>Categoria
        <select className={styles.select} required value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          <option value="">Selecione</option>{categories.filter((category) => category.active).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
      </label>
      <label className={`${styles.field} ${styles.fieldWide}`}>Descrição
        <textarea className={styles.textarea} maxLength={4000} value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <label className={styles.field}>Preço (R$)
        <input className={styles.input} type="number" min="0" max="1000000" step="0.01" required value={price} onChange={(event) => setPrice(event.target.value)} />
      </label>
      <label className={styles.field}>Ordem de exibição
        <input className={styles.input} type="number" step="1" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} />
      </label>
      <div className={`${styles.field} ${styles.fieldWide}`}>
        <span>Foto do produto</span>
        <div className={styles.imageField}>
          {previewUrl ? <Image className={styles.imagePreview} src={previewUrl} alt={`Prévia de ${name || 'produto'}`} width={320} height={240} unoptimized /> : <div className={styles.imagePreview} aria-label="Sem imagem" />}
          <div>
            <input aria-label="Selecionar foto do produto" type="file" accept=".jpg,.jpeg,.png,.webp,.avif,image/jpeg,image/png,image/webp,image/avif" onChange={(event) => void selectImage(event.target.files?.[0])} disabled={processing || saving} />
            <p className={styles.muted}>Será redimensionada até 1600 px e convertida para WebP antes do envio (máximo 20 MB original).</p>
            {processing && <p className={styles.notice} role="status">Otimizando foto…</p>}
            {optimized && <p className={styles.muted}>Original: {formatImageSize(optimized.sourceBytes)} · otimizada: {formatImageSize(optimized.file.size)} · economia: {imageSavingsPercent(optimized.sourceBytes, optimized.file.size).toLocaleString('pt-BR')}%</p>}
            {message && <p className={styles.notice} role="status">{message}</p>}
            {(imageUrl || optimized) && <button type="button" className={styles.secondaryButton} onClick={() => { setImageUrl(''); setPreviewUrl(''); setOptimized(null); setMessage('Foto removida. A alteração será aplicada ao salvar.') }}>Remover foto</button>}
          </div>
        </div>
      </div>
      <label className={styles.checkField}><input type="checkbox" checked={featured} onChange={(event) => setFeatured(event.target.checked)} /> Produto em destaque</label>
      <label className={styles.checkField}><input type="checkbox" checked={available} onChange={(event) => setAvailable(event.target.checked)} /> Disponível no cardápio</label>
      {error && <p className={`${styles.error} ${styles.fieldWide}`} role="alert">{error}</p>}
      <div className={`${styles.toolbar} ${styles.fieldWide}`}>
        <button className={styles.primaryButton} type="submit" disabled={saving || processing || categories.every((category) => !category.active)}>{saving ? 'Salvando…' : product ? 'Salvar produto' : 'Criar produto'}</button>
        <button className={styles.secondaryButton} type="button" disabled={saving} onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  )
}