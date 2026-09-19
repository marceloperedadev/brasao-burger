'use client'

import Image from 'next/image'
import Link from 'next/link'

import styles from './Gallery.module.css'
import type { Category, Product } from '@/app/types/menu'

type Props = {
  categories?: Category[]
  products?: Product[]
}

export function Gallery({
  categories = [],
  products = [],
}: Props) {
  /*
   * =========================================================
   * ATÉ 4 CATEGORIAS REAIS DO CARDÁPIO
   * =========================================================
   *
   * A Gallery representa CATEGORIAS, e não produtos.
   *
   * Exemplo:
   *
   * Burgers
   * Porções
   * Bebidas
   * Sobremesas
   *
   * Cada categoria aparece apenas UMA vez.
   *
   * Critérios:
   * 1. Categoria ativa
   * 2. Precisa possuir pelo menos um produto disponível
   * 3. Respeita sort_order do banco
   * 4. Máximo de 4 categorias
   */

  const showcaseCategories = [...categories]
    .filter((category) =>
      products.some(
        (product) =>
          product.available &&
          product.category_id ===
            category.id
      )
    )
    .sort(
      (a, b) =>
        a.sort_order -
        b.sort_order
    )
    .slice(0, 4)

  /*
   * =========================================================
   * PRODUTO REPRESENTATIVO DA CATEGORIA
   * =========================================================
   *
   * Cada categoria terá UMA imagem representativa.
   *
   * Prioridade:
   * 1. Produto disponível
   * 2. Produto marcado como destaque
   * 3. sort_order do banco
   */

  function getRepresentativeProduct(
    categoryId: number
  ): Product | null {
    return (
      [...products]
        .filter(
          (product) =>
            product.available &&
            product.category_id ===
              categoryId
        )
        .sort((a, b) => {
          if (
            a.featured &&
            !b.featured
          ) {
            return -1
          }

          if (
            !a.featured &&
            b.featured
          ) {
            return 1
          }

          return (
            a.sort_order -
            b.sort_order
          )
        })[0] ?? null
    )
  }

  /*
   * =========================================================
   * TRANSFORMA CATEGORIAS EM CARDS
   * =========================================================
   */

  const experienceItems =
    showcaseCategories.map(
      (category, index) => {
        const product =
          getRepresentativeProduct(
            category.id
          )

        return {
          id: String(category.id),

          number: String(
            index + 1
          ).padStart(2, '0'),

          /*
           * O CARD REPRESENTA A CATEGORIA
           */
          category:
            category.name,

          /*
           * O produto é usado apenas
           * como destaque visual/textual.
           */
          title:
            product?.name ??
            category.name,

          description:
            product?.description ??
            `Confira as opções de ${category.name.toLowerCase()} disponíveis no cardápio do Brasão Burger.`,

          image:
            product?.image_url ??
            null,

          alt:
            product
              ? `${product.name} — ${category.name}`
              : `${category.name} — Brasão Burger`,

          ctaText:
            `Ver ${category.name}`,

          /*
           * IMPORTANTE:
           * agora o link leva para a categoria
           * específica dentro do cardápio.
           */
          href:
            `/cardapio?categoria=${encodeURIComponent(
              category.slug
            )}`,
        }
      }
    )

  return (
    <section
      className={
        styles.gallerySection
      }
      aria-labelledby="vitrine-brasao-title"
    >

      {/* =====================================================
          CABEÇALHO
          ===================================================== */}

      <header
        className={
          styles.headerContainer
        }
      >

        <div
          className={
            styles.brandBadge
          }
        >

          <span
            className={
              styles.brandBadgeSymbol
            }
            aria-hidden="true"
          />

          <span>
            Experiência Brasão
          </span>

        </div>

        <h2
          id="vitrine-brasao-title"
          className={
            styles.mainTitle
          }
        >
          Escolha o seu{' '}
          <span>
            momento.
          </span>
        </h2>

        <p
          className={
            styles.subTitle
          }
        >
          Dos nossos burgers artesanais às
          especialidades da casa. Conheça
          algumas das categorias do cardápio
          Brasão.
        </p>

      </header>

      {/* =====================================================
          GALERIA DE CATEGORIAS
          ===================================================== */}

      <div
        className={
          styles.scrollArea
        }
        role="region"
        aria-label="Categorias do cardápio do Brasão Burger"
      >

        {experienceItems.map(
          (item, index) => (

            <article
              key={item.id}
              className={
                styles.experienceCard
              }
            >

              {/* =================================================
                  MARCA D'ÁGUA DO BRASÃO
                  ================================================= */}

              <div
                className={
                  styles.brasaoWatermark
                }
                aria-hidden="true"
              >

                <Image
                  src="/images/logo-brasao.png"
                  alt=""
                  width={30}
                  height={30}
                />

              </div>

              {/* =================================================
                  IMAGEM REPRESENTATIVA DA CATEGORIA
                  ================================================= */}

              <div
                className={
                  styles.imageContainer
                }
              >

                {item.image ? (

                  <Image
                    src={item.image}
                    alt={item.alt}
                    fill
                    priority={
                      index === 0
                    }
                    sizes="(max-width: 639px) 84vw, (max-width: 1023px) 320px, 280px"
                    className={
                      styles.cardImage
                    }
                    quality={85}
                  />

                ) : (

                  <div
                    className={
                      styles.cardImageFallback
                    }
                    aria-hidden="true"
                  />

                )}

                <div
                  className={
                    styles.cardGradientOverlay
                  }
                  aria-hidden="true"
                />

              </div>

              {/* =================================================
                  CONTEÚDO
                  ================================================= */}

              <div
                className={
                  styles.cardContent
                }
              >

                <span
                  className={
                    styles.categoryTag
                  }
                >
                  {item.category}
                </span>

                <h3
                  className={
                    styles.cardTitle
                  }
                >
                  {item.title}
                </h3>

                <p
                  className={
                    styles.cardDescription
                  }
                >
                  {item.description}
                </p>

                <Link
                  href={item.href}
                  className={
                    styles.actionButton
                  }
                  aria-label={`${item.ctaText}: ${item.title}`}
                  prefetch
                >

                  <span>
                    {item.ctaText}
                  </span>

                  <span
                    className={
                      styles.actionButtonIcon
                    }
                    aria-hidden="true"
                  >
                    →
                  </span>

                </Link>

              </div>

            </article>

          )
        )}

        {/* =====================================================
            FALLBACK
            ===================================================== */}

        {experienceItems.length === 0 && (

          <article
            className={
              styles.experienceCard
            }
          >

            <div
              className={
                styles.imageContainer
              }
            >

              <div
                className={
                  styles.cardImageFallback
                }
                aria-hidden="true"
              />

              <div
                className={
                  styles.cardGradientOverlay
                }
                aria-hidden="true"
              />

            </div>

            <div
              className={
                styles.cardContent
              }
            >

              <span
                className={
                  styles.categoryTag
                }
              >
                Cardápio Brasão
              </span>

              <h3
                className={
                  styles.cardTitle
                }
              >
                Sabores da casa.
              </h3>

              <p
                className={
                  styles.cardDescription
                }
              >
                Confira todos os produtos
                disponíveis no cardápio do
                Brasão Burger.
              </p>

              <Link
                href="/cardapio"
                className={
                  styles.actionButton
                }
                aria-label="Abrir cardápio do Brasão Burger"
                prefetch
              >

                <span>
                  Ver cardápio
                </span>

                <span
                  className={
                    styles.actionButtonIcon
                  }
                  aria-hidden="true"
                >
                  →
                </span>

              </Link>

            </div>

          </article>

        )}

      </div>

    </section>
  )
}