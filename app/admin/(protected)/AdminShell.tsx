'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ClipboardList, FolderOpen, LayoutDashboard, LogOut, Package, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { adminResourceUrl, adminRequest } from '../admin-api'
import styles from '../admin.module.css'

const navigation = [
  { href: '/admin', label: 'Visão geral', icon: LayoutDashboard },
  { href: '/admin/pedidos', label: 'Pedidos', icon: ClipboardList },
  { href: '/admin/produtos', label: 'Produtos', icon: Package },
  { href: '/admin/categorias', label: 'Categorias', icon: FolderOpen },
  { href: '/admin/clientes', label: 'Clientes', icon: Users },
]

export default function AdminShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname()
  const router = useRouter()
  const [state, setState] = useState<'loading' | 'ready' | 'denied'>('loading')
  const [email, setEmail] = useState('')
  const [signOutError, setSignOutError] = useState('')

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        if (!token) {
          router.replace('/admin/login')
          return
        }
        const result = await adminRequest<{ email: string | null }>(adminResourceUrl('session'))
        if (!active) return
        setEmail(result.email ?? '')
        setState('ready')
      } catch (error) {
        if (!active) return
        if (error instanceof Error && error.message.includes('não tem acesso')) {
          setState('denied')
          return
        }
        router.replace('/admin/login')
      }
    })()
    return () => { active = false }
  }, [pathname, router])

  async function signOut() {
    setSignOutError('')
    const { error } = await supabase.auth.signOut()
    if (error) {
      setSignOutError('Não foi possível encerrar a sessão. Tente novamente.')
      return
    }
    router.replace('/admin/login')
  }

  if (state === 'loading') return <main className={styles.loading}>Validando acesso administrativo…</main>
  if (state === 'denied') return (
    <main className={styles.loginPage}>
      <section className={styles.loginPanel}>
        <h1>Acesso não autorizado</h1>
        <p>Esta conta não está habilitada para administrar a loja.</p>
        {signOutError && <p className={styles.error} role="alert">{signOutError}</p>}
        <button className={styles.secondaryButton} onClick={signOut}>Sair da conta</button>
      </section>
    </main>
  )

  return (
    <div className={styles.adminFrame}>
      <aside className={styles.sidebar}>
        <Link className={styles.brand} href="/admin">
          <span className={styles.brandMark}>B</span>
          <span><strong>BRASÃO</strong><small>PAINEL DA LOJA</small></span>
        </Link>
        <nav aria-label="Navegação administrativa" className={styles.navigation}>
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined} className={pathname === href ? styles.navActive : undefined}>
              <Icon size={18} aria-hidden="true" />{label}
            </Link>
          ))}
        </nav>
        <div className={styles.sidebarFooter}>
          <span title={email}>{email || 'Conta administrativa'}</span>
          {signOutError && <span className={styles.error} role="alert">{signOutError}</span>}
          <button type="button" onClick={signOut} aria-label="Sair"><LogOut size={17} /> Sair</button>
        </div>
      </aside>
      <main className={styles.adminMain}>
        <header className={styles.topbar}>
          <Link href="/" target="_blank">Ver loja ↗</Link>
          <span>Brasão Burger</span>
        </header>
        <div className={styles.pageContent}>{children}</div>
      </main>
    </div>
  )
}