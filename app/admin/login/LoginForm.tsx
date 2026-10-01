'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import styles from '../admin.module.css'

export default function LoginForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function signIn() {
    setLoading(true)
    setMessage('')
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/admin` },
      })
      if (error) throw error
    } catch {
      setMessage('Não foi possível iniciar o login. Verifique a configuração do Google no Supabase.')
      setLoading(false)
    }
  }

  return (
    <main className={styles.loginPage}>
      <section className={styles.loginPanel}>
        <span className={styles.brandMark}>B</span>
        <h1>Administração da loja</h1>
        <p>Entre com sua conta autorizada para acessar pedidos e catálogo.</p>
        {message && <p className={styles.error} role="alert">{message}</p>}
        <button type="button" className={styles.primaryButton} disabled={loading} onClick={signIn}>
          {loading ? 'Conectando…' : 'Entrar com Google'}
        </button>
        <button type="button" className={styles.secondaryButton} onClick={() => router.push('/')}>Voltar à loja</button>
      </section>
    </main>
  )
}