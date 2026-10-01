'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { adminRequest, adminResourceUrl } from '../../admin-api'
import styles from '../../admin.module.css'

type Category = { id: number; name: string; slug: string; sort_order: number; active: boolean }
type CategoryList = { rows: Category[]; count: number; page: number; pageSize: number }

export default function AdminCategoriesPage() {
  const [list, setList] = useState<CategoryList | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<Category | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  const [active, setActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    try {
      const result = await adminRequest<CategoryList>(adminResourceUrl('categories', { page: String(page), ...(search ? { q: search } : {}) }))
      setList(result)
      setError('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as categorias.') }
    finally { setLoading(false) }
  }, [page, search])

  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => { if (active) void load() })
    return () => { active = false }
  }, [load])

  function startNew() {
    setEditing(null); setCreating(true); setName(''); setSlug(''); setSortOrder('0'); setActive(true); setError(''); setMessage('')
  }

  function startEdit(category: Category) {
    setEditing(category); setCreating(false); setName(category.name); setSlug(category.slug); setSortOrder(String(category.sort_order)); setActive(category.active); setError(''); setMessage('')
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true); setError(''); setMessage('')
    try {
      await adminRequest('/api/admin', {
        method: 'POST', body: JSON.stringify({ resource: 'category', id: editing?.id, name, slug, sortOrder: Number(sortOrder), active }),
      })
      setCreating(false); setEditing(null); setMessage('Categoria salva.'); await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a categoria.') }
    finally { setSaving(false) }
  }

  async function toggle(category: Category) {
    setError(''); setMessage('')
    try {
      await adminRequest('/api/admin', { method: 'PATCH', body: JSON.stringify({ resource: 'category', id: category.id, active: !category.active }) })
      setMessage(category.active ? 'Categoria desativada.' : 'Categoria ativada.'); await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a categoria.') }
  }

  return (
    <>
      <div className={styles.pageHeading}><div><h1>Categorias</h1><p>Organize as seções exibidas no cardápio.</p></div><button className={styles.primaryButton} onClick={startNew}>Nova categoria</button></div>
      {(creating || editing) && <section className={styles.detailPanel}>
        <h2 className={styles.sectionTitle}>{editing ? 'Editar categoria' : 'Nova categoria'}</h2>
        <form className={styles.form} onSubmit={save}>
          <label className={styles.field}>Nome<input className={styles.input} required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className={styles.field}>Slug da URL<input className={styles.input} maxLength={100} value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="Gerado pelo nome se vazio" /></label>
          <label className={styles.field}>Ordem<input className={styles.input} type="number" step="1" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} /></label>
          <label className={styles.checkField}><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> Ativa no cardápio</label>
          {error && <p className={`${styles.error} ${styles.fieldWide}`} role="alert">{error}</p>}
          <div className={`${styles.toolbar} ${styles.fieldWide}`}><button className={styles.primaryButton} disabled={saving}>{saving ? 'Salvando…' : 'Salvar categoria'}</button><button type="button" className={styles.secondaryButton} onClick={() => { setCreating(false); setEditing(null) }}>Cancelar</button></div>
        </form>
      </section>}
      <div className={styles.toolbar}><input className={styles.input} aria-label="Pesquisar categorias" placeholder="Pesquisar pelo nome" value={search} onChange={(event) => { setPage(1); setSearch(event.target.value) }} /></div>
      {error && !creating && !editing && <p className={styles.error} role="alert">{error}</p>}{message && <p className={styles.notice} role="status">{message}</p>}
      <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th>Categoria</th><th>Slug</th><th>Ordem</th><th>Status</th><th>Ações</th></tr></thead>
        <tbody>{list?.rows.map((category) => <tr key={category.id}><td>{category.name}</td><td>{category.slug}</td><td>{category.sort_order}</td><td><span className={styles.status}>{category.active ? 'Ativa' : 'Inativa'}</span></td><td><button onClick={() => startEdit(category)}>Editar</button>{' · '}<button onClick={() => void toggle(category)}>{category.active ? 'Desativar' : 'Ativar'}</button></td></tr>)}
          {!loading && list?.rows.length === 0 && <tr><td colSpan={5} className={styles.empty}>Nenhuma categoria encontrada.</td></tr>}{loading && <tr><td colSpan={5} className={styles.empty}>Carregando categorias…</td></tr>}
        </tbody>
      </table></div>
      <div className={styles.pagination}><span>{list?.count ?? 0} categorias</span><button className={styles.secondaryButton} disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Anterior</button><span>Página {page}</span><button className={styles.secondaryButton} disabled={!list || page * list.pageSize >= list.count || loading} onClick={() => setPage((value) => value + 1)}>Próxima</button></div>
      <p className={styles.muted}>Categorias são desativadas em vez de excluídas para preservar produtos relacionados.</p>
    </>
  )
}