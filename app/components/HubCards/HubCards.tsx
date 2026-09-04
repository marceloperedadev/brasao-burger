
'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'

import styles from './HubCards.module.css'

type Category = {
  id: number
  name: string
  slug: string
  sort_order: number
}

type Product = {
  id: number
  category_id: number
  name: string
  description: string | null
  price: number
  image_url: string | null
  featured: boolean
  available: boolean
  sort_order: number
}

type Props = {
  categories?: Category[]
  products?: Product[]
}

const INSTAGRAM_URL =
  'https://www.instagram.com/brasao.burger/'

export function HubCards({
  categories = [],
  products = [],
}: Props) {
  const [shareMessage, setShareMessage] =
    useState('')

  /* =========================================================
     MESMA LÓGICA DA GALLERY
     =========================================================

     A Gallery seleciona:

     - categorias com produtos disponíveis
     - respeitando sort_order
     - máximo de 4 categorias

     Aqui repetimos essa seleção somente para
     descobrir quais produtos a Gallery utiliza.

     O objetivo NÃO é renderizar a Gallery novamente.
     ========================================================= */

  const galleryCategories = [...categories]
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

  /* =========================================================
     PRODUTOS UTILIZADOS PELA GALLERY
     =========================================================

     A Gallery escolhe um produto representativo
     de cada categoria.

     Critérios exatamente iguais:

     1. disponível
     2. featured primeiro
     3. sort_order
     ========================================================= */

  function getGalleryRepresentativeProduct(
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

  /* =========================================================
     IDs DOS PRODUTOS QUE JÁ APARECEM NA GALLERY
     ========================================================= */

  const galleryProductIds =
    new Set(
      galleryCategories
        .map(
          (category) =>
            getGalleryRepresentativeProduct(
              category.id
            )?.id
        )
        .filter(
          (
            id
          ): id is number =>
            id !== undefined
        )
    )

  /* =========================================================
     3 OUTROS PRODUTOS DO BANCO
     =========================================================

     Agora excluímos explicitamente os produtos
     que a Gallery já está utilizando.

     Não existe escolha aleatória.

     Ordem:

     1. disponível
     2. featured
     3. sort_order
     4. ID como critério final de estabilidade
     ========================================================= */

  const showcaseProducts = [
    ...products,
  ]
    .filter(
      (product) =>
        product.available &&
        !galleryProductIds.has(
          product.id
        )
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

      const sortDifference =
        a.sort_order -
        b.sort_order

      if (
        sortDifference !== 0
      ) {
        return sortDifference
      }

      return a.id - b.id
    })
    .slice(0, 3)

  /* =========================================================
     CATEGORIA REAL DO PRODUTO
     ========================================================= */

  function getCategory(
    categoryId: number
  ): Category | null {
    return (
      categories.find(
        (category) =>
          category.id ===
          categoryId
      ) ?? null
    )
  }

  /* =========================================================
     PREÇO
     ========================================================= */

  function formatPrice(
    price: number
  ) {
    return new Intl.NumberFormat(
      'pt-BR',
      {
        style: 'currency',
        currency: 'BRL',
      }
    ).format(price)
  }

  /* =========================================================
     URL DO CARDÁPIO
     ========================================================= */

  function getMenuUrl() {
    if (
      typeof window ===
      'undefined'
    ) {
      return '/cardapio'
    }

    return `${window.location.origin}/cardapio`
  }

  /* =========================================================
     COPIAR LINK
     ========================================================= */

  async function copyToClipboard(
    text: string
  ) {
    if (
      typeof navigator !==
        'undefined' &&
      navigator.clipboard?.writeText
    ) {
      await navigator.clipboard.writeText(
        text
      )

      return
    }

    const textarea =
      document.createElement(
        'textarea'
      )

    textarea.value = text

    textarea.setAttribute(
      'readonly',
      ''
    )

    textarea.style.position =
      'fixed'

    textarea.style.opacity =
      '0'

    textarea.style.pointerEvents =
      'none'

    document.body.appendChild(
      textarea
    )

    textarea.select()

    document.execCommand('copy')

    textarea.remove()
  }

  /* =========================================================
     FEEDBACK
     ========================================================= */

  function showShareMessage(
    message: string
  ) {
    setShareMessage(message)

    window.setTimeout(() => {
      setShareMessage('')
    }, 2800)
  }

  /* =========================================================
     COMPARTILHAR CARDÁPIO
     ========================================================= */

  async function shareMenu() {
    const url =
      getMenuUrl()

    const shareData = {
      title:
        'Brasão Burger',

      text:
        'Confira o cardápio do Brasão Burger em Taubaté.',

      url,
    }

    try {
      if (
        typeof navigator !==
          'undefined' &&
        navigator.share
      ) {
        await navigator.share(
          shareData
        )

        showShareMessage(
          'Cardápio compartilhado.'
        )

        return
      }

      await copyToClipboard(
        url
      )

      showShareMessage(
        'Link do cardápio copiado.'
      )
    } catch (error) {
      if (
        error instanceof
          DOMException &&
        error.name ===
          'AbortError'
      ) {
        return
      }

      showShareMessage(
        'Não foi possível compartilhar agora.'
      )
    }
  }

  /* =========================================================
     CONVIDAR PELO WHATSAPP
     ========================================================= */

  function inviteSomeone() {
    const url =
      getMenuUrl()

    const message =
      encodeURIComponent(
        `Bora comer no Brasão Burger? 🍔🔥\n\nConfira o cardápio:\n${url}`
      )

    window.open(
      `https://wa.me/?text=${message}`,
      '_blank',
      'noopener,noreferrer'
    )
  }

  const hasProducts =
    showcaseProducts.length >
    0

  return (
    <section
      className={
        styles.hubSection
      }
      aria-labelledby="hub-title"
    >
      {/* =====================================================
          FUNDO
          ===================================================== */}

      <div
        className={
          styles.backgroundGlow
        }
        aria-hidden="true"
      />

      <div
        className={
          styles.backgroundGrid
        }
        aria-hidden="true"
      />

      <div
        className={
          styles.hubContainer
        }
      >
        {/* ===================================================
            CABEÇALHO
            =================================================== */}

        <header
          className={
            styles.sectionHeader
          }
        >
          <span
            className={
              styles.eyebrow
            }
          >
            <span
              className={
                styles.eyebrowLine
              }
              aria-hidden="true"
            />

            Escolhas do Brasão

            <span
              className={
                styles.eyebrowLine
              }
              aria-hidden="true"
            />
          </span>

          <h2
            id="hub-title"
            className={
              styles.sectionTitle
            }
          >
            O difícil é
            <br />
            <em>
              escolher um só.
            </em>
          </h2>

          <p
            className={
              styles.sectionDescription
            }
          >
            Outras escolhas da casa
            para você descobrir
            novos sabores do Brasão.
          </p>
        </header>

        {/* ===================================================
            3 PRODUTOS DIFERENTES DA GALLERY
            =================================================== */}

        {hasProducts ? (
          <div
            className={
              styles.cardsGrid
            }
          >
            {showcaseProducts.map(
              (
                product,
                index
              ) => {
                const category =
                  getCategory(
                    product.category_id
                  )

                /*
                 * O produto sempre aponta para
                 * a categoria REAL dele.
                 */

                const categoryHref =
                  category
                    ? `/cardapio?categoria=${encodeURIComponent(
                        category.slug
                      )}`
                    : '/cardapio'

                return (
                  <article
                    key={
                      product.id
                    }
                    className={
                      styles.cardItem
                    }
                  >
                    {/* =======================================
                        IMAGEM DO BANCO
                        ======================================= */}

                    <div
                      className={
                        styles.cardImageWrapper
                      }
                    >
                      {product.image_url ? (
                        <Image
                          src={
                            product.image_url
                          }
                          alt={
                            product.name
                          }
                          fill
                          priority={
                            index ===
                            0
                          }
                          sizes="(max-width: 639px) calc(100vw - 32px), (max-width: 1023px) calc(50vw - 28px), 400px"
                          className={
                            styles.cardImage
                          }
                          quality={
                            88
                          }
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
                          styles.imageOverlay
                        }
                        aria-hidden="true"
                      />

                      <span
                        className={
                          styles.cardNumber
                        }
                        aria-hidden="true"
                      >
                        {String(
                          index + 1
                        ).padStart(
                          2,
                          '0'
                        )}
                      </span>

                      <span
                        className={
                          styles.featureBadge
                        }
                      >
                        {product.featured
                          ? 'Favorito'
                          : 'Escolha da casa'}
                      </span>
                    </div>

                    {/* =======================================
                        DADOS DO PRODUTO
                        ======================================= */}

                    <div
                      className={
                        styles.cardContent
                      }
                    >
                      <span
                        className={
                          styles.cardEyebrow
                        }
                      >
                        {category?.name ??
                          'Cardápio Brasão'}
                      </span>

                      <h3
                        className={
                          styles.cardTitle
                        }
                      >
                        {
                          product.name
                        }
                      </h3>

                      <p
                        className={
                          styles.cardDescription
                        }
                      >
                        {product.description ??
                          'Uma escolha especial da casa para você conhecer o Brasão Burger.'}
                      </p>

                      <div
                        className={
                          styles.cardBottom
                        }
                      >
                        <span
                          className={
                            styles.cardPrice
                          }
                        >
                          {formatPrice(
                            product.price
                          )}
                        </span>

                        <Link
                          href={
                            categoryHref
                          }
                          className={
                            styles.cardLink
                          }
                          aria-label={`Ver ${product.name} no cardápio`}
                          prefetch
                        >
                          <span>
                            Ver no cardápio
                          </span>

                          <span
                            className={
                              styles.cardArrow
                            }
                            aria-hidden="true"
                          >
                            →
                          </span>
                        </Link>
                      </div>
                    </div>
                  </article>
                )
              }
            )}
          </div>
        ) : (
          /* =================================================
             FALLBACK
             ================================================= */

          <div
            className={
              styles.emptyState
            }
            aria-live="polite"
          >
            <span>
              Confira nosso
              cardápio.
            </span>

            <Link
              href="/cardapio"
              className={
                styles.emptyLink
              }
              aria-label="Abrir cardápio do Brasão Burger"
              prefetch
            >
              <span>
                Ver cardápio
              </span>

              <span
                aria-hidden="true"
              >
                →
              </span>
            </Link>
          </div>
        )}

        {/* ===================================================
            COMPARTILHAMENTO
            =================================================== */}

        <div
          className={
            styles.shareSection
          }
        >
          <div
            className={
              styles.shareIntro
            }
          >
            <span
              className={
                styles.shareEyebrow
              }
            >
              Para compartilhar

              <span
                className={
                  styles.shareEyebrowDot
                }
                aria-hidden="true"
              />
            </span>

            <h3
              className={
                styles.shareTitle
              }
            >
              Vai sozinho?
              <br />

              <em>
                Melhor ainda
                acompanhado.
              </em>
            </h3>

            <p
              className={
                styles.shareDescription
              }
            >
              Mande o cardápio
              para aquela pessoa
              que você sabe que
              toparia um burger
              agora.
            </p>
          </div>

          <div
            className={
              styles.shareActions
            }
          >
            <button
              type="button"
              className={
                styles.sharePrimary
              }
              onClick={
                shareMenu
              }
            >
              <span>
                Compartilhar
                cardápio
              </span>

              <span
                className={
                  styles.shareArrow
                }
                aria-hidden="true"
              >
                ↗
              </span>
            </button>

            <button
              type="button"
              className={
                styles.shareSecondary
              }
              onClick={
                inviteSomeone
              }
            >
              <span>
                Convidar alguém
              </span>

              <span
                className={
                  styles.shareArrow
                }
                aria-hidden="true"
              >
                →
              </span>
            </button>

            <a
              href={
                INSTAGRAM_URL
              }
              target="_blank"
              rel="noopener noreferrer"
              className={
                styles.instagramLink
              }
              aria-label="Visitar o Instagram do Brasão Burger"
            >
              <span>
                Instagram
              </span>

              <span
                className={
                  styles.instagramArrow
                }
                aria-hidden="true"
              >
                ↗
              </span>
            </a>
          </div>

          {shareMessage && (
            <p
              className={
                styles.shareFeedback
              }
              role="status"
              aria-live="polite"
            >
              {
                shareMessage
              }
            </p>
          )}
        </div>

        {/* ===================================================
            ASSINATURA
            =================================================== */}

        <div
          className={
            styles.bottomHint
          }
        >
          <span
            className={
              styles.bottomLine
            }
            aria-hidden="true"
          />

          <span
            className={
              styles.bottomText
            }
          >
            O verdadeiro
            hambúrguer na
            parrilla em Taubaté.
          </span>

          <span
            className={
              styles.bottomLine
            }
            aria-hidden="true"
          />
        </div>
      </div>
    </section>
  )
}
