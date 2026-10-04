import type { Metadata } from 'next'
import { supabase } from '@/lib/supabase'
import CardapioClient from './CardapioClient'

export const metadata: Metadata = {
  title: 'Cardápio e delivery',

  description:
    'Cardápio completo do Brasão Burger, com carrinho, cálculo de entrega em Taubaté e pedido finalizado pelo WhatsApp.',

  alternates: {
    canonical: '/cardapio',
  },
}

export const dynamic = 'force-dynamic'

export default async function CardapioPage() {
  let categories = null
  let products = null
  let hasLoadError = false

  try {
    const categoriesResult = await supabase
      .from('categories')
      .select('id, name, slug, sort_order')
      .eq('active', true)
      .order('sort_order', { ascending: true })

    const productsResult = await supabase
      .from('products')
      .select(`
        id,
        category_id,
        name,
        description,
        price,
        image_url,
        featured,
        available,
        sort_order
      `)
      .eq('available', true)
      .order('sort_order', { ascending: true })

    categories = categoriesResult.data
    products = productsResult.data
    hasLoadError = Boolean(categoriesResult.error || productsResult.error)

    if (hasLoadError) {
      console.error('Falha ao carregar dados do Supabase no cardápio.', {
        categoriesError: categoriesResult.error,
        productsError: productsResult.error,
      })
    }
  } catch (error) {
    console.error('Falha inesperada ao inicializar o cardápio.', error)
    hasLoadError = true
  }

  if (hasLoadError) return <MenuLoadError />
  return <CardapioClient categories={categories ?? []} products={products ?? []} />
}

function MenuLoadError() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '24px',
        background: '#090807',
        color: '#f5eee2',
      }}
    >
      <div style={{ width: '100%', maxWidth: '560px' }}>
        <p style={{ color: '#e7a33e', fontWeight: 700 }}>Brasão Burger</p>
        <h1>Cardápio temporariamente indisponível</h1>
        <p>Não conseguimos carregar os produtos agora. Tente novamente em alguns instantes.</p>
      </div>
    </main>
  )
}
