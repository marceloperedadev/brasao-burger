'use client'

import { useCallback, useEffect, useState } from 'react'
import { adminRequest, adminResourceUrl } from '../../admin-api'
import styles from '../../admin.module.css'

type Customer = {
  user_id: string
  name: string
  phone: string
  address: string | null
  number: string | null
  complement: string | null
  neighborhood: string | null
  zip_code: string | null
  city: string | null
  state: string | null
  created_at: string
}
type Order = { id: string; created_at: string; payment_method: string; payment_status: string; status: string; total: number }
type CustomerList = { rows: Customer[]; count: number; page: number; pageSize: number }

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value))
}

export default function AdminCustomersPage() {
  const [list, setList] = useState<CustomerList | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<{ customer: Customer; email: string | null; orders: Order[] } | null>(null)

  const load = useCallback(async () => {
    try {
      const result = await adminRequest<CustomerList>(adminResourceUrl('customers', { page: String(page), ...(search ? { q: search } : {}) }))
      setList(result)
      setError('')
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os clientes.') }
    finally { setLoading(false) }
  }, [page, search])
  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => { if (active) void load() })
    return () => { active = false }
  }, [load])

  async function open(customer: Customer) {
    setError('')
    try { setDetail(await adminRequest(adminResourceUrl('customer', { id: customer.user_id }))) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível abrir o cliente.') }
  }

  return (
    <>
      <div className={styles.pageHeading}><div><h1>Clientes</h1><p>Perfis que optaram por salvar os dados da conta.</p></div></div>
      <div className={styles.toolbar}><input className={styles.input} aria-label="Pesquisar clientes" placeholder="Nome ou telefone" value={search} onChange={(event) => { setPage(1); setSearch(event.target.value) }} /></div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th>Cliente</th><th>Telefone</th><th>Cidade</th><th>Cadastro</th><th></th></tr></thead>
        <tbody>{list?.rows.map((customer) => <tr key={customer.user_id}><td>{customer.name}</td><td>{customer.phone}</td><td>{[customer.city, customer.state].filter(Boolean).join(' / ') || 'Não informado'}</td><td>{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(customer.created_at))}</td><td><button onClick={() => void open(customer)}>Ver cadastro e pedidos</button></td></tr>)}
          {!loading && list?.rows.length === 0 && <tr><td colSpan={5} className={styles.empty}>Nenhum cliente encontrado.</td></tr>}{loading && <tr><td colSpan={5} className={styles.empty}>Carregando clientes…</td></tr>}
        </tbody>
      </table></div>
      <div className={styles.pagination}><span>{list?.count ?? 0} clientes</span><button className={styles.secondaryButton} disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Anterior</button><span>Página {page}</span><button className={styles.secondaryButton} disabled={!list || page * list.pageSize >= list.count || loading} onClick={() => setPage((value) => value + 1)}>Próxima</button></div>
      {detail && <section className={styles.detailPanel}>
        <div className={styles.pageHeading}><div><h2>{detail.customer.name}</h2><p>{detail.email ?? 'E-mail não disponível'} · {detail.customer.phone}</p></div><button className={styles.secondaryButton} onClick={() => setDetail(null)}>Fechar</button></div>
        <div className={styles.detailGrid}><div><span>Endereço</span><strong>{[detail.customer.address, detail.customer.number, detail.customer.complement].filter(Boolean).join(', ') || 'Não informado'}</strong></div><div><span>Bairro / cidade</span><strong>{[detail.customer.neighborhood, detail.customer.city, detail.customer.state].filter(Boolean).join(' · ') || 'Não informado'}</strong></div><div><span>CEP</span><strong>{detail.customer.zip_code || 'Não informado'}</strong></div></div>
        <h3 className={styles.sectionTitle}>Pedidos recentes (até 50)</h3>
        <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Pedido</th><th>Data</th><th>Pagamento</th><th>Status</th><th>Total</th></tr></thead><tbody>
          {detail.orders.map((order) => <tr key={order.id}><td>{order.id.slice(0, 8).toUpperCase()}</td><td>{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(order.created_at))}</td><td>{order.payment_method === 'pix' ? 'PIX' : order.payment_method === 'cash' ? 'Dinheiro' : 'Cartão'} · {order.payment_status}</td><td>{order.status}</td><td>{money(order.total)}</td></tr>)}
          {detail.orders.length === 0 && <tr><td colSpan={5} className={styles.empty}>Nenhum pedido vinculado a esta conta.</td></tr>}
        </tbody></table></div>
      </section>}
    </>
  )
}