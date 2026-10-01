'use client'

import { useCallback, useEffect, useState } from 'react'
import { adminRequest, adminResourceUrl } from '../../admin-api'
import styles from '../../admin.module.css'

type Order = {
  id: string
  created_at: string
  customer_name: string
  customer_phone: string
  delivery_method: string
  address: string | null
  address_number: string | null
  complement: string | null
  neighborhood: string | null
  zip_code: string | null
  reference: string | null
  payment_method: string
  payment_status: string
  status: string
  subtotal: number
  delivery_fee: number
  total: number
  change_for: number | null
}

type OrderItem = { id: number; product_name: string; quantity: number; unit_price: number; line_total: number }
type OrderList = { rows: Order[]; count: number; page: number; pageSize: number }

const ORDER_STATES = [
  ['pending', 'Recebido'], ['preparing', 'Em preparação'], ['ready', 'Pronto'],
  ['out_for_delivery', 'Saiu para entrega'], ['completed', 'Concluído'], ['cancelled', 'Cancelado'],
]
const PAYMENT_STATES = [['pending', 'Pendente'], ['confirmed', 'Confirmado'], ['cancelled', 'Cancelado'], ['refunded', 'Reembolsado']]
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

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value))
}

function date(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

export default function AdminOrdersPage() {
  const [list, setList] = useState<OrderList | null>(null)
  const [selected, setSelected] = useState<Order | null>(null)
  const [items, setItems] = useState<OrderItem[]>([])
  const [customerEmail, setCustomerEmail] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [payment, setPayment] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const result = await adminRequest<OrderList>(adminResourceUrl('orders', {
        page: String(page), ...(search ? { q: search } : {}), ...(status ? { status } : {}), ...(payment ? { payment } : {}),
      }))
      setList(result)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os pedidos.')
    } finally { setLoading(false) }
  }, [page, search, status, payment])

  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => { if (active) void load() })
    return () => { active = false }
  }, [load])

  async function openOrder(order: Order) {
    setSelected(order)
    setItems([])
    setMessage('')
    try {
      const result = await adminRequest<{ order: Order; items: OrderItem[]; customerEmail: string | null }>(adminResourceUrl('order', { id: order.id }))
      setSelected(result.order)
      setItems(result.items)
      setCustomerEmail(result.customerEmail)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível abrir o pedido.')
    }
  }

  async function updateOrder(field: 'status' | 'paymentStatus', value: string) {
    if (!selected) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const result = await adminRequest<{ order: Order }>('/api/admin', {
        method: 'PATCH', body: JSON.stringify({ resource: 'order', id: selected.id, [field]: value }),
      })
      setSelected(result.order)
      setMessage('Alteração salva.')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o pedido.')
    } finally { setSaving(false) }
  }

  return (
    <>
      <div className={styles.pageHeading}><div><h1>Pedidos</h1><p>Consulte pedidos e atualize o andamento.</p></div></div>
      <div className={styles.toolbar}>
        <input className={styles.input} aria-label="Pesquisar pedidos" placeholder="Nome, telefone ou protocolo" value={search} onChange={(event) => { setPage(1); setSearch(event.target.value) }} />
        <select className={styles.select} aria-label="Filtrar status" value={status} onChange={(event) => { setPage(1); setStatus(event.target.value) }}>
          <option value="">Todos os status</option>{ORDER_STATES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select className={styles.select} aria-label="Filtrar pagamento" value={payment} onChange={(event) => { setPage(1); setPayment(event.target.value) }}>
          <option value="">Todos os pagamentos</option><option value="pix">PIX</option><option value="card">Cartão</option><option value="cash">Dinheiro</option>
        </select>
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {message && <p className={styles.notice} role="status">{message}</p>}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th>Protocolo</th><th>Data</th><th>Cliente</th><th>Recebimento</th><th>Pagamento</th><th>Status</th><th>Total</th></tr></thead>
          <tbody>
            {list?.rows.map((order) => <tr key={order.id}>
              <td><button type="button" onClick={() => void openOrder(order)}>{order.id.slice(0, 8).toUpperCase()}</button></td>
              <td>{date(order.created_at)}</td><td>{order.customer_name}<br /><span className={styles.muted}>{order.customer_phone}</span></td>
              <td>{order.delivery_method === 'pickup' ? 'Retirada' : 'Entrega'}</td>
              <td>{order.payment_method === 'pix' ? 'PIX' : order.payment_method === 'cash' ? 'Dinheiro' : 'Cartão'}<br /><span className={styles.muted}>{order.payment_status === 'confirmed' ? 'Confirmado' : order.payment_status === 'pending' ? 'Pendente' : order.payment_status}</span></td>
              <td><span className={styles.status}>{ORDER_STATES.find(([key]) => key === order.status)?.[1] ?? order.status}</span></td>
              <td>{money(order.total)}</td>
            </tr>)}
            {!loading && list?.rows.length === 0 && <tr><td colSpan={7} className={styles.empty}>Nenhum pedido encontrado.</td></tr>}
            {loading && <tr><td colSpan={7} className={styles.empty}>Carregando pedidos…</td></tr>}
          </tbody>
        </table>
      </div>
      <div className={styles.pagination}>
        <span>{list?.count ?? 0} pedidos</span>
        <button className={styles.secondaryButton} disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Anterior</button>
        <span>Página {page}</span>
        <button className={styles.secondaryButton} disabled={!list || page * list.pageSize >= list.count || loading} onClick={() => setPage((value) => value + 1)}>Próxima</button>
      </div>

      {selected && <section className={styles.detailPanel} aria-labelledby="order-detail-title">
        <div className={styles.pageHeading}><div><h2 id="order-detail-title">Pedido {selected.id.slice(0, 8).toUpperCase()}</h2><p>{date(selected.created_at)}</p></div><button className={styles.secondaryButton} onClick={() => setSelected(null)}>Fechar</button></div>
        <div className={styles.detailGrid}>
          <div><span>Cliente</span><strong>{selected.customer_name} · {selected.customer_phone}{customerEmail ? ` · ${customerEmail}` : ''}</strong></div>
          <div><span>Recebimento</span><strong>{selected.delivery_method === 'pickup' ? 'Retirada' : 'Entrega'}</strong></div>
          <div><span>Endereço</span><strong>{selected.delivery_method === 'delivery' ? `${selected.address ?? ''}, ${selected.address_number ?? ''} · ${selected.neighborhood ?? ''} · CEP ${selected.zip_code ?? ''}` : 'Retirada no local'}</strong></div>
          <div><span>Complemento / referência</span><strong>{[selected.complement, selected.reference].filter(Boolean).join(' · ') || 'Não informado'}</strong></div>
          <div><span>Pagamento</span><strong>{selected.payment_method === 'pix' ? 'PIX' : selected.payment_method === 'cash' ? 'Dinheiro' : 'Cartão'}{selected.change_for ? ` · troco para ${money(selected.change_for)}` : ''}</strong></div>
          <div><span>Subtotal · entrega · total</span><strong>{money(selected.subtotal)} · {money(selected.delivery_fee)} · {money(selected.total)}</strong></div>
        </div>
        <h3 className={styles.sectionTitle}>Itens</h3>
        <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Produto</th><th>Quantidade</th><th>Unitário</th><th>Subtotal</th></tr></thead><tbody>
          {items.map((item) => <tr key={item.id}><td>{item.product_name}</td><td>{item.quantity}</td><td>{money(item.unit_price)}</td><td>{money(item.line_total)}</td></tr>)}
          {items.length === 0 && <tr><td colSpan={4} className={styles.empty}>Carregando itens…</td></tr>}
        </tbody></table></div>
        <div className={styles.toolbar} style={{ marginTop: 14 }}>
          <label className={styles.field}>Status do pedido
            <select className={styles.select} disabled={saving} value={selected.status} onChange={(event) => void updateOrder('status', event.target.value)}>
              {[selected.status, ...(ORDER_STATUS_TRANSITIONS[selected.status] ?? [])].map((value) => <option key={value} value={value}>{ORDER_STATES.find(([key]) => key === value)?.[1] ?? value}</option>)}
            </select>
          </label>
          <label className={styles.field}>Status do pagamento
            <select className={styles.select} disabled={saving} value={selected.payment_status || 'pending'} onChange={(event) => void updateOrder('paymentStatus', event.target.value)}>
              {[selected.payment_status || 'pending', ...(PAYMENT_STATUS_TRANSITIONS[selected.payment_status || 'pending'] ?? [])].map((value) => <option key={value} value={value}>{PAYMENT_STATES.find(([key]) => key === value)?.[1] ?? value}</option>)}
            </select>
          </label>
        </div>
        <p className={styles.muted}>A confirmação do pagamento é manual. Não há integração com banco ou gateway.</p>
      </section>}
    </>
  )
}