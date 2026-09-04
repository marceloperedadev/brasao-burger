
'use client'

import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import { useSearchParams } from 'next/navigation'

import { SITE_CONFIG } from '@/app/config/site'
import styles from './Cardapio.module.css'

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

type CartItem = {
  product: Product
  quantity: number
}

type Customer = {
  name: string
  phone: string
  address: string
  number: string
  complement: string
  neighborhood: string
  reference: string
}

type CustomerForm = Customer

type DeliveryMethod =
  | 'delivery'
  | 'pickup'

type PaymentMethod =
  | 'pix'
  | 'cash'
  | 'card'

type CheckoutStep =
  | 'cart'
  | 'customer'
  | 'payment'
  | 'confirmed'

type Props = {
  categories: Category[]
  products: Product[]
}

const EMPTY_CUSTOMER: CustomerForm = {
  name: '',
  phone: '',
  address: '',
  number: '',
  complement: '',
  neighborhood: '',
  reference: '',
}

function formatPrice(value: number) {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function formatPhone(value: string) {
  const digits = value
    .replace(/\D/g, '')
    .slice(0, 11)

  if (digits.length <= 2) {
    return digits
  }

  if (digits.length <= 7) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  }

  return `(${digits.slice(0, 2)}) ${digits.slice(
    2,
    7
  )}-${digits.slice(7)}`
}

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, '')
}

function formatChange(value: string) {
  const digits = value
    .replace(/\D/g, '')
    .slice(0, 7)

  if (!digits) {
    return ''
  }

  const numericValue = Number(digits)

  return numericValue.toLocaleString(
    'pt-BR',
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  )
}

function parseChange(value: string) {
  if (!value.trim()) {
    return 0
  }

  return Number(
    value
      .replace(/\./g, '')
      .replace(',', '.')
  )
}

export default function CardapioClient({
  categories,
  products,
}: Props) {
  const searchParams = useSearchParams()

  const [selectedCategory, setSelectedCategory] =
    useState<number | null>(
      categories[0]?.id ?? null
    )

  const [cart, setCart] =
    useState<CartItem[]>([])

  const [cartOpen, setCartOpen] =
    useState(false)

  const [productModal, setProductModal] =
    useState<Product | null>(null)

  const [checkoutStep, setCheckoutStep] =
    useState<CheckoutStep>('cart')

  const [customer, setCustomer] =
    useState<CustomerForm>(
      EMPTY_CUSTOMER
    )

  const [deliveryMethod, setDeliveryMethod] =
    useState<DeliveryMethod>('delivery')

  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>('pix')

  const [changeFor, setChangeFor] =
    useState('')

  const [customerError, setCustomerError] =
    useState('')

  const [loadingCustomer, setLoadingCustomer] =
    useState(false)

  const [savingCustomer, setSavingCustomer] =
    useState(false)

  const [customerFound, setCustomerFound] =
    useState(false)

  const selectedProducts = useMemo(() => {
    if (selectedCategory === null) {
      return products
    }

    return products.filter(
      (product) =>
        product.category_id === selectedCategory &&
        product.available
    )
  }, [
    products,
    selectedCategory,
  ])

  const cartQuantity = useMemo(
    () =>
      cart.reduce(
        (total, item) =>
          total + item.quantity,
        0
      ),
    [cart]
  )

  const cartTotal = useMemo(
    () =>
      cart.reduce(
        (total, item) =>
          total +
          item.product.price *
            item.quantity,
        0
      ),
    [cart]
  )

  const selectedProductId =
    searchParams.get('produto')

  useEffect(() => {
    if (!selectedProductId) {
      return
    }

    const product = products.find(
      (item) =>
        String(item.id) ===
        selectedProductId
    )

    if (product) {
      setProductModal(product)
    }
  }, [
    selectedProductId,
    products,
  ])

  function addToCart(product: Product) {
    if (!product.available) {
      return
    }

    setCart((currentCart) => {
      const existing = currentCart.find(
        (item) =>
          item.product.id === product.id
      )

      if (existing) {
        return currentCart.map((item) =>
          item.product.id === product.id
            ? {
                ...item,
                quantity:
                  item.quantity + 1,
              }
            : item
        )
      }

      return [
        ...currentCart,
        {
          product,
          quantity: 1,
        },
      ]
    })

    setCartOpen(true)
  }

  function increaseQuantity(
    productId: number
  ) {
    setCart((currentCart) =>
      currentCart.map((item) =>
        item.product.id === productId
          ? {
              ...item,
              quantity:
                item.quantity + 1,
            }
          : item
      )
    )
  }

  function decreaseQuantity(
    productId: number
  ) {
    setCart((currentCart) =>
      currentCart
        .map((item) =>
          item.product.id === productId
            ? {
                ...item,
                quantity:
                  item.quantity - 1,
              }
            : item
        )
        .filter(
          (item) =>
            item.quantity > 0
        )
    )
  }

  function removeFromCart(
    productId: number
  ) {
    setCart((currentCart) =>
      currentCart.filter(
        (item) =>
          item.product.id !== productId
      )
    )
  }

  function clearCart() {
    setCart([])
    setCheckoutStep('cart')
    setChangeFor('')
  }

  function updateCustomer(
    field: keyof CustomerForm,
    value: string
  ) {
    setCustomer((current) => ({
      ...current,
      [field]: value,
    }))

    setCustomerError('')
  }

  async function loadCustomer(
    phone: string
  ) {
    const normalized =
      normalizePhone(phone)

    if (normalized.length < 10) {
      setCustomerFound(false)
      return
    }

    setLoadingCustomer(true)
    setCustomerError('')

    try {
      const response = await fetch(
        `/api/customer?phone=${encodeURIComponent(
          normalized
        )}`,
        {
          method: 'GET',
          cache: 'no-store',
        }
      )

      if (!response.ok) {
        throw new Error(
          'Não foi possível consultar o cadastro.'
        )
      }

      const data =
        await response.json()

      if (data.customer) {
        setCustomer({
          name:
            data.customer.name ?? '',
          phone: formatPhone(
            data.customer.phone ??
              normalized
          ),
          address:
            data.customer.address ?? '',
          number:
            data.customer.number ?? '',
          complement:
            data.customer.complement ?? '',
          neighborhood:
            data.customer.neighborhood ??
            '',
          reference:
            data.customer.reference ?? '',
        })

        setCustomerFound(true)
      } else {
        setCustomerFound(false)
      }
    } catch {
      setCustomerFound(false)
    } finally {
      setLoadingCustomer(false)
    }
  }

  async function saveCustomer() {
    const normalizedPhone =
      normalizePhone(customer.phone)

    if (
      !customer.name.trim() ||
      normalizedPhone.length < 10 ||
      !customer.address.trim() ||
      !customer.number.trim() ||
      !customer.neighborhood.trim()
    ) {
      setCustomerError(
        'Preencha nome, telefone, endereço, número e bairro.'
      )

      return false
    }

    setSavingCustomer(true)
    setCustomerError('')

    try {
      const response = await fetch(
        '/api/customer',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            name: customer.name.trim(),
            phone: normalizedPhone,
            address:
              customer.address.trim(),
            number:
              customer.number.trim(),
            complement:
              customer.complement.trim(),
            neighborhood:
              customer.neighborhood.trim(),
            reference:
              customer.reference.trim(),
          }),
        }
      )

      const data =
        await response.json()

      if (!response.ok) {
        throw new Error(
          data?.error ||
            'Não foi possível salvar o cadastro.'
        )
      }

      if (data.customer) {
        setCustomer({
          name:
            data.customer.name ??
            customer.name,
          phone: formatPhone(
            data.customer.phone ??
              normalizedPhone
          ),
          address:
            data.customer.address ??
            customer.address,
          number:
            data.customer.number ??
            customer.number,
          complement:
            data.customer.complement ??
            customer.complement,
          neighborhood:
            data.customer.neighborhood ??
            customer.neighborhood,
          reference:
            data.customer.reference ??
            customer.reference,
        })
      }

      setCustomerFound(true)

      return true
    } catch (error) {
      setCustomerError(
        error instanceof Error
          ? error.message
          : 'Não foi possível salvar o cadastro.'
      )

      return false
    } finally {
      setSavingCustomer(false)
    }
  }

  async function continueToPayment() {
    const saved =
      await saveCustomer()

    if (!saved) {
      return
    }

    setCheckoutStep('payment')
  }

  function continueToConfirmation() {
    if (
      paymentMethod === 'cash' &&
      changeFor.trim()
    ) {
      const numericChange =
        parseChange(changeFor)

      if (
        !Number.isFinite(
          numericChange
        ) ||
        numericChange <= cartTotal
      ) {
        setCustomerError(
          `O valor para troco precisa ser maior que ${formatPrice(
            cartTotal
          )}.`
        )

        return
      }
    }

    setCustomerError('')
    setCheckoutStep('confirmed')
  }

  function backToCart() {
    setCheckoutStep('cart')
    setCustomerError('')
  }

  function backToCustomer() {
    setCheckoutStep('customer')
    setCustomerError('')
  }

  function startCheckout() {
    if (!cart.length) {
      return
    }

    setCustomerError('')
    setCheckoutStep('customer')
  }

  function startQuickOrder() {
    if (!cart.length) {
      return
    }

    setCustomerError('')
    setCheckoutStep('customer')
  }

  function formatPaymentMethod() {
    if (paymentMethod === 'pix') {
      return 'Pix'
    }

    if (paymentMethod === 'cash') {
      return 'Dinheiro'
    }

    return 'Cartão'
  }

  function formatDeliveryMethod() {
    if (deliveryMethod === 'pickup') {
      return 'Retirada no local'
    }

    return 'Entrega'
  }

  function buildWhatsAppMessage() {
    const lines: string[] = []

    lines.push(
      '*NOVO PEDIDO — BRASÃO BURGER*'
    )

    lines.push('')

    lines.push(
      '*ITENS DO PEDIDO*'
    )

    cart.forEach((item) => {
      const subtotal =
        item.product.price *
        item.quantity

      lines.push(
        `${item.quantity}x ${item.product.name} — ${formatPrice(
          subtotal
        )}`
      )
    })

    lines.push('')

    lines.push(
      `*TOTAL: ${formatPrice(
        cartTotal
      )}*`
    )

    lines.push('')

    lines.push(
      `*FORMA DE PAGAMENTO:* ${formatPaymentMethod()}`
    )

    if (
      paymentMethod === 'cash' &&
      changeFor
    ) {
      lines.push(
        `Troco para: R$ ${changeFor}`
      )

      const numericChange =
        parseChange(changeFor)

      const changeAmount =
        numericChange - cartTotal

      lines.push(
        `Troco: ${formatPrice(
          changeAmount
        )}`
      )
    }

    lines.push('')

    lines.push(
      `*MODALIDADE:* ${formatDeliveryMethod()}`
    )

    if (
      deliveryMethod === 'delivery'
    ) {
      lines.push('')

      lines.push(
        '*DADOS PARA ENTREGA*'
      )

      lines.push(
        `Nome: ${customer.name}`
      )

      lines.push(
        `Telefone: ${customer.phone}`
      )

      lines.push(
        `Endereço: ${customer.address}, ${customer.number}`
      )

      if (customer.complement) {
        lines.push(
          `Complemento: ${customer.complement}`
        )
      }

      lines.push(
        `Bairro: ${customer.neighborhood}`
      )

      if (customer.reference) {
        lines.push(
          `Referência: ${customer.reference}`
        )
      }
    } else {
      lines.push('')

      lines.push(
        `Nome: ${customer.name}`
      )

      lines.push(
        `Telefone: ${customer.phone}`
      )
    }

    return lines.join('\n')
  }

  function sendOrderToWhatsApp() {
    if (!cart.length) {
      return
    }

    const message =
      buildWhatsAppMessage()

    const url =
      `https://wa.me/${SITE_CONFIG.whatsapp.number}?text=${encodeURIComponent(
        message
      )}`

    window.open(
      url,
      '_blank',
      'noopener,noreferrer'
    )

    clearCart()
    setCartOpen(false)
  }

  function talkToSeller() {
    window.open(
      SITE_CONFIG.whatsapp.general,
      '_blank',
      'noopener,noreferrer'
    )
  }

  function handlePhoneBlur() {
    if (customer.phone) {
      loadCustomer(
        customer.phone
      )
    }
  }

  return (
    <main className={styles.page}>
      <section
        className={styles.menuSection}
        id="cardapio"
      >
        <div className={styles.menuHeader}>
          <span
            className={styles.menuEyebrow}
          >
            BRASÃO BURGER
          </span>

          <h1
            className={styles.menuTitle}
          >
            Cardápio
          </h1>

          <p
            className={
              styles.menuDescription
            }
          >
            Escolha seu burger,
            monte seu pedido e
            finalize pelo WhatsApp.
          </p>
        </div>

        <div
          className={
            styles.categoryNavigation
          }
          role="tablist"
          aria-label="Categorias do cardápio"
        >
          {categories.map(
            (category) => (
              <button
                key={category.id}
                type="button"
                role="tab"
                aria-selected={
                  selectedCategory ===
                  category.id
                }
                className={
                  selectedCategory ===
                  category.id
                    ? styles.categoryButtonActive
                    : styles.categoryButton
                }
                onClick={() =>
                  setSelectedCategory(
                    category.id
                  )
                }
              >
                {category.name}
              </button>
            )
          )}
        </div>

        <div
          className={styles.productGrid}
        >
          {selectedProducts.map(
            (product) => (
              <article
                key={product.id}
                className={
                  styles.productCard
                }
              >
                {product.image_url && (
                  <div
                    className={
                      styles.productImageWrapper
                    }
                  >
                    <img
                      src={
                        product.image_url
                      }
                      alt={
                        product.name
                      }
                      className={
                        styles.productImage
                      }
                    />
                  </div>
                )}

                <div
                  className={
                    styles.productContent
                  }
                >
                  {product.featured && (
                    <span
                      className={
                        styles.productFeatured
                      }
                    >
                      Destaque
                    </span>
                  )}

                  <h2
                    className={
                      styles.productName
                    }
                  >
                    {product.name}
                  </h2>

                  {product.description && (
                    <p
                      className={
                        styles.productDescription
                      }
                    >
                      {
                        product.description
                      }
                    </p>
                  )}

                  <div
                    className={
                      styles.productFooter
                    }
                  >
                    <strong
                      className={
                        styles.productPrice
                      }
                    >
                      {formatPrice(
                        product.price
                      )}
                    </strong>

                    <button
                      type="button"
                      className={
                        styles.productDetailsButton
                      }
                      onClick={() =>
                        setProductModal(
                          product
                        )
                      }
                    >
                      Detalhes
                    </button>
                  </div>

                  <button
                    type="button"
                    className={
                      styles.addButton
                    }
                    onClick={() =>
                      addToCart(product)
                    }
                  >
                    Adicionar ao pedido
                  </button>
                </div>
              </article>
            )
          )}
        </div>

        {!selectedProducts.length && (
          <div
            className={
              styles.emptyState
            }
          >
            <p>
              Nenhum produto disponível
              nesta categoria no
              momento.
            </p>
          </div>
        )}
      </section>

      {productModal && (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-label={
            productModal.name
          }
          onClick={() =>
            setProductModal(null)
          }
        >
          <div
            className={
              styles.productModal
            }
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <button
              type="button"
              className={
                styles.modalClose
              }
              aria-label="Fechar"
              onClick={() =>
                setProductModal(null)
              }
            >
              ×
            </button>

            {productModal.image_url && (
              <div
                className={
                  styles.modalImageWrapper
                }
              >
                <img
                  src={
                    productModal.image_url
                  }
                  alt={
                    productModal.name
                  }
                  className={
                    styles.modalImage
                  }
                />
              </div>
            )}

            <div
              className={
                styles.modalContent
              }
            >
              {productModal.featured && (
                <span
                  className={
                    styles.productFeatured
                  }
                >
                  Destaque
                </span>
              )}

              <h2
                className={
                  styles.modalTitle
                }
              >
                {productModal.name}
              </h2>

              {productModal.description && (
                <p
                  className={
                    styles.modalDescription
                  }
                >
                  {
                    productModal.description
                  }
                </p>
              )}

              <strong
                className={
                  styles.modalPrice
                }
              >
                {formatPrice(
                  productModal.price
                )}
              </strong>

              <button
                type="button"
                className={
                  styles.addButton
                }
                onClick={() => {
                  addToCart(
                    productModal
                  )

                  setProductModal(
                    null
                  )
                }}
              >
                Adicionar ao pedido
              </button>
            </div>
          </div>
        </div>
      )}

      {cartOpen && (
        <div
          className={
            styles.cartOverlay
          }
          role="dialog"
          aria-modal="true"
          onClick={() =>
            setCartOpen(false)
          }
        >
          <aside
            className={
              styles.cartPanel
            }
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div
              className={
                styles.cartHeader
              }
            >
              <div>
                <span
                  className={
                    styles.cartEyebrow
                  }
                >
                  SEU PEDIDO
                </span>

                <h2
                  className={
                    styles.cartTitle
                  }
                >
                  Carrinho
                </h2>
              </div>

              <button
                type="button"
                className={
                  styles.modalClose
                }
                aria-label="Fechar carrinho"
                onClick={() =>
                  setCartOpen(false)
                }
              >
                ×
              </button>
            </div>

            {!cart.length ? (
              <div
                className={
                  styles.emptyCart
                }
              >
                <p>
                  Seu carrinho está
                  vazio.
                </p>

                <button
                  type="button"
                  className={
                    styles.addButton
                  }
                  onClick={() =>
                    setCartOpen(false)
                  }
                >
                  Ver cardápio
                </button>
              </div>
            ) : (
              <>
                <div
                  className={
                    styles.cartItems
                  }
                >
                  {cart.map(
                    (item) => (
                      <div
                        key={
                          item.product.id
                        }
                        className={
                          styles.cartItem
                        }
                      >
                        <div
                          className={
                            styles.cartItemInfo
                          }
                        >
                          <h3>
                            {
                              item.product
                                .name
                            }
                          </h3>

                          <strong>
                            {formatPrice(
                              item.product
                                .price *
                                item.quantity
                            )}
                          </strong>
                        </div>

                        <div
                          className={
                            styles.quantityControls
                          }
                        >
                          <button
                            type="button"
                            onClick={() =>
                              decreaseQuantity(
                                item.product
                                  .id
                              )
                            }
                            aria-label="Diminuir quantidade"
                          >
                            −
                          </button>

                          <span>
                            {
                              item.quantity
                            }
                          </span>

                          <button
                            type="button"
                            onClick={() =>
                              increaseQuantity(
                                item.product
                                  .id
                              )
                            }
                            aria-label="Aumentar quantidade"
                          >
                            +
                          </button>
                        </div>

                        <button
                          type="button"
                          className={
                            styles.removeButton
                          }
                          onClick={() =>
                            removeFromCart(
                              item.product
                                .id
                            )
                          }
                        >
                          Remover
                        </button>
                      </div>
                    )
                  )}
                </div>

                <div
                  className={
                    styles.cartSummary
                  }
                >
                  <span>
                    {cartQuantity}{' '}
                    {cartQuantity ===
                    1
                      ? 'item'
                      : 'itens'}
                  </span>

                  <strong>
                    {formatPrice(
                      cartTotal
                    )}
                  </strong>
                </div>

                <button
                  type="button"
                  className={
                    styles.checkoutButton
                  }
                  onClick={
                    startCheckout
                  }
                >
                  Finalizar pedido
                </button>

                <button
                  type="button"
                  className={
                    styles.secondaryButton
                  }
                  onClick={
                    startQuickOrder
                  }
                >
                  Pedido rápido
                </button>

                <button
                  type="button"
                  className={
                    styles.linkButton
                  }
                  onClick={
                    talkToSeller
                  }
                >
                  Falar com o vendedor
                </button>
              </>
            )}

            {checkoutStep ===
              'customer' && (
              <div
                className={
                  styles.checkoutSection
                }
              >
                <div
                  className={
                    styles.checkoutHeader
                  }
                >
                  <span>01</span>

                  <h2>
                    Seus dados
                  </h2>
                </div>

                <label
                  className={
                    styles.customerField
                  }
                >
                  <span>
                    Telefone
                  </span>

                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="(12) 99999-9999"
                    value={
                      customer.phone
                    }
                    onChange={(event) =>
                      updateCustomer(
                        'phone',
                        formatPhone(
                          event.target
                            .value
                        )
                      )
                    }
                    onBlur={
                      handlePhoneBlur
                    }
                  />

                  {loadingCustomer && (
                    <small>
                      Consultando
                      cadastro...
                    </small>
                  )}

                  {customerFound &&
                    !loadingCustomer && (
                      <small>
                        Cadastro
                        encontrado.
                      </small>
                    )}
                </label>

                <label
                  className={
                    styles.customerField
                  }
                >
                  <span>
                    Nome
                  </span>

                  <input
                    type="text"
                    autoComplete="name"
                    placeholder="Seu nome"
                    value={
                      customer.name
                    }
                    onChange={(event) =>
                      updateCustomer(
                        'name',
                        event.target
                          .value
                      )
                    }
                  />
                </label>

                {deliveryMethod ===
                  'delivery' && (
                  <>
                    <label
                      className={
                        styles.customerField
                      }
                    >
                      <span>
                        Endereço
                      </span>

                      <input
                        type="text"
                        autoComplete="street-address"
                        placeholder="Rua / Avenida"
                        value={
                          customer.address
                        }
                        onChange={(event) =>
                          updateCustomer(
                            'address',
                            event.target
                              .value
                          )
                        }
                      />
                    </label>

                    <div
                      className={
                        styles.customerFieldsRow
                      }
                    >
                      <label
                        className={
                          styles.customerField
                        }
                      >
                        <span>
                          Número
                        </span>

                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="123"
                          value={
                            customer.number
                          }
                          onChange={(
                            event
                          ) =>
                            updateCustomer(
                              'number',
                              event.target
                                .value
                            )
                          }
                        />
                      </label>

                      <label
                        className={
                          styles.customerField
                        }
                      >
                        <span>
                          Complemento
                          <small>
                            opcional
                          </small>
                        </span>

                        <input
                          type="text"
                          placeholder="Apto, casa..."
                          value={
                            customer.complement
                          }
                          onChange={(
                            event
                          ) =>
                            updateCustomer(
                              'complement',
                              event.target
                                .value
                            )
                          }
                        />
                      </label>
                    </div>

                    <label
                      className={
                        styles.customerField
                      }
                    >
                      <span>
                        Bairro
                      </span>

                      <input
                        type="text"
                        autoComplete="address-level2"
                        placeholder="Seu bairro"
                        value={
                          customer.neighborhood
                        }
                        onChange={(event) =>
                          updateCustomer(
                            'neighborhood',
                            event.target
                              .value
                          )
                        }
                      />
                    </label>

                    <label
                      className={
                        styles.customerField
                      }
                    >
                      <span>
                        Referência
                        <small>
                          opcional
                        </small>
                      </span>

                      <input
                        type="text"
                        placeholder="Perto de..."
                        value={
                          customer.reference
                        }
                        onChange={(event) =>
                          updateCustomer(
                            'reference',
                            event.target
                              .value
                          )
                        }
                      />
                    </label>
                  </>
                )}

                <div
                  className={
                    styles.deliveryOptions
                  }
                >
                  <button
                    type="button"
                    className={
                      deliveryMethod ===
                      'delivery'
                        ? styles.deliveryOptionActive
                        : styles.deliveryOption
                    }
                    onClick={() =>
                      setDeliveryMethod(
                        'delivery'
                      )
                    }
                  >
                    <strong>
                      Entrega
                    </strong>

                    <span>
                      Receba em seu
                      endereço
                    </span>
                  </button>

                  <button
                    type="button"
                    className={
                      deliveryMethod ===
                      'pickup'
                        ? styles.deliveryOptionActive
                        : styles.deliveryOption
                    }
                    onClick={() =>
                      setDeliveryMethod(
                        'pickup'
                      )
                    }
                  >
                    <strong>
                      Retirada
                    </strong>

                    <span>
                      Retire no
                      Brasão Burger
                    </span>
                  </button>
                </div>

                {customerError && (
                  <p
                    className={
                      styles.errorMessage
                    }
                  >
                    {
                      customerError
                    }
                  </p>
                )}

                <button
                  type="button"
                  className={
                    styles.checkoutButton
                  }
                  disabled={
                    savingCustomer
                  }
                  onClick={
                    continueToPayment
                  }
                >
                  {savingCustomer
                    ? 'Salvando...'
                    : 'Continuar'}
                </button>

                <button
                  type="button"
                  className={
                    styles.linkButton
                  }
                  onClick={
                    backToCart
                  }
                >
                  Voltar ao carrinho
                </button>
              </div>
            )}

            {checkoutStep ===
              'payment' && (
              <div
                className={
                  styles.checkoutSection
                }
              >
                <div
                  className={
                    styles.checkoutHeader
                  }
                >
                  <span>02</span>

                  <h2>
                    Pagamento
                  </h2>
                </div>

                <div
                  className={
                    styles.paymentOptions
                  }
                >
                  <button
                    type="button"
                    className={
                      paymentMethod ===
                      'pix'
                        ? styles.paymentOptionActive
                        : styles.paymentOption
                    }
                    onClick={() =>
                      setPaymentMethod(
                        'pix'
                      )
                    }
                  >
                    <strong>
                      Pix
                    </strong>

                    <span>
                      Pagamento via
                      Pix
                    </span>
                  </button>

                  <button
                    type="button"
                    className={
                      paymentMethod ===
                      'cash'
                        ? styles.paymentOptionActive
                        : styles.paymentOption
                    }
                    onClick={() =>
                      setPaymentMethod(
                        'cash'
                      )
                    }
                  >
                    <strong>
                      Dinheiro
                    </strong>

                    <span>
                      Pagamento em
                      dinheiro
                    </span>
                  </button>

                  <button
                    type="button"
                    className={
                      paymentMethod ===
                      'card'
                        ? styles.paymentOptionActive
                        : styles.paymentOption
                    }
                    onClick={() =>
                      setPaymentMethod(
                        'card'
                      )
                    }
                  >
                    <strong>
                      Cartão
                    </strong>

                    <span>
                      Crédito ou
                      débito
                    </span>
                  </button>
                </div>

                {paymentMethod ===
                  'cash' && (
                  <label
                    className={
                      styles.customerField
                    }
                  >
                    <span>
                      Troco para
                      <small>
                        opcional
                      </small>
                    </span>

                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="Ex.: 100,00"
                      value={
                        changeFor
                      }
                      onChange={(event) =>
                        setChangeFor(
                          formatChange(
                            event.target
                              .value
                          )
                        )
                      }
                    />

                    <small>
                      Pedido:{' '}
                      {formatPrice(
                        cartTotal
                      )}
                    </small>
                  </label>
                )}

                {customerError && (
                  <p
                    className={
                      styles.errorMessage
                    }
                  >
                    {
                      customerError
                    }
                  </p>
                )}

                <button
                  type="button"
                  className={
                    styles.checkoutButton
                  }
                  onClick={
                    continueToConfirmation
                  }
                >
                  Revisar pedido
                </button>

                <button
                  type="button"
                  className={
                    styles.linkButton
                  }
                  onClick={
                    backToCustomer
                  }
                >
                  Voltar aos dados
                </button>
              </div>
            )}

            {checkoutStep ===
              'confirmed' && (
              <div
                className={
                  styles.checkoutSection
                }
              >
                <div
                  className={
                    styles.checkoutHeader
                  }
                >
                  <span>03</span>

                  <h2>
                    Confirmar pedido
                  </h2>
                </div>

                <div
                  className={
                    styles.confirmationSummary
                  }
                >
                  <div>
                    <span>
                      Itens
                    </span>

                    <strong>
                      {cartQuantity}
                    </strong>
                  </div>

                  <div>
                    <span>
                      Total
                    </span>

                    <strong>
                      {formatPrice(
                        cartTotal
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>
                      Pagamento
                    </span>

                    <strong>
                      {
                        formatPaymentMethod()
                      }
                    </strong>
                  </div>

                  <div>
                    <span>
                      Modalidade
                    </span>

                    <strong>
                      {
                        formatDeliveryMethod()
                      }
                    </strong>
                  </div>

                  {deliveryMethod ===
                    'delivery' && (
                    <div>
                      <span>
                        Entrega
                      </span>

                      <strong>
                        {
                          customer.address
                        }
                        ,{' '}
                        {
                          customer.number
                        }
                      </strong>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className={
                    styles.checkoutButton
                  }
                  onClick={
                    sendOrderToWhatsApp
                  }
                >
                  Enviar pedido pelo
                  WhatsApp
                </button>

                <button
                  type="button"
                  className={
                    styles.linkButton
                  }
                  onClick={() =>
                    setCheckoutStep(
                      'payment'
                    )
                  }
                >
                  Voltar ao pagamento
                </button>
              </div>
            )}
          </aside>
        </div>
      )}

      {!cartOpen &&
        cart.length > 0 && (
          <button
            type="button"
            className={
              styles.floatingCart
            }
            onClick={() =>
              setCartOpen(true)
            }
            aria-label="Abrir carrinho"
          >
            <span>
              {cartQuantity}
            </span>

            <strong>
              Ver pedido
            </strong>

            <b>
              {formatPrice(
                cartTotal
              )}
            </b>
          </button>
        )}
    </main>
  )
}
