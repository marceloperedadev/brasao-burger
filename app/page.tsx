
import { supabase } from '@/lib/supabase'

import { BioHero } from './components/BioHero/BioHero'
import { HubCards } from './components/HubCards/HubCards'
import { Gallery } from './components/Gallery/Gallery'
import { Footer } from './components/Footer/Footer'

export const dynamic = 'force-dynamic'

export default async function Home() {
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

  /*
   * =========================================================
   * ERRO DE CARREGAMENTO
   * =========================================================
   */

  if (
    categoriesError ||
    productsError
  ) {
    console.error('Falha ao carregar dados do Supabase na página inicial.', {
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
            Erro ao carregar a página
          </h1>

          <p>
            Não foi possível carregar os dados agora. Tente novamente mais tarde.
          </p>
        </div>
      </main>
    )
  }

  /*
   * =========================================================
   * DADOS DO CARDÁPIO
   * =========================================================
   */

  const safeCategories =
    categories ?? []

  const safeProducts =
    products ?? []

  /*
   * =========================================================
   * HOME
   * =========================================================
   */

  return (
    <main>
      <BioHero />

      <HubCards
        categories={safeCategories}
        products={safeProducts}
      />

      <Gallery
        categories={safeCategories}
        products={safeProducts}
      />

      <Footer />
    </main>
  )
}
