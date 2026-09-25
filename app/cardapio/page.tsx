import { supabase } from '@/lib/supabase'
import CardapioClient from './CardapioClient'

export const dynamic = 'force-dynamic'

export default async function CardapioPage() {
  const {
    data: categories,
    error: categoriesError,
  } = await supabase
    .from('categories')
    .select(
      'id, name, slug, sort_order'
    )
    .eq('active', true)
    .order('sort_order', {
      ascending: true,
    })

  const {
    data: products,
    error: productsError,
  } = await supabase
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
    .order('sort_order', {
      ascending: true,
    })

  if (
    categoriesError ||
    productsError
  ) {
    console.error('Falha ao carregar dados do Supabase no cardápio.', {
      categoriesError,
      productsError,
    })

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
        <div
          style={{
            width: '100%',
            maxWidth: '560px',
          }}
        >
          <h1>
            Erro ao carregar o cardápio
          </h1>

          <p>
            Não foi possível carregar os produtos agora. Tente novamente mais tarde.
          </p>
        </div>
      </main>
    )
  }

  return (
    <CardapioClient
      categories={
        categories ?? []
      }
      products={
        products ?? []
      }
    />
  )
}
