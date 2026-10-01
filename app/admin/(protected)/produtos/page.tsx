'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import ProductForm, { type Product } from './ProductForm'
import { adminRequest, adminResourceUrl } from '../../admin-api'
import styles from '../../admin.module.css'

type Category = { id: number; name: string; active: boolean }
type ProductList = { rows: Product[]; count: number; page: number; pageSize: number }

export default function AdminProductsPage() {
  const [list, setList] = useState<ProductList | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [page, setPage] = useState(1)
  const [editor, setEditor] = useState<Product | null | false>(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    try {
      const result = await adminRequest<ProductList>(adminResourceUrl('products', {
        page: String(page), ...(search ? { q: search } : {}), ...(categoryId ? { categoryId } : {}),
      }))
      setList(result)
      setError('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os produtos.') }
    finally { setLoading(false) }
  }, [categoryId, page, search])

  useEffect(() => {
    void adminRequest<{ rows: Category[] }>(adminResourceUrl('categories', { page: '1' }))
      .then((result) => setCategories(result.rows))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as categorias.'))
  }, [])
  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => { if (active) void load() })
    return () => { active = false }
  }, [load])

  async function toggle(product: Product) {
    setError('')
    setMessage('')
    try {
      await adminRequest<{ product: Product }>('/api/admin', {
        method: 'PATCH', body: JSON.stringify({ resource: 'product', id: product.id, available: !product.available }),
      })
      setMessage(product.available ? 'Produto desativado no cardápio.' : 'Produto ativado no cardápio.')
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível alterar a disponibilidade.') }
  }

  return (
    <>
      <div className={styles.pageHeading}>
        <div><h1>Produtos</h1><p>Cadastre itens, preços, categorias e disponibilidade.</p></div>
        <button type="button" className={styles.primaryButton} onClick={() => setEditor(null)}>Novo produto</button>
      </div>
      {editor !== false && <section className={styles.detailPanel}>
        <h2 className={styles.sectionTitle}>{editor ? 'Editar produto' : 'Novo produto'}</h2>
        {categories.every((category) => !category.active) && <p className={styles.notice}>Ative ou crie uma categoria antes de cadastrar produtos.</p>}
        <ProductForm product={editor} categories={categories} onCancel={() => setEditor(false)} onSaved={(notice) => { setEditor(false); setMessage(notice ?? 'Produto salvo.'); void load() }} />
      </section>}
      <div className={styles.toolbar}>
        <input className={styles.input} aria-label="Pesquisar produtos" placeholder="Pesquisar pelo nome" value={search} onChange={(event) => { setPage(1); setSearch(event.target.value) }} />
        <select className={styles.select} aria-label="Filtrar por categoria" value={categoryId} onChange={(event) => { setPage(1); setCategoryId(event.target.value) }}>
          <option value="">Todas as categorias</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {message && <p className={styles.notice} role="status">{message}</p>}
      <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th>Produto</th><th>Categoria</th><th>Preço</th><th>Destaque</th><th>Disponibilidade</th><th>Ações</th></tr></thead>
        <tbody>
          {list?.rows.map((product) => <tr key={product.id}>
            <td>{product.image_url && <Image src={product.image_url} alt="" width={42} height={42} unoptimized style={{ display: 'inline-block', objectFit: 'cover', verticalAlign: 'middle', marginRight: 8, borderRadius: 4 }} />}{product.name}</td>
            <td>{categories.find((category) => category.id === product.category_id)?.name ?? 'Categoria indisponível'}</td>
            <td>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(product.price))}</td>
            <td>{product.featured ? 'Sim' : 'Não'}</td>
            <td><span className={styles.status}>{product.available ? 'Ativo' : 'Inativo'}</span></td>
            <td><button type="button" onClick={() => setEditor(product)}>Editar</button>{' · '}<button type="button" onClick={() => void toggle(product)}>{product.available ? 'Desativar' : 'Ativar'}</button></td>
          </tr>)}
          {!loading && list?.rows.length === 0 && <tr><td colSpan={6} className={styles.empty}>Nenhum produto encontrado.</td></tr>}
          {loading && <tr><td colSpan={6} className={styles.empty}>Carregando produtos…</td></tr>}
        </tbody>
      </table></div>
      <div className={styles.pagination}><span>{list?.count ?? 0} produtos</span>
        <button className={styles.secondaryButton} disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Anterior</button><span>Página {page}</span>
        <button className={styles.secondaryButton} disabled={!list || page * list.pageSize >= list.count || loading} onClick={() => setPage((value) => value + 1)}>Próxima</button>
      </div>
      <p className={styles.muted}>O catálogo não possui coluna de estoque. A disponibilidade acima publica ou oculta o produto, sem simular saldo.</p>
    </>
  )
}