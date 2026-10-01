'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { adminRequest, adminResourceUrl } from '../admin-api'
import styles from '../admin.module.css'

type OrderSummary = {
  id: string
  created_at: string
  customer_name: string
  payment_method: string
  payment_status: string
  status: string
  total: number
}

type DashboardData = {
  recent: OrderSummary[]
  counts: { pending: number; preparing: number; ready: number; completed: number; cancelled: number; paymentPending: number }
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    void adminRequest<DashboardData>(adminResourceUrl('dashboard'))
      .then((result) => { if (active) setData(result) })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Falha ao carregar o painel.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  return (
    <>
      <div className={styles.pageHeading}>
        <div><h1>Visão geral</h1><p>Acompanhe o movimento da loja.</p></div>
        <Link className={styles.secondaryButton} href="/admin/pedidos">Ver pedidos</Link>
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {loading ? <p className={styles.muted}>Carregando dados reais…</p> : data && <>
        <section className={styles.statGrid} aria-label="Resumo operacional">
          <div className={styles.stat}><span>Aguardando atendimento</span><strong>{data.counts.pending}</strong></div>
          <div className={styles.stat}><span>Em preparação</span><strong>{data.counts.preparing}</strong></div>
          <div className={styles.stat}><span>Prontos</span><strong>{data.counts.ready}</strong></div>
          <div className={styles.stat}><span>Concluídos</span><strong>{data.counts.completed}</strong></div>
          <div className={styles.stat}><span>Cancelados</span><strong>{data.counts.cancelled}</strong></div>
          <div className={styles.stat}><span>Pagamentos pendentes</span><strong>{data.counts.paymentPending}</strong></div>
        </section>
        <h2 className={styles.sectionTitle}>Pedidos recentes</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Pedido</th><th>Data</th><th>Cliente</th><th>Pagamento</th><th>Status</th><th>Total</th></tr></thead>
            <tbody>
              {data.recent.map((order) => <tr key={order.id}>
                <td><Link href="/admin/pedidos">{order.id.slice(0, 8).toUpperCase()}</Link></td>
                <td>{formatDate(order.created_at)}</td><td>{order.customer_name}</td>
                <td>{order.payment_method === 'pix' ? 'PIX' : order.payment_method === 'cash' ? 'Dinheiro' : 'Cartão'} · {order.payment_status === 'confirmed' ? 'Confirmado' : 'Pendente'}</td>
                <td><span className={styles.status}>{order.status}</span></td><td>{formatCurrency(Number(order.total))}</td>
              </tr>)}
              {data.recent.length === 0 && <tr><td colSpan={6} className={styles.empty}>Nenhum pedido encontrado.</td></tr>}
            </tbody>
          </table>
        </div>
      </>}
    </>
  )
}