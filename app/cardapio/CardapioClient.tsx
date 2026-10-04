'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'

import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { SITE_CONFIG } from '@/app/config/site'
import { calculateOrderTotal, resolveDeliveryQuote, type DeliveryConfig } from '@/lib/delivery-zones'
import { supabase } from '@/lib/supabase'
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

const MAX_ITEM_QUANTITY = 999

function isStoredCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  if (!Number.isInteger(item.quantity) || Number(item.quantity) < 1 || Number(item.quantity) > MAX_ITEM_QUANTITY) return false
  if (!item.product || typeof item.product !== 'object' || Array.isArray(item.product)) return false

  const product = item.product as Record<string, unknown>
  return Number.isSafeInteger(product.id) && Number(product.id) > 0 &&
    Number.isSafeInteger(product.category_id) && typeof product.name === 'string' &&
    (product.description === null || typeof product.description === 'string') &&
    Number.isFinite(Number(product.price)) && Number(product.price) >= 0 &&
    (product.image_url === null || typeof product.image_url === 'string') &&
    typeof product.featured === 'boolean' && typeof product.available === 'boolean' &&
    Number.isSafeInteger(product.sort_order)
}

type PersistedOrder = {
  id: string
  name: string
  phone: string
  deliveryMethod: DeliveryMethod
  address: string | null
  number: string | null
  complement: string | null
  neighborhood: string | null
  zipCode: string | null
  reference: string | null
  paymentMethod: PaymentMethod
  changeFor: number | null
  subtotal: number
  deliveryFee: number
  total: number
  deliveryZone?: string | null
  items: Array<{ productId: number; name: string; quantity: number; unitPrice: number; lineTotal: number }>
}

type Customer = {
  user_id: string
  name: string
  phone: string
  address: string | null
  number: string | null
  complement: string | null
  neighborhood: string | null
  zip_code: string | null
  city: string | null
  state: string | null
  reference: string | null
}

function isPersistedCustomer(value: unknown, userId: string): value is Customer {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const customer = value as Record<string, unknown>
  return customer.user_id === userId &&
    typeof customer.name === 'string' && customer.name.trim().length > 0 &&
    typeof customer.phone === 'string' && /^\d{10,11}$/.test(customer.phone)
}

type CustomerForm = {
  name: string
  phone: string
  address: string
  number: string
  complement: string
  neighborhood: string
  zipCode: string
  city: string
  state: string
  reference: string
}

type DeliveryMethod =
  | 'delivery'
  | 'pickup'

type PaymentMethod =
  | 'pix'
  | 'cash'
  | 'card'

type CheckoutStep =
  | 'cart'
  | 'phone'
  | 'customer'
  | 'delivery'
  | 'payment'
  | 'confirmed'

function paymentMethodFromConfig(
  id: string
): PaymentMethod | null {
  if (id === 'pix') return 'pix'
  if (id === 'dinheiro') return 'cash'
  if (id === 'cartao') return 'card'
  return null
}

function getDefaultPaymentMethod(): PaymentMethod {
  for (const method of SITE_CONFIG.payment.accepted) {
    const value = paymentMethodFromConfig(method.id)
    if (value) return value
  }
  return 'cash'
}

type PaymentOption = {
  id: PaymentMethod
  icon: string
  label: string
  description: string
}

const PAYMENT_OPTION_DETAILS: Record<
  PaymentMethod,
  Omit<PaymentOption, 'id' | 'label'>
> = {
  pix: {
    icon: '◈',
    description: 'Pagamento via Pix',
  },

  cash: {
    icon: 'R$',
    description: 'Pague na entrega ou retirada',
  },

  card: {
    icon: '▣',
    description: 'Crédito ou débito',
  },
}

/*
 * As opções do checkout derivam de SITE_CONFIG.payment.accepted: a mesma
 * lista define a ordem exibida, a opção já selecionada e a validação feita
 * pela API. Um meio de pagamento só aparece para o cliente (e só é aceito no
 * pedido) quando estiver cadastrado nessa configuração.
 */
const ACCEPTED_PAYMENT_OPTIONS: PaymentOption[] =
  SITE_CONFIG.payment.accepted
    .map((method): PaymentOption | null => {
      const id = paymentMethodFromConfig(method.id)
      return id
        ? {
            id,
            label: method.label,
            ...PAYMENT_OPTION_DETAILS[id],
          }
        : null
    })
    .filter((option): option is PaymentOption => option !== null)

/*
 * A API de pedidos responde com mensagens técnicas em inglês. As mensagens
 * conhecidas são traduzidas e qualquer texto não previsto cai em uma mensagem
 * genérica em português, para o cliente nunca receber erro em inglês.
 */
const ORDER_ERROR_MESSAGES: Record<string, string> = {
  'Request is too large.':
    'O pedido ficou grande demais para ser enviado. Atualize a página e tente novamente.',
  'Invalid content type.':
    'Não foi possível enviar o pedido. Atualize a página e tente novamente.',
  'Invalid request body.':
    'Não foi possível ler os dados do pedido. Revise as informações e tente novamente.',
  'Review the order details and try again.':
    'Revise os dados do pedido e tente novamente.',
  'Enter a valid name and WhatsApp number.':
    'Confira o nome e o WhatsApp informados.',
  'This payment method is unavailable.':
    'A forma de pagamento escolhida não está disponível. Selecione outra opção.',
  'Complete the delivery address and CEP.':
    'Complete o endereço de entrega e o CEP.',
  'Enter a valid CEP.': 'Informe um CEP válido.',
  'Your session expired. Sign in again or continue as a guest.':
    'Sua sessão expirou. Entre novamente ou continue como visitante.',
  'Could not validate your session.':
    'Não foi possível validar sua sessão. Tente novamente.',
  'Could not validate the delivery ZIP code. Try again.':
    'Não foi possível validar o CEP de entrega. Tente novamente.',
  'Enter a valid delivery ZIP code.': 'Informe um CEP de entrega válido.',
  'Delivery is currently unavailable.': 'A entrega está indisponível no momento.',
  'We could not identify a delivery zone for this address.':
    'Não encontramos uma zona de entrega para este endereço.',
  'This delivery address requires manual confirmation.':
    'Este endereço precisa de confirmação manual da loja.',
  'Delivery zones have not been configured yet.':
    'As zonas de entrega ainda não foram configuradas.',
  'Delivery zones need to be reviewed before this address can be served.':
    'A configuração de entrega precisa ser revisada antes de atender este endereço.',
  'Delivery configuration is invalid or unavailable.':
    'A configuração de entrega está inválida ou indisponível.',
  'Could not validate delivery right now. Try again.':
    'Não foi possível validar a entrega agora. Tente novamente.',
  'Enter a valid change amount.': 'Informe um valor de troco válido.',
  'The change amount must be greater than the order total.':
    'O valor para troco precisa ser maior que o total do pedido.',
  'This checkout attempt no longer matches the saved order. Refresh your order and try again.':
    'Este pedido não corresponde mais ao que foi salvo. Atualize a página e tente novamente.',
  'An item in your order is unavailable. Refresh the menu and try again.':
    'Um item do pedido ficou indisponível. Atualize o cardápio e tente novamente.',
  'The order could not be saved. Please retry before opening WhatsApp.':
    'Não foi possível salvar o pedido. Tente novamente antes de abrir o WhatsApp.',
}

const DELIVERY_AREA_PREFIX = 'Delivery is limited to '

function translateOrderError(message: string) {
  const knownMessage = ORDER_ERROR_MESSAGES[message]
  if (knownMessage) return knownMessage
  if (message.startsWith(DELIVERY_AREA_PREFIX)) {
    return `No momento entregamos apenas em ${message
      .slice(DELIVERY_AREA_PREFIX.length)
      .replace(/\.$/, '')}.`
  }
  return 'Não foi possível salvar o pedido. Tente novamente antes de abrir o WhatsApp.'
}
/*
 * =========================================================
 * ETAPAS DO CHECKOUT (PARA O INDICADOR DE PROGRESSO)
 * =========================================================
 *
 * 'cart' e 'confirmed' não entram aqui: a primeira é o
 * carrinho (ainda não é checkout) e a segunda é a tela
 * de sucesso (não faz sentido mostrar "etapa 5 de 4").
 */

const CHECKOUT_FLOW_STEPS: CheckoutStep[] = [
  'phone',
  'delivery',
  'customer',
  'payment',
]

/*
 * =========================================================
 * STATUS DO HORÁRIO DE HOJE
 * =========================================================
 *
 * Calculada no cliente para usar o relógio local e evitar
 * divergências de hidratação. O snapshot do servidor começa
 * vazio; no navegador é atualizado na montagem e a cada minuto.
 */

const WEEKDAY_KEYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const

type HoursStatus = {
  isOpen: boolean
  label: string
}

function subscribeToMinute(callback: () => void) {
  const timer = window.setInterval(callback, 60_000)
  return () => window.clearInterval(timer)
}

function getHoursSnapshot() {
  const status = getTodayHoursStatus()
  return `${status.isOpen ? '1' : '0'}|${status.label}`
}

function getTodayHoursStatus(): HoursStatus {
  const now = new Date()
  const nowMinutes =
    now.getHours() * 60 +
    now.getMinutes()
  const todayIndex = now.getDay()
  const today = SITE_CONFIG.openingHours[WEEKDAY_KEYS[todayIndex]]
  const previous = SITE_CONFIG.openingHours[WEEKDAY_KEYS[(todayIndex + 6) % 7]]
  const toMinutes = (value: string) => {
    const [hours, minutes] = value.split(':').map(Number)
    return hours * 60 + minutes
  }

  // Friday's service runs into Saturday morning. Sunday 01:00 is explicitly
  // treated as closed by the confirmed business-hours examples.
  if (todayIndex === 6 && previous && !previous.closed && previous.open && previous.close) {
    const previousOpen = toMinutes(previous.open)
    const previousClose = toMinutes(previous.close)
    if (previousClose <= previousOpen && nowMinutes < previousClose) {
      return {
        isOpen: true,
        label: `Aberto agora · fecha às ${previous.close}`,
      }
    }
  }

  if (!today || today.closed || !today.open || !today.close) {
    return {
      isOpen: false,
      label: 'Fechado hoje',
    }
  }

  const openMinutes = toMinutes(today.open)
  const closeMinutes = toMinutes(today.close)
  const crossesMidnight = closeMinutes <= openMinutes
  const isOpen = nowMinutes >= openMinutes && (crossesMidnight || nowMinutes < closeMinutes)

  if (isOpen) {
    return {
      isOpen: true,
      label: `Aberto agora · fecha às ${today.close}`,
    }
  }

  if (nowMinutes < openMinutes) {
    return {
      isOpen: false,
      label: `Fechado agora · abre às ${today.open}`,
    }
  }

  return {
    isOpen: false,
    label: 'Fechado agora',
  }
}

type Props = {
  categories: Category[]
  products: Product[]
}

export default function CardapioClient({
  categories,
  products,
}: Props) {
  const searchParams =
    useSearchParams()
  const oauthReturn = searchParams.get('oauth') === 'google'
  const oauthCallbackHandled = useRef(false)
  const orderAttempt = useRef<{ fingerprint: string; key: string } | null>(null)
  const orderSubmissionInFlight = useRef(false)
  const categoryNavRef = useRef<HTMLDivElement>(null)
  const categorySwipeStart = useRef<{ x: number; y: number } | null>(null)
  const productDialogRef = useRef<HTMLDivElement>(null)
  const cartDialogRef = useRef<HTMLElement>(null)
  const dialogOpenerRef = useRef<HTMLElement | null>(null)

  /*
   * =========================================================
   * PARÂMETROS DA URL
   * =========================================================
   */

  const categoryFromUrl =
    searchParams.get('categoria')

  const productFromUrl =
    searchParams.get('produto')

  const initialProductId = productFromUrl ? Number(productFromUrl) : Number.NaN
  const initialProduct = Number.isInteger(initialProductId)
    ? products.find((product) => product.id === initialProductId) ?? null
    : null
  const initialProductCategory = initialProduct
    ? categories.find(
        (category) => category.id === initialProduct.category_id
      )
    : null
  const initialUrlCategory = categories.find(
    (category) => category.slug === categoryFromUrl
  )

  const [selectedProduct, setSelectedProduct] =
    useState<Product | null>(initialProduct)

  const [quantity, setQuantity] =
    useState(1)

  const [cart, setCart] =
    useState<CartItem[]>([])

  const [cartHydrated, setCartHydrated] = useState(false)

  const [cartNotice, setCartNotice] = useState('')

  const [cartOpen, setCartOpen] =
    useState(false)

  const [activeCategory, setActiveCategory] =
    useState(
      initialUrlCategory?.slug ??
        initialProductCategory?.slug ??
        categories[0]?.slug ??
        ''
    )

  /*
   * =========================================================
   * CHECKOUT / CLIENTE
   * =========================================================
   */

  const [checkoutStep, setCheckoutStep] =
    useState<CheckoutStep>('cart')

  const [customerForm, setCustomerForm] =
    useState<CustomerForm>({
      name: '',
      phone: '',
      address: '',
      number: '',
      complement: '',
      neighborhood: '',
      zipCode: '',
      city: '',
      state: '',
      reference: '',
    })

  const [customerFound, setCustomerFound] =
    useState(false)

  const [customerAccessToken, setCustomerAccessToken] =
    useState('')

  const [authReady, setAuthReady] = useState(false)
  const [authenticatedName, setAuthenticatedName] = useState('')
  const [zipLookupStatus, setZipLookupStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [deliveryConfig, setDeliveryConfig] = useState<DeliveryConfig | null>(null)
  const [deliveryConfigStatus, setDeliveryConfigStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const zipLookupSequence = useRef(0)

  const [customerLoading, setCustomerLoading] =
    useState(false)

  const [customerSaving, setCustomerSaving] =
    useState(false)
  const customerSaveInFlight = useRef(false)

  const [orderSaving, setOrderSaving] =
    useState(false)

  /*
   * Quando um cliente cadastrado é encontrado,
   * mostramos primeiro um resumo condensado dos
   * dados dele (em vez do formulário inteiro).
   *
   * Esse state controla isso:
   * - false → mostra o resumo condensado
   * - true  → mostra o formulário completo
   *          (cliente novo, ou pediu para editar)
   */
  const [showCustomerForm, setShowCustomerForm] =
    useState(false)

  const [customerError, setCustomerError] =
    useState('')

  /*
   * =========================================================
   * ENTREGA / PAGAMENTO
   * =========================================================
   */

  const [deliveryMethod, setDeliveryMethod] =
    useState<DeliveryMethod>('delivery')

  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>(getDefaultPaymentMethod)

  const [changeFor, setChangeFor] =
    useState('')

  /*
   * Status do horário de hoje ("aberto agora" /
   * "fechado agora"), exibido na barra de confiança
   * do cardápio. Começa null e só é preenchido depois
   * de montar no navegador, para não gerar diferença
   * entre o HTML do servidor e o do cliente.
   */
  const hoursSnapshot = useSyncExternalStore(
    subscribeToMinute,
    getHoursSnapshot,
    () => ''
  )
  const hoursStatus: HoursStatus | null = hoursSnapshot
    ? {
        isOpen: hoursSnapshot.startsWith('1|'),
        label: hoursSnapshot.slice(2),
      }
    : null

  /*
   * =========================================================
   * FORMATAÇÃO
   * =========================================================
   */

  function formatPrice(price: number) {
    return new Intl.NumberFormat(
      'pt-BR',
      {
        style: 'currency',
        currency: 'BRL',
      }
    ).format(price)
  }

  function normalizePhone(
    phone: string
  ) {
    const digits = phone.replace(/\D/g, '')
    return digits.startsWith('55') &&
      (digits.length === 12 || digits.length === 13)
      ? digits.slice(2)
      : digits
  }



  function formatPhone(
    phone: string
  ) {
    const digits =
      normalizePhone(phone)

    if (digits.length <= 2) {
      return digits
    }

    if (digits.length <= 7) {
      return `(${digits.slice(
        0,
        2
      )}) ${digits.slice(2)}`
    }

    return `(${digits.slice(
      0,
      2
    )}) ${digits.slice(
      2,
      7
    )}-${digits.slice(7, 11)}`
  }

  /*
   * =========================================================
   * FORMATAÇÃO DO TROCO
   * =========================================================
   *
   * O usuário digita somente números.
   *
   * Exemplos:
   *
   * 1      → 0,01
   * 10     → 0,10
   * 100    → 1,00
   * 1000   → 10,00
   * 10000  → 100,00
   *
   * Limite:
   *
   * 999999 → 9.999,99
   */

  function formatChange(
    value: string
  ) {
    const digits =
      value.replace(/\D/g, '')

    if (!digits) {
      return ''
    }

    const limitedDigits =
      digits.slice(0, 6)

    const numericValue =
      Number(limitedDigits) / 100

    return numericValue.toLocaleString(
      'pt-BR',
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }
    )
  }

  /*
   * =========================================================
   * CONVERTER TROCO PARA NÚMERO
   * =========================================================
   *
   * Exemplo:
   *
   * 1.250,00 → 1250
   */

  function parseChange(
    value: string
  ) {
    if (!value.trim()) {
      return 0
    }

    return Number(
      value
        .replace(/\./g, '')
        .replace(',', '.')
    )
  }

  /*
   * =========================================================
   * PIX — INSTRUÇÕES DE PAGAMENTO
   * =========================================================
   *
   * O pagamento é feito presencialmente no recebimento. O site não
   * envia chave ou QR Code e não confirma o pagamento automaticamente.
   */

  function renderPixInstructions() {
    return (
      <div className={styles.pixPaymentNotice}>
        <span className={styles.pixInstruction}>
          Pagamento via Pix na retirada ou ao entregador no recebimento. O pedido
          só é considerado pago após a confirmação do recebimento pela loja.
        </span>
      </div>
    )
  }

  /*
   * =========================================================
   * PRODUTO
   * =========================================================
   */

  function openProduct(
    product: Product
  ) {
    dialogOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setSelectedProduct(product)
    setQuantity(1)
  }

  function closeProduct() {
    setSelectedProduct(null)
    setQuantity(1)
  }

  function openCart() {
    dialogOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setCartOpen(true)
  }

  function increaseQuantity() {
    setQuantity(
      (current) => Math.min(MAX_ITEM_QUANTITY, current + 1)
    )
  }

  function decreaseQuantity() {
    setQuantity(
      (current) =>
        current > 1
          ? current - 1
          : 1
    )
  }

  /*
   * =========================================================
   * CARRINHO
   * =========================================================
   */

  function addToCart(
    product: Product,
    amount = 1
  ) {
    const safeAmount = Number.isInteger(amount)
      ? Math.min(MAX_ITEM_QUANTITY, Math.max(1, amount))
      : 1
    setCart((currentCart) => {
      const existingItem =
        currentCart.find(
          (item) =>
            item.product.id ===
            product.id
        )

      if (existingItem) {
        return currentCart.map(
          (item) =>
            item.product.id ===
            product.id
              ? {
                  ...item,
                  quantity:
                    Math.min(MAX_ITEM_QUANTITY, item.quantity + safeAmount),
                }
              : item
        )
      }

      return [
        ...currentCart,
        {
          product,
          quantity: safeAmount,
        },
      ]
    })
  }

  function addProductQuick(
    product: Product
  ) {
    addToCart(product, 1)
  }

  function addSelectedProduct() {
    if (!selectedProduct) {
      return
    }

    addToCart(
      selectedProduct,
      quantity
    )

    closeProduct()
  }

  function increaseCartItem(
    productId: number
  ) {
    setCart((currentCart) =>
      currentCart.map(
        (item) =>
          item.product.id ===
          productId
            ? {
                ...item,
                quantity:
                  Math.min(MAX_ITEM_QUANTITY, item.quantity + 1),
              }
            : item
      )
    )
  }

  function decreaseCartItem(
    productId: number
  ) {
    setCart((currentCart) =>
      currentCart
        .map((item) =>
          item.product.id ===
          productId
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

  function removeCartItem(
    productId: number
  ) {
    setCart((currentCart) =>
      currentCart.filter(
        (item) =>
          item.product.id !==
          productId
      )
    )
  }

  /*
   * =========================================================
   * LIMPAR PEDIDO / PREPARAR NOVO PEDIDO
   * =========================================================
   */

  function clearCart() {
    orderAttempt.current = null
    setCart([])
    setCartNotice('')

    setCheckoutStep('cart')

    setCustomerFound(false)

    setShowCustomerForm(false)

    setCustomerAccessToken('')

    setCustomerError('')

    setCustomerForm({
      name: '',
      phone: '',
      address: '',
      number: '',
      complement: '',
      neighborhood: '',
      zipCode: '',
      city: '',
      state: '',
      reference: '',
    })

    setDeliveryMethod('delivery')
    setPaymentMethod(getDefaultPaymentMethod())
    setChangeFor('')
  }

  /*
   * =========================================================
   * CÁLCULOS
   * =========================================================
   */

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
        (totalCents, item) =>
          totalCents + Math.round(Number(item.product.price) * 100) * item.quantity,
        0
      ) / 100,
    [cart]
  )

  const deliveryQuote = useMemo(
    () => resolveDeliveryQuote(deliveryMethod, customerForm.city, customerForm.state, customerForm.neighborhood, deliveryConfig),
    [customerForm.city, customerForm.neighborhood, customerForm.state, deliveryConfig, deliveryMethod]
  )
  const deliveryFee = deliveryQuote.ok ? deliveryQuote.fee : null
  const deliveryFailureReason = deliveryQuote.ok ? null : deliveryQuote.reason
  const orderTotal = calculateOrderTotal(cartTotal, deliveryFee ?? 0) ?? cartTotal
  const displayedOrderTotal = deliveryMethod === 'delivery' && deliveryFee === null ? '—' : formatPrice(orderTotal)
  const displayedDeliveryFee = deliveryQuote.ok
    ? formatPrice(deliveryQuote.fee)
    : deliveryConfigStatus === 'loading' ? 'Carregando configuração…'
      : deliveryConfigStatus === 'error' || deliveryQuote.reason === 'unavailable' ? 'Indisponível'
        : deliveryQuote.reason === 'disabled' ? 'Entrega desativada'
          : deliveryQuote.reason === 'outside_area' ? 'Fora da área atendida'
            : deliveryQuote.reason === 'zone_not_found' ? 'Bairro sem zona configurada'
              : deliveryQuote.reason === 'ambiguous_zone' ? 'Zona precisa de revisão'
                : deliveryQuote.reason === 'manual_confirmation_required' ? 'Endereço exige confirmação manual'
                  : deliveryQuote.reason === 'not_ready' ? 'Entrega ainda não configurada'
                  : 'Configuração inválida'

  useEffect(() => {
    let active = true
    void fetch('/api/delivery-config', { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok || !result?.config) throw new Error(result?.error ?? 'Delivery configuration unavailable.')
        return result.config as DeliveryConfig
      })
      .then((config) => {
        if (!active) return
        setDeliveryConfig(config)
        setDeliveryConfigStatus('ready')
      })
      .catch((error) => {
        console.error('Falha ao carregar configuração de entrega.', error)
        if (active) setDeliveryConfigStatus('error')
      })
    return () => { active = false }
  }, [])

  /*
   * =========================================================
   * CATEGORIAS
   * =========================================================
   */

  function getCategoryName(
    categoryId: number
  ) {
    return (
      categories.find(
        (category) =>
          category.id ===
          categoryId
      )?.name ?? ''
    )
  }

  function selectCategory(
    slug: string
  ) {
    setActiveCategory(slug)
  }

  useEffect(() => {
    const nav = categoryNavRef.current
    const activeButton = Array.from(
      nav?.querySelectorAll<HTMLButtonElement>('[data-category]') ?? []
    ).find((button) => button.dataset.category === activeCategory)
    if (!nav || !activeButton) return

    const navBounds = nav.getBoundingClientRect()
    const buttonBounds = activeButton.getBoundingClientRect()
    if (buttonBounds.left < navBounds.left) {
      nav.scrollBy({ left: buttonBounds.left - navBounds.left - 12, behavior: 'smooth' })
    } else if (buttonBounds.right > navBounds.right) {
      nav.scrollBy({ left: buttonBounds.right - navBounds.right + 12, behavior: 'smooth' })
    }
  }, [activeCategory])

  function finishCategorySwipe(x: number, y: number) {
    const start = categorySwipeStart.current
    categorySwipeStart.current = null
    if (!start) return

    const deltaX = x - start.x
    const deltaY = y - start.y
    if (Math.abs(deltaX) < 64 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return

    const currentIndex = categories.findIndex((category) => category.slug === activeCategory)
    const nextCategory = categories[currentIndex + (deltaX < 0 ? 1 : -1)]
    if (nextCategory) selectCategory(nextCategory.slug)
  }

  /*
   * =========================================================
   * FORMULÁRIO
   * =========================================================
   */

  function updateCustomerField(
    field: keyof CustomerForm,
    value: string
  ) {
    if (field === 'zipCode') {
      setZipLookupStatus('idle')
    }
    setCustomerForm(
      (current) => ({
        ...current,
        [field]: value,
      })
    )

    if (customerError) {
      setCustomerError('')
    }
  }

  /*
   * =========================================================
   * INICIAR CHECKOUT
   * =========================================================
   */

  function startCheckout() {
    if (cart.length === 0) {
      return
    }

    setCustomerError('')
    setCustomerFound(false)
    setShowCustomerForm(false)
    setCustomerAccessToken('')
    setCheckoutStep('phone')
    void supabase.auth.getSession().then(({ data }) => {
      const session = data.session
      if (session?.access_token && session.user) {
        setCustomerAccessToken(session.access_token)
        setAuthenticatedName(
          String(session.user.user_metadata?.full_name ?? session.user.user_metadata?.name ?? session.user.email ?? '')
        )
        setCustomerFound(false)
        setShowCustomerForm(true)
        setCheckoutStep('delivery')
        setCartOpen(true)
        void fetch('/api/customer', {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${session.access_token}` },
        }).then(async (response) => {
          const result = await response.json()
          if (!response.ok) throw new Error(result?.error ?? 'Não foi possível carregar o perfil.')
          const customer = result.customer as Customer | null
          setCustomerFound(Boolean(customer))
          setShowCustomerForm(!customer)
          if (customer) setCustomerForm((current) => ({
            ...current,
            name: customer.name ?? current.name,
            phone: normalizePhone(customer.phone ?? current.phone),
            address: customer.address ?? current.address,
            number: customer.number ?? current.number,
            complement: customer.complement ?? current.complement,
            neighborhood: customer.neighborhood ?? current.neighborhood,
            zipCode: customer.zip_code ?? current.zipCode,
            city: customer.city ?? current.city,
            state: customer.state ?? current.state,
            reference: customer.reference ?? current.reference,
          }))
        }).catch((error) => {
          console.error('Falha ao carregar perfil do cliente.', error)
          setCustomerError('Conta conectada, mas não foi possível carregar os dados salvos. Confira o cadastro antes de continuar.')
          setShowCustomerForm(true)
        })
      }
    }).catch((error) => console.error('Falha ao recuperar sessão Supabase.', error))
  }

  /*
   * =========================================================
   * BUSCAR CLIENTE
   * =========================================================
   */

  async function signInWithGoogle() {
    setCustomerLoading(true)
    setCustomerError('')
    try {
      sessionStorage.removeItem('brasao-google-oauth-processed')
      sessionStorage.setItem('brasao-google-oauth-pending', '1')
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/cardapio?oauth=google` },
      })
      if (error) throw error
    } catch (error) {
      sessionStorage.removeItem('brasao-google-oauth-pending')
      console.error('Falha ao iniciar login Google.', error)
      setCustomerError('Não foi possível iniciar o login Google. Tente novamente ou continue sem entrar.')
      setCustomerLoading(false)
    }
  }

  function continueWithoutSignIn() {
    setCustomerAccessToken('')
    setCustomerFound(false)
    setShowCustomerForm(true)
    setCheckoutStep('delivery')
  }

  async function signOutCustomer() {
    const { error } = await supabase.auth.signOut()
    if (error) {
      setCustomerError('Não foi possível sair da conta agora.')
      return
    }
    setCustomerAccessToken('')
    setCustomerFound(false)
    setShowCustomerForm(true)
    setCustomerError('')
  }

  useEffect(() => {
    let frame = 0
    try {
      const saved = sessionStorage.getItem('brasao-checkout-cart')
      if (saved) {
        const parsed: unknown = JSON.parse(saved)
        frame = window.requestAnimationFrame(() => {
          if (!Array.isArray(parsed)) {
            setCartNotice('O carrinho salvo não pôde ser validado e foi limpo. Confira seus itens antes de continuar.')
            setCartHydrated(true)
            return
          }

          let invalidCount = 0
          let unavailableCount = 0
          let changedPriceCount = 0
          const reconciled: CartItem[] = []

          for (const storedItem of parsed) {
            if (!isStoredCartItem(storedItem)) {
              invalidCount += 1
              continue
            }

            const currentProduct = products.find((product) => product.id === storedItem.product.id)
            if (!currentProduct || !currentProduct.available) {
              unavailableCount += 1
              continue
            }

            if (Math.round(Number(storedItem.product.price) * 100) !== Math.round(Number(currentProduct.price) * 100)) {
              changedPriceCount += 1
            }
            reconciled.push({ product: currentProduct, quantity: storedItem.quantity })
          }

          setCart(reconciled)
          const notices: string[] = []
          if (changedPriceCount > 0) notices.push(`o preço de ${changedPriceCount} item(ns) foi atualizado`)
          if (unavailableCount > 0) notices.push(`${unavailableCount} item(ns) indisponível(is) foi(ram) removido(s)`)
          if (invalidCount > 0) notices.push(`${invalidCount} item(ns) inválido(s) foi(ram) removido(s)`)
          if (notices.length > 0) {
            setCartNotice(`Atualizamos seu carrinho: ${notices.join('; ')}. Confira os itens e o total antes de confirmar.`)
          }
          setCartHydrated(true)
        })
      } else {
        frame = window.requestAnimationFrame(() => setCartHydrated(true))
      }
    } catch (error) {
      console.error(error)
      frame = window.requestAnimationFrame(() => setCartHydrated(true))
    }
    return () => window.cancelAnimationFrame(frame)
  }, [products])

  useEffect(() => {
    if (!cartHydrated) return
    try {
      sessionStorage.setItem('brasao-checkout-cart', JSON.stringify(cart))
    } catch (error) {
      console.error('Não foi possível salvar o carrinho nesta sessão.', error)
    }
  }, [cart, cartHydrated])

  useEffect(() => {
    const loadCustomerProfile = async (accessToken: string) => {
      setCustomerLoading(true)
      setCustomerError('')
      setCustomerAccessToken(accessToken)
      try {
        const response = await fetch('/api/customer', {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result?.error ?? 'Profile lookup failed.')
        const customer = result.customer as Customer | null
        setCustomerFound(Boolean(customer))
        setShowCustomerForm(!customer)
        if (customer) {
          setCustomerForm({
            name: customer.name ?? '',
            phone: normalizePhone(customer.phone ?? ''),
            address: customer.address ?? '',
            number: customer.number ?? '',
            complement: customer.complement ?? '',
            neighborhood: customer.neighborhood ?? '',
            zipCode: customer.zip_code ?? '',
            city: customer.city ?? '',
            state: customer.state ?? '',
            reference: customer.reference ?? '',
          })
        }
        setCheckoutStep('delivery')
        setCartOpen(true)
      } catch (error) {
        console.error('Failed to load the Google customer profile.', error)
        setCustomerError('Sua conta Google foi conectada, mas os dados salvos nao carregaram. Continue preenchendo os dados do pedido.')
        setCustomerAccessToken(accessToken)
        setCustomerFound(false)
        setShowCustomerForm(true)
        setCheckoutStep('delivery')
        setCartOpen(true)
      } finally {
        setCustomerLoading(false)
      }
    }

    function removeOAuthMarker() {
      const url = new URL(window.location.href)
      url.searchParams.delete('oauth')
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
    }

    if (oauthReturn && !oauthCallbackHandled.current) {
      oauthCallbackHandled.current = true
      try {
        sessionStorage.removeItem('brasao-google-oauth-pending')
        sessionStorage.setItem('brasao-google-oauth-processed', '1')
      } catch {
        // Continue with OAuth when session storage is unavailable.
      }

      removeOAuthMarker()
      setCartOpen(true)
      setCustomerLoading(true)
      void supabase.auth.getSession().then(async ({ data }) => {
        if (data.session?.access_token) {
          await loadCustomerProfile(data.session.access_token)
        } else {
          setCustomerLoading(false)
          setCheckoutStep('phone')
          setCustomerError('O login Google nao foi concluido. Tente novamente ou continue sem entrar.')
        }
      }).catch((error) => {
        console.error('Failed to recover the Google session.', error)
        setCustomerLoading(false)
        setCheckoutStep('phone')
        setCustomerError('Nao foi possivel recuperar a sessao Google. Tente novamente ou continue sem entrar.')
      })
    }

    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setCustomerAccessToken(data.session?.access_token ?? '')
      setAuthenticatedName(String(data.session?.user.user_metadata?.full_name ?? data.session?.user.user_metadata?.name ?? data.session?.user.email ?? ''))
      setAuthReady(true)
    }).catch((error) => {
      console.error('Falha ao recuperar sessão Supabase.', error)
      if (active) setAuthReady(true)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      setCustomerAccessToken(session?.access_token ?? '')
      setAuthenticatedName(String(session?.user.user_metadata?.full_name ?? session?.user.user_metadata?.name ?? session?.user.email ?? ''))
      if (event === 'SIGNED_OUT') {
        setCustomerFound(false)
        setShowCustomerForm(true)
        setCustomerForm({ name: '', phone: '', address: '', number: '', complement: '', neighborhood: '', zipCode: '', city: '', state: '', reference: '' })
      }
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [oauthReturn])

  useEffect(() => {
    const zip = customerForm.zipCode.replace(/\D/g, '')
    const sequence = ++zipLookupSequence.current
    if (zip.length !== 8) return
    const timer = window.setTimeout(() => {
      setZipLookupStatus('loading')
      void fetch(`https://viacep.com.br/ws/${zip}/json/`)
        .then((response) => {
          if (!response.ok) throw new Error('CEP indisponível')
          return response.json()
        })
        .then((result: { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string }) => {
          if (sequence !== zipLookupSequence.current) return
          if (result.erro || !result.localidade || !result.uf) throw new Error('CEP não encontrado')
          setCustomerForm((current) => ({
            ...current,
            address: result.logradouro || current.address,
            neighborhood: result.bairro || current.neighborhood,
            city: result.localidade || current.city,
            state: result.uf || current.state,
          }))
          setZipLookupStatus('done')
        })
        .catch(() => { if (sequence === zipLookupSequence.current) setZipLookupStatus('error') })
    }, 350)
    return () => window.clearTimeout(timer)
  }, [customerForm.zipCode])

  /*
   * =========================================================
   * SALVAR CLIENTE
   * =========================================================
   */

  async function saveCustomer() {
    const phone =
      normalizePhone(
        customerForm.phone
      )

    /*
     * Endereço só é obrigatório quando o
     * cliente escolheu ENTREGA. Para
     * RETIRADA, pulamos essas validações.
     */
    const requiresAddress =
      deliveryMethod === 'delivery'

    const payload = {
      name:
        customerForm.name.trim(),

      phone,

      deliveryMethod,

      address:
        customerForm.address.trim(),

      number:
        customerForm.number.trim(),

      complement:
        customerForm.complement.trim(),

      neighborhood:
        customerForm.neighborhood.trim(),

      zipCode: customerForm.zipCode.replace(/\D/g, ''),
      city: customerForm.city.trim(),
      state: customerForm.state.trim().toUpperCase(),

      reference:
        customerForm.reference.trim(),
    }

    if (!payload.name) {
      setCustomerError(
        'Digite seu nome.'
      )

      return
    }

    if (phone.length < 10 || phone.length > 11) {
      setCustomerError(
        'Digite um WhatsApp válido.'
      )

      return
    }

    if (requiresAddress) {
      if (zipLookupStatus === 'loading') {
        setCustomerError('Aguarde a consulta do CEP terminar antes de continuar.')
        return
      }
      if (payload.zipCode.length === 8 && zipLookupStatus === 'idle') {
        setCustomerError('Aguarde a consulta automática do CEP terminar antes de continuar.')
        return
      }
      if (!payload.address) {
        setCustomerError(
          'Digite seu endereço.'
        )

        return
      }

      if (!payload.number) {
        setCustomerError(
          'Digite o número do endereço.'
        )

        return
      }

      if (!payload.neighborhood) {
        setCustomerError(
          'Digite seu bairro.'
        )

        return
      }
      if (payload.zipCode.length !== 8) {
        setCustomerError('Informe um CEP válido com 8 dígitos.')
        return
      }
      if (!payload.city || !/^[A-Z]{2}$/.test(payload.state)) {
        setCustomerError('Informe a cidade e o estado do endereço.')
        return
      }
      if (deliveryFee === null && deliveryConfigStatus === 'loading') {
        setCustomerError('Aguarde o carregamento da configuração de entrega.')
        return
      }
      if (deliveryFee === null && deliveryConfigStatus === 'error') {
        setCustomerError('Não foi possível carregar a configuração de entrega. Tente novamente mais tarde.')
        return
      }
      if (deliveryFee === null && !deliveryConfig?.enabled) {
        setCustomerError('A entrega está temporariamente indisponível.')
        return
      }
      if (deliveryFee === null && deliveryFailureReason === 'zone_not_found') {
        setCustomerError('Esse bairro ainda não possui uma zona de entrega configurada.')
        return
      }
      if (deliveryFee === null && deliveryFailureReason === 'ambiguous_zone') {
        setCustomerError('A configuração das zonas de entrega precisa ser revisada.')
        return
      }
      if (deliveryFee === null && deliveryFailureReason === 'manual_confirmation_required') {
        setCustomerError('Este endereço exige confirmação manual da loja antes de finalizar o pedido.')
        return
      }
      if (deliveryFee === null && deliveryFailureReason === 'not_ready') {
        setCustomerError('A entrega ainda não foi configurada para aceitar pedidos.')
        return
      }
      if (deliveryFee === null && deliveryFailureReason === 'invalid') {
        setCustomerError('A configuração da entrega está inválida. Tente novamente mais tarde.')
        return
      }
      if (deliveryFee === null && deliveryFailureReason === 'outside_area' && deliveryConfig) {
        setCustomerError(`A entrega atende somente ${deliveryConfig.serviceCity}, ${deliveryConfig.serviceState}.`)
        return
      }
      if (deliveryFee === null) {
        setCustomerError('A taxa para este endereço não está configurada. Confirme o valor com o Brasão Burger antes de finalizar.')
        return
      }
    }

    setCustomerError('')

    if (customerSaveInFlight.current) return
    customerSaveInFlight.current = true
    setCustomerSaving(true)
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw new Error('Could not validate the customer session.')

      const session = sessionData.session
      const accessToken = session?.access_token
      if (!accessToken) {
        if (customerAccessToken) {
          throw new Error('Customer session is no longer available.')
        }
        setCheckoutStep('payment')
        return
      }

      const response = await fetch('/api/customer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      })
      const result: unknown = await response.json()
      const savedCustomer = result && typeof result === 'object' && !Array.isArray(result) && 'customer' in result
        ? result.customer
        : null

      if (!response.ok || !session?.user?.id || !isPersistedCustomer(savedCustomer, session.user.id)) {
        throw new Error('Customer profile persistence was not confirmed.')
      }

      setCustomerForm({
        name: savedCustomer.name,
        phone: normalizePhone(savedCustomer.phone),
        address: savedCustomer.address ?? payload.address,
        number: savedCustomer.number ?? payload.number,
        complement: savedCustomer.complement ?? payload.complement,
        neighborhood: savedCustomer.neighborhood ?? payload.neighborhood,
        zipCode: savedCustomer.zip_code ?? payload.zipCode,
        city: savedCustomer.city ?? payload.city,
        state: savedCustomer.state ?? payload.state,
        reference: savedCustomer.reference ?? payload.reference,
      })
      setCheckoutStep('payment')
    } catch {
      console.error('Falha técnica ao persistir perfil do cliente.')
      setCustomerError(
        'Não foi possível salvar os dados do cliente. Verifique sua conexão e tente novamente.'
      )
    } finally {
      customerSaveInFlight.current = false
      setCustomerSaving(false)
    }
  }

  /*
   * =========================================================
   * ENTREGA — CONTINUAR PARA OS DADOS DO CLIENTE
   * =========================================================
   *
   * A escolha de entrega/retirada em si não tem
   * validação (sempre existe um valor padrão), então
   * essa função só avança para a próxima etapa.
   */

  function continueFromDelivery() {
    setCustomerError('')
    setCheckoutStep('customer')
  }

  /*
   * =========================================================
   * PAGAMENTO
   * =========================================================
   */

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
        numericChange <= orderTotal
      ) {
        setCustomerError(
          `O valor para troco precisa ser maior que ${formatPrice(
          orderTotal
          )}.`
        )

        return
      }
    }

    setCustomerError('')
    setCheckoutStep('confirmed')
  }

  /*
   * =========================================================
   * MENSAGEM DO WHATSAPP
   * =========================================================
   */

  function buildWhatsAppMessage(order: PersistedOrder) {
    const lines: string[] = []
    lines.push('*NOVO PEDIDO - BRASAO BURGER*')
    lines.push(`Pedido: ${order.id}`)
    lines.push('')
    lines.push('*ITENS DO PEDIDO*')
    order.items.forEach((item) => {
      lines.push(`${item.quantity}x ${item.name} - ${formatPrice(item.lineTotal)}`)
    })
    lines.push('')
    lines.push(`Subtotal: ${formatPrice(order.subtotal)}`)
    if (order.deliveryMethod === 'delivery') {
    lines.push(`${order.deliveryZone ? `Zona: ${order.deliveryZone} · ` : ''}Taxa de entrega: ${formatPrice(order.deliveryFee)}`)
    }
    lines.push(`*TOTAL: ${formatPrice(order.total)}*`)
    lines.push('')
    lines.push('*CLIENTE*')
    lines.push(`Nome: ${order.name}`)
    lines.push(`WhatsApp: ${formatPhone(order.phone)}`)
    lines.push('')
    lines.push('*ENTREGA*')
    if (order.deliveryMethod === 'delivery') {
      lines.push('Forma: Entrega')
      lines.push(`Endereco: ${order.address}, ${order.number}`)
      if (order.complement?.trim()) lines.push(`Complemento: ${order.complement}`)
      lines.push(`Bairro: ${order.neighborhood}`)
      if (order.zipCode) lines.push(`CEP: ${order.zipCode}`)
      if (order.reference?.trim()) lines.push(`Referencia: ${order.reference}`)
    } else {
      lines.push('Forma: Retirada no local')
    }
    lines.push('')
    lines.push('*PAGAMENTO*')
    if (order.paymentMethod === 'pix') {
      lines.push('Forma: Pix')
      lines.push(order.deliveryMethod === 'delivery'
        ? 'Pagamento: Pix ao entregador'
        : 'Pagamento: Pix na retirada')
    }
    if (order.paymentMethod === 'card') lines.push('Forma: Cartao')
    if (order.paymentMethod === 'cash') {
      lines.push('Forma: Dinheiro')
      lines.push(order.changeFor !== null ? `Troco para: ${formatPrice(order.changeFor)}` : 'Sem necessidade de troco')
    }
    lines.push('')
    lines.push('Aguardo a confirmacao do pedido. Obrigado!')
    return lines.join('\n')
  }

  async function sendOrderToWhatsApp() {
    if (cart.length === 0 || orderSaving || orderSubmissionInFlight.current) return
    if (cart.some(({ quantity }) => !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_ITEM_QUANTITY)) {
      setCustomerError('Cada produto deve ter entre 1 e 999 unidades. Revise o carrinho antes de continuar.')
      return
    }

    const whatsappWindow = window.open('about:blank', '_blank')
    if (!whatsappWindow) {
      setCustomerError('Nao foi possivel abrir o WhatsApp. Permita a abertura de nova janela e tente novamente.')
      return
    }

    setCustomerError('')
    orderSubmissionInFlight.current = true
    setOrderSaving(true)
    try {
    const fingerprint = JSON.stringify({
      items: cart.map(({ product, quantity }) => [product.id, quantity, Math.round(Number(product.price) * 100)]),
      deliveryMethod,
      paymentMethod,
      changeFor: paymentMethod === 'cash' ? changeFor.trim() : '',
      customer: customerForm,
      expectedDeliveryQuote: deliveryMethod === 'delivery' && deliveryQuote.ok && deliveryQuote.zone
        ? { feeCents: Math.round(deliveryQuote.fee * 100), zoneKey: deliveryQuote.zone.zoneKey }
        : null,
    })
    const fingerprintBytes = new TextEncoder().encode(fingerprint)
    const fingerprintDigest = await crypto.subtle.digest('SHA-256', fingerprintBytes)
    const fingerprintHash = Array.from(new Uint8Array(fingerprintDigest), (byte) => byte.toString(16).padStart(2, '0')).join('')
    if (orderAttempt.current?.fingerprint !== fingerprintHash) {
      let storedAttempt: unknown = null
      try {
        storedAttempt = JSON.parse(sessionStorage.getItem('brasao-order-attempt') ?? 'null')
      } catch {
        // Continue with an in-memory key when session storage is unavailable.
      }
      const stored = storedAttempt && typeof storedAttempt === 'object'
        ? storedAttempt as Record<string, unknown>
        : null
      const storedKeyIsValid = typeof stored?.key === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored.key)
      const key = stored?.fingerprint === fingerprintHash && storedKeyIsValid
        ? stored.key as string
        : crypto.randomUUID()
      orderAttempt.current = { fingerprint: fingerprintHash, key }
      try {
        sessionStorage.setItem('brasao-order-attempt', JSON.stringify({ fingerprint: fingerprintHash, key }))
      } catch {
        // The in-memory key still protects retries until this page is closed.
      }
    }

      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          idempotencyKey: orderAttempt.current.key,
          deliveryMethod,
          paymentMethod,
          changeFor: paymentMethod === 'cash' ? changeFor.trim() : '',
          customer: customerForm,
          expectedDeliveryQuote: deliveryMethod === 'delivery' && deliveryQuote.ok && deliveryQuote.zone
            ? { feeCents: Math.round(deliveryQuote.fee * 100), zoneKey: deliveryQuote.zone.zoneKey }
            : null,
          items: cart.map(({ product, quantity }) => ({
            productId: product.id,
            quantity,
            expectedUnitPriceCents: Math.round(Number(product.price) * 100),
          })),
        }),
      })
      const result = await response.json().catch(() => null)
      if (response.status === 409 && result?.error === 'DELIVERY_QUOTE_CHANGED' && result.config && result.currentQuote) {
        setDeliveryConfig(result.config as DeliveryConfig)
        setDeliveryConfigStatus('ready')
        if (result.verifiedAddress && typeof result.verifiedAddress === 'object') {
          setCustomerForm((current) => ({
            ...current,
            city: typeof result.verifiedAddress.city === 'string' ? result.verifiedAddress.city : current.city,
            state: typeof result.verifiedAddress.state === 'string' ? result.verifiedAddress.state : current.state,
            neighborhood: typeof result.verifiedAddress.neighborhood === 'string' ? result.verifiedAddress.neighborhood : current.neighborhood,
          }))
        }
        const currentFee = Number(result.currentQuote.fee)
        const currentZone = typeof result.currentQuote.zoneName === 'string' ? result.currentQuote.zoneName : 'atualizada'
        setCustomerError(`A cotação de entrega mudou. A nova taxa para ${currentZone} é ${Number.isFinite(currentFee) ? formatPrice(currentFee) : 'indisponível'}. Confira o endereço e confirme novamente.`)
        setCheckoutStep('delivery')
        whatsappWindow.close()
        return
      }
      if (response.status === 409 && result?.error === 'MENU_CHANGED' && Array.isArray(result.products)) {
        const currentProducts = new Map<number, Product>()
        const unavailableIds = new Set<number>()
        for (const value of result.products) {
          if (!value || typeof value !== 'object') continue
          const product = value as Record<string, unknown>
          if (!Number.isSafeInteger(product.id)) continue
          if (product.available === false) {
            unavailableIds.add(Number(product.id))
          } else if (product.available === true && Number.isSafeInteger(product.category_id) && typeof product.name === 'string') {
            currentProducts.set(Number(product.id), product as unknown as Product)
          }
        }
        setCart((current) => current.flatMap((item) => {
          if (unavailableIds.has(item.product.id)) return []
          const currentProduct = currentProducts.get(item.product.id)
          return currentProduct ? [{ ...item, product: currentProduct }] : [item]
        }))
        setCartNotice('O cardápio mudou enquanto você finalizava. Atualizamos os preços e removemos itens indisponíveis. Revise o carrinho antes de confirmar novamente.')
        setCustomerError('O cardápio foi atualizado. Confira os itens e os valores antes de continuar.')
        setCheckoutStep('cart')
        whatsappWindow.close()
        return
      }
      if (!response.ok || !result?.order) {
        throw new Error(typeof result?.error === 'string'
          ? translateOrderError(result.error)
          : 'Nao foi possivel salvar o pedido. Tente novamente.')
      }

      const order = result.order as PersistedOrder
      const message = buildWhatsAppMessage(order)
      const url = `https://wa.me/${SITE_CONFIG.whatsapp.number}?text=${encodeURIComponent(message)}`
      whatsappWindow.location.replace(url)
      orderAttempt.current = null
      try {
        sessionStorage.removeItem('brasao-order-attempt')
      } catch {
        // A later attempt in this tab will replace the stored fingerprint.
      }
      clearCart()
      setCartOpen(false)
    } catch (error) {
      whatsappWindow.close()
      setCustomerError(error instanceof Error ? error.message : 'Nao foi possivel salvar o pedido. Tente novamente.')
    } finally {
      orderSubmissionInFlight.current = false
      setOrderSaving(false)
    }
  }

  /*
   * =========================================================
   * VOLTAR
   * =========================================================
   */

  function backToCart() {
    setCheckoutStep('cart')
    setCustomerError('')
  }

  /*
   * =========================================================
   * BODY SCROLL
   * =========================================================
   */

  useEffect(() => {
    if (
      !selectedProduct &&
      !cartOpen
    ) {
      document.body.style.overflow =
        ''

      return
    }

    document.body.style.overflow =
      'hidden'

    return () => {
      document.body.style.overflow =
        ''
    }
  }, [
    selectedProduct,
    cartOpen,
  ])

  useEffect(() => {
    const dialog = selectedProduct ? productDialogRef.current : cartOpen ? cartDialogRef.current : null
    if (!dialog) {
      dialogOpenerRef.current?.focus({ preventScroll: true })
      dialogOpenerRef.current = null
      return
    }

    const getFocusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter((element) => element.getClientRects().length > 0)

    const frame = window.requestAnimationFrame(() => {
      const focusable = getFocusable()
      ;(focusable[0] ?? dialog).focus({ preventScroll: true })
    })
    const handleTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const focusable = getFocusable()
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleTab, true)
    const handleFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialog.contains(event.target)) {
        const focusable = getFocusable()
        ;(focusable[0] ?? dialog).focus({ preventScroll: true })
      }
    }
    document.addEventListener('focusin', handleFocus, true)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleTab, true)
      document.removeEventListener('focusin', handleFocus, true)
    }
  }, [selectedProduct, cartOpen])

  /*
   * =========================================================
   * ESC
   * =========================================================
   */

  useEffect(() => {
    function handleEscape(
      event: KeyboardEvent
    ) {
      if (event.key !== 'Escape') {
        return
      }

      if (selectedProduct) {
        closeProduct()
        return
      }

      if (cartOpen) {
        if (
          checkoutStep !== 'cart'
        ) {
          backToCart()
          return
        }

        setCartOpen(false)
      }
    }

    window.addEventListener(
      'keydown',
      handleEscape
    )

    return () => {
      window.removeEventListener(
        'keydown',
        handleEscape
      )
    }
  }, [
    selectedProduct,
    cartOpen,
    checkoutStep,
  ])

  /*
   * =========================================================
   * CATEGORIA ATIVA
   * =========================================================
   */

  const activeCategoryData =
    categories.find(
      (category) =>
        category.slug ===
        activeCategory
    ) ?? categories[0]

  const activeProducts =
    activeCategoryData
      ? products.filter(
          (product) =>
            product.category_id ===
            activeCategoryData.id
        )
      : []

  /*
   * =========================================================
   * PROGRESSO DO CHECKOUT
   * =========================================================
   *
   * -1 quando a etapa atual não faz parte do fluxo de
   * checkout (ex: 'cart' ou 'confirmed') — nesse caso o
   * indicador de progresso não é exibido.
   */

  const checkoutStepIndex =
    CHECKOUT_FLOW_STEPS.indexOf(
      checkoutStep
    )

  /*
   * =========================================================
   * RENDER
   * =========================================================
   */

  return (
    <main
      className={styles.page}
    >

      {/* =====================================================
          HEADER
          ===================================================== */}

      <header
        className={styles.header}
      >

        <div
          className={
            styles.headerTop
          }
        >

          <Link
            href="/"
            className={
              styles.brand
            }
            aria-label="Voltar para o início"
          >
            <span
              className={
                styles.brandSymbol
              }
            >
              B
            </span>

            <span>
              BRASÃO BURGER
            </span>
          </Link>

          <span
            className={
              styles.headerCode
            }
          >
            MENU / 01
          </span>

        </div>

        <div
          className={styles.intro}
        >

          <span
            className={
              styles.eyebrow
            }
          >
            HAMBÚRGUER · PARRILLA · BAR
          </span>

          <h1>
            Nosso <em>cardápio.</em>
          </h1>

          <p>
            Escolha seu pedido e aproveite
            o sabor do Brasão.
          </p>

        </div>

        {/* =================================================
            BARRA DE CONFIANÇA
            =================================================

            Repete, dentro do próprio cardápio, as
            informações que hoje só existem na home:
            horário de funcionamento, contato e formas
            de pagamento aceitas.
            ================================================= */}

        <div
          className={
            styles.trustBar
          }
        >

          <span
            className={`
              ${styles.trustBarItem}
              ${
                hoursStatus?.isOpen
                  ? styles.trustBarOpen
                  : ''
              }
            `}
          >
            <span
              className={
                styles.trustBarDot
              }
              aria-hidden="true"
            />
            {hoursStatus
              ? hoursStatus.label
              : 'Confira nosso horário'}
          </span>

          <a
            href={`https://wa.me/${SITE_CONFIG.whatsapp.number}`}
            target="_blank"
            rel="noopener noreferrer"
            className={
              styles.trustBarItem
            }
          >
            {formatPhone(
              SITE_CONFIG.whatsapp.number.replace(
                /^55/,
                ''
              )
            )}
          </a>

          <span
            className={
              styles.trustBarItem
            }
          >
            {SITE_CONFIG.payment.accepted
              .map(
                (method) =>
                  method.label
              )
              .join(' · ')}
          </span>

        </div>

      </header>

      {cartNotice && (
        <p className={styles.cartNotice} role="status">
          {cartNotice}
        </p>
      )}

      {/* =====================================================
          CATEGORIAS
          ===================================================== */}

      <nav
        className={
          styles.categoryNav
        }
        aria-label="Categorias do cardápio"
      >

        <div
          className={
            styles.categoryNavInner
          }
          ref={categoryNavRef}
        >

          {categories.map(
            (category) => (

              <button
                key={category.id}
                type="button"
                data-category={category.slug}
                className={`
                  ${styles.categoryLink}
                  ${
                    activeCategory ===
                    category.slug
                      ? styles.categoryActive
                      : ''
                  }
                `}
                onClick={() =>
                  selectCategory(
                    category.slug
                  )
                }
                aria-pressed={
                  activeCategory ===
                  category.slug
                }
              >
                {category.name}
              </button>

            )
          )}

        </div>

      </nav>

      {/* =====================================================
          PRODUTOS
          ===================================================== */}

      <div
        className={styles.menu}
      >

        {activeCategoryData && (

          <section
            className={
              styles.categorySection
            }
            onPointerDown={(event) => {
              categorySwipeStart.current = event.pointerType === 'touch'
                ? { x: event.clientX, y: event.clientY }
                : null
            }}
            onPointerUp={(event) => {
              if (event.pointerType === 'touch') finishCategorySwipe(event.clientX, event.clientY)
            }}
            onPointerCancel={() => {
              categorySwipeStart.current = null
            }}
          >

            <div
              className={
                styles.categoryHeader
              }
            >

              <div
                className={
                  styles.categoryHeading
                }
              >

                <span
                  className={
                    styles.categoryNumber
                  }
                >
                  {String(
                    activeCategoryData.sort_order +
                      1
                  ).padStart(
                    2,
                    '0'
                  )}
                </span>

                <h2>
                  {
                    activeCategoryData.name
                  }
                </h2>

              </div>

              <span
                className={
                  styles.categoryCount
                }
              >
                {
                  activeProducts.length
                }
              </span>

            </div>

            <div
              className={
                styles.productList
              }
            >

              {activeProducts.map(
                (product) => (

                  <article
                    key={
                      product.id
                    }
                    className={`
                      ${styles.productRow}
                      ${!product.image_url ? styles.productRowNoImage : ''}
                      ${
                        product.featured
                          ? styles.featuredRow
                          : ''
                      }
                    `}
                  >

                    {product.image_url && (

                      <button
                        type="button"
                        className={
                          styles.thumbnail
                        }
                        onClick={() =>
                          openProduct(
                            product
                          )
                        }
                        aria-label={`Ver ${product.name}`}
                      >
                        <Image
                          src={
                            product.image_url
                          }
                          alt=""
                          width={64}
                          height={64}
                          unoptimized
                          loading="lazy"
                        />
                      </button>

                    )}

                    <button
                      type="button"
                      className={
                        styles.productMain
                      }
                      onClick={() =>
                        openProduct(
                          product
                        )
                      }
                    >

                      <div
                        className={
                          styles.productNameLine
                        }
                      >

                        <h3>
                          {
                            product.name
                          }
                        </h3>

                        {product.featured && (

                          <span
                            className={
                              styles.featuredTag
                            }
                          >
                            Destaque
                          </span>

                        )}

                      </div>

                      {product.description && (

                        <p>
                          {
                            product.description
                          }
                        </p>

                      )}

                      <span className={styles.detailsHint}>
                        Ver detalhes <span aria-hidden="true">↗</span>
                      </span>

                    </button>

                    <strong
                      className={
                        styles.price
                      }
                    >
                      {formatPrice(
                        Number(
                          product.price
                        )
                      )}
                    </strong>

                    <button
                      type="button"
                      className={
                        styles.addQuick
                      }
                      onClick={() =>
                        addProductQuick(
                          product
                        )
                      }
                      aria-label={`Adicionar ${product.name} ao carrinho`}
                    >
                      +
                    </button>

                  </article>

                )
              )}

            </div>

          </section>

        )}

      </div>

      {/* =====================================================
          FOOTER
          ===================================================== */}

      <footer
        className={styles.footer}
      >

        <div
          className={
            styles.footerLine
          }
        />

        <div
          className={
            styles.footerContent
          }
        >

          <span>
            BRASÃO BURGER
          </span>

          <span>
            TAUBATÉ · SP
          </span>

          <Link href="/">
            Início ↗
          </Link>

        </div>

      </footer>

      {/* =====================================================
          BARRA FIXA DO CARRINHO
          ===================================================== */}

      {cartQuantity > 0 &&
        !cartOpen && (

          <div
            className={
              styles.cartBarWrap
            }
          >

            <button
              type="button"
              className={
                styles.cartBar
              }
                onClick={openCart}
              aria-label="Abrir carrinho"
            >

              <span
                className={
                  styles.cartBarIcon
                }
              >
                🛒
              </span>

              <span
                className={
                  styles.cartBarInfo
                }
              >

                <span
                  className={
                    styles.cartBarLabel
                  }
                >
                  Seu pedido
                </span>

                <strong>
                  {cartQuantity}{' '}
                  {cartQuantity ===
                  1
                    ? 'item'
                    : 'itens'}
                </strong>

              </span>

              <span
                className={
                  styles.cartBarTotal
                }
              >
                {formatPrice(
                  cartTotal
                )}
              </span>

              <span
                className={
                  styles.cartBarArrow
                }
              >
                →
              </span>

            </button>

          </div>

        )}

      {/* =====================================================
          MODAL DO PRODUTO
          ===================================================== */}

      {selectedProduct && (

        <div
          className={
            styles.modalBackdrop
          }
          onMouseDown={(
            event
          ) => {

            if (
              event.target ===
              event.currentTarget
            ) {
              closeProduct()
            }

          }}
        >

          <div
            ref={productDialogRef}
            className={`${styles.modal} ${!selectedProduct.image_url ? styles.modalNoImage : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-title"
            tabIndex={-1}
          >

            <button
              type="button"
              className={
                styles.closeButton
              }
              onClick={
                closeProduct
              }
              aria-label="Fechar detalhes"
            >
              ×
            </button>

            {selectedProduct.image_url && (

              <div
                className={
                  styles.modalImage
                }
              >
                <Image
                  src={
                    selectedProduct.image_url
                  }
                  alt={
                    selectedProduct.name
                  }
                  width={1200}
                  height={800}
                  unoptimized
                />
              </div>

            )}

            <div
              className={
                styles.modalContent
              }
            >

              <span
                className={
                  styles.modalCategory
                }
              >
                {getCategoryName(
                  selectedProduct.category_id
                )}
              </span>

              <h2 id="product-title">
                {
                  selectedProduct.name
                }
              </h2>

              {selectedProduct.description && (

                <p
                  className={
                    styles.modalDescription
                  }
                >
                  {
                    selectedProduct.description
                  }
                </p>

              )}

              <div
                className={
                  styles.modalPrice
                }
              >
                {formatPrice(
                  Number(
                    selectedProduct.price
                  )
                )}
              </div>

              <div
                className={
                  styles.quantityArea
                }
              >

                <span>
                  Quantidade
                </span>

                <div
                  className={
                    styles.quantityControl
                  }
                >

                  <button
                    type="button"
                    onClick={
                      decreaseQuantity
                    }
                    aria-label="Diminuir quantidade"
                  >
                    −
                  </button>

                  <strong>
                    {quantity}
                  </strong>

                  <button
                    type="button"
                    onClick={
                      increaseQuantity
                    }
                    disabled={quantity >= MAX_ITEM_QUANTITY}
                    aria-label="Aumentar quantidade"
                  >
                    +
                  </button>

                </div>

              </div>

              <div
                className={
                  styles.total
                }
              >

                <span>
                  Total
                </span>

                <strong>
                  {formatPrice(
                    Number(
                      selectedProduct.price
                    ) *
                      quantity
                  )}
                </strong>

              </div>

              <button
                type="button"
                className={
                  styles.addButton
                }
                onClick={
                  addSelectedProduct
                }
              >
                <span>
                  Adicionar ao pedido
                </span>

                <strong>
                  →
                </strong>
              </button>

            </div>

          </div>

        </div>

      )}

      {/* =====================================================
          CARRINHO / CHECKOUT
          ===================================================== */}

      {cartOpen && (

        <div
          className={
            styles.cartBackdrop
          }
          onMouseDown={(
            event
          ) => {

            if (
              event.target !==
              event.currentTarget
            ) {
              return
            }

            if (
              checkoutStep !==
              'cart'
            ) {
              backToCart()
              return
            }

            setCartOpen(false)
          }}
        >

          <aside
            ref={cartDialogRef}
            className={
              styles.cartPanel
            }
            role="dialog"
            aria-modal="true"
            aria-labelledby="cart-title"
            tabIndex={-1}
            onFocusCapture={(event) => {
              const target = event.target
              if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
                window.setTimeout(() => target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250)
              }
            }}
          >

            {/* =================================================
                PROGRESSO DO CHECKOUT
                =================================================

                Visível somente durante as etapas de
                checkout (telefone, dados, entrega,
                pagamento). Não aparece no carrinho
                nem na tela de confirmação.
                ================================================= */}

            {checkoutStepIndex !==
              -1 && (

              <div
                className={
                  styles.checkoutProgress
                }
              >

                <div
                  className={
                    styles.checkoutProgressBar
                  }
                >

                  <span
                    className={
                      styles.checkoutProgressLabel
                    }
                  >
                    Etapa{' '}
                    {checkoutStepIndex +
                      1}{' '}
                    de{' '}
                    {
                      CHECKOUT_FLOW_STEPS.length
                    }
                  </span>

                  <div
                    className={
                      styles.checkoutProgressTrack
                    }
                    role="progressbar"
                    aria-valuenow={
                      checkoutStepIndex +
                      1
                    }
                    aria-valuemin={1}
                    aria-valuemax={
                      CHECKOUT_FLOW_STEPS.length
                    }
                  >
                    <div
                      className={
                        styles.checkoutProgressFill
                      }
                      style={{
                        width: `${
                          ((checkoutStepIndex +
                            1) /
                            CHECKOUT_FLOW_STEPS.length) *
                          100
                        }%`,
                      }}
                    />
                  </div>

                </div>

                <div
                  className={
                    styles.checkoutProgressSummary
                  }
                >
                  <span>
                    {cartQuantity}{' '}
                    {cartQuantity === 1
                      ? 'item'
                      : 'itens'}
                  </span>

                  <strong>
                    {formatPrice(
                      cartTotal
                    )}
                  </strong>
                </div>

              </div>

            )}

            {/* =================================================
                CARRINHO
                ================================================= */}

            {checkoutStep ===
              'cart' && (

              <>

                {cartNotice && (
                  <p className={styles.cartNotice} role="status">
                    {cartNotice}
                  </p>
                )}

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

                    <h2 id="cart-title">
                      Carrinho
                    </h2>

                  </div>

                  <button
                    type="button"
                    className={
                      styles.cartClose
                    }
                    onClick={() =>
                      setCartOpen(
                        false
                      )
                    }
                    aria-label="Fechar carrinho"
                  >
                    ×
                  </button>

                </div>

                <div
                  className={
                    styles.cartItems
                  }
                >

                  {cart.map(
                    (item) => (

                      <article
                        key={
                          item.product.id
                        }
                        className={
                          styles.cartItem
                        }
                      >

                        {item.product.image_url && (

                          <div
                            className={
                              styles.cartItemImage
                            }
                          >
                            <Image
                              src={
                                item.product.image_url
                              }
                              alt=""
                              width={58}
                              height={58}
                              unoptimized
                            />
                          </div>

                        )}

                        <div
                          className={
                            styles.cartItemMain
                          }
                        >

                          <h3>
                            {
                              item.product.name
                            }
                          </h3>

                          <span>
                            {formatPrice(
                              Number(
                                item
                                  .product
                                  .price
                              )
                            )}
                          </span>

                          <div
                            className={
                              styles.cartItemControls
                            }
                          >

                            <div
                              className={
                                styles.cartQuantity
                              }
                            >

                              <button
                                type="button"
                                onClick={() =>
                                  decreaseCartItem(
                                    item
                                      .product
                                      .id
                                  )
                                }
                                aria-label={`Diminuir ${item.product.name}`}
                              >
                                −
                              </button>

                              <strong>
                                {
                                  item.quantity
                                }
                              </strong>

                              <button
                                type="button"
                                onClick={() =>
                                  increaseCartItem(
                                    item
                                      .product
                                      .id
                                  )
                                }
                                disabled={item.quantity >= MAX_ITEM_QUANTITY}
                                aria-label={`Aumentar ${item.product.name}`}
                              >
                                +
                              </button>

                            </div>

                            <button
                              type="button"
                              className={
                                styles.removeItem
                              }
                              onClick={() =>
                                removeCartItem(
                                  item
                                    .product
                                    .id
                                )
                              }
                            >
                              Remover
                            </button>

                          </div>

                        </div>

                        <strong
                          className={
                            styles.cartItemTotal
                          }
                        >
                          {formatPrice(
                            Number(
                              item
                                .product
                                .price
                            ) *
                              item.quantity
                          )}
                        </strong>

                      </article>

                    )
                  )}

                </div>

                <div
                  className={
                    styles.cartFooter
                  }
                >

                  <div
                    className={
                      styles.paymentMethodsPreview
                    }
                  >
                    <span>
                      Formas de pagamento:
                    </span>

                    <strong>
                      {SITE_CONFIG.payment.accepted
                        .map(
                          (
                            method
                          ) =>
                            method.label
                        )
                        .join(
                          ' · '
                        )}
                    </strong>
                  </div>

                  <div
                    className={
                      styles.cartSummary
                    }
                  >

                    <span>
                      Total do pedido
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
                    <span>
                      Continuar pedido
                    </span>

                    <strong>
                      →
                    </strong>
                  </button>

                  <button
                    type="button"
                    className={
                      styles.clearCartButton
                    }
                    onClick={
                      clearCart
                    }
                  >
                    Limpar carrinho
                  </button>

                </div>

              </>

            )}

            {/* =================================================
                WHATSAPP
                ================================================= */}

            {checkoutStep ===
              'phone' && (

              <div
                className={
                  styles.checkoutScreen
                }
              >

                <div
                  className={
                    styles.checkoutHeader
                  }
                >

                  <button
                    type="button"
                    className={
                      styles.checkoutBack
                    }
                    onClick={
                      backToCart
                    }
                  >
                    ← Voltar
                  </button>

                  <span
                    className={
                      styles.cartEyebrow
                    }
                  >
                    FINALIZAR PEDIDO
                  </span>

                  <h2>
                    Acesse seu cadastro
                  </h2>

                  <p>
                    Entre com sua conta Google para carregar os dados salvos. O login é opcional.
                  </p>

                </div>

                <div className={styles.customerForm}>
                  {authReady && customerAccessToken && <p role="status">Conta conectada{authenticatedName ? ` como ${authenticatedName}` : ''}. Os dados salvos serão carregados ao continuar.</p>}
                  {!authReady && <p role="status">Verificando sua sessão…</p>}
                  <p>O login é opcional e não bloqueia o pedido. Você também pode continuar como visitante.</p>
                  {customerError && <p className={styles.customerError} role="status">{customerError}</p>}
                  {authReady && !customerAccessToken && <button type="button" className={styles.customerPrimaryButton} onClick={signInWithGoogle} disabled={customerLoading}>
                    {customerLoading ? 'Conectando...' : 'Continuar com Google'}
                  </button>}
                  <button type="button" className={styles.checkoutSecondaryButton} onClick={continueWithoutSignIn} disabled={customerLoading || !authReady}>
                    Continuar sem entrar
                  </button>
                </div>

              </div>

            )}

            {/* =================================================
                CLIENTE
                ================================================= */}

            {checkoutStep ===
              'customer' && (

              <div
                className={
                  styles.checkoutScreen
                }
              >

                <div
                  className={
                    styles.checkoutHeader
                  }
                >

                  <button
                    type="button"
                    className={
                      styles.checkoutBack
                    }
                    onClick={() =>
                      setCheckoutStep(
                        'delivery'
                      )
                    }
                  >
                    ← Voltar
                  </button>

                  <span
                    className={
                      styles.cartEyebrow
                    }
                  >
                    {customerFound
                      ? 'CADASTRO ENCONTRADO'
                      : 'NOVO CADASTRO'}
                  </span>

                  <h2>
                    {customerFound
                      ? 'Confira seus dados.'
                      : 'Seus dados.'}
                  </h2>

                  <p>
                    {deliveryMethod ===
                    'pickup'
                      ? 'Precisamos apenas do seu nome e WhatsApp para confirmar a retirada.'
                      : customerFound
                        ? 'Encontramos seu cadastro. Confira se está tudo correto.'
                        : 'Precisamos destes dados para entregar seu pedido.'}
                  </p>

                </div>

                {/* =============================================
                    RESUMO CONDENSADO
                    =============================================

                    Mostrado quando encontramos um cliente
                    já cadastrado, para não obrigar a
                    reescrever todos os dados de novo.
                    ============================================= */}

                {customerFound &&
                  !showCustomerForm && (

                  <div
                    className={
                      styles.customerConfirmSummary
                    }
                  >

                    <div
                      className={
                        styles.customerConfirmSummaryList
                      }
                    >

                      <div
                        className={
                          styles.customerConfirmSummaryRow
                        }
                      >
                        <span>
                          Nome
                        </span>
                        <strong>
                          {
                            customerForm.name
                          }
                        </strong>
                      </div>

                      <div
                        className={
                          styles.customerConfirmSummaryRow
                        }
                      >
                        <span>
                          WhatsApp
                        </span>
                        <strong>
                          {formatPhone(
                            customerForm.phone
                          )}
                        </strong>
                      </div>

                      {deliveryMethod ===
                        'delivery' && (

                        <>

                          <div
                            className={
                              styles.customerConfirmSummaryRow
                            }
                          >
                            <span>
                              Endereço
                            </span>
                            <strong>
                              {
                                customerForm.address
                              }
                              ,{' '}
                              {
                                customerForm.number
                              }
                              {customerForm.complement
                                ? ` — ${customerForm.complement}`
                                : ''}
                            </strong>
                          </div>

                          <div
                            className={
                              styles.customerConfirmSummaryRow
                            }
                          >
                            <span>
                              Bairro
                            </span>
                            <strong>
                              {
                                customerForm.neighborhood
                              }
                            </strong>
                          </div>

                          {customerForm.reference.trim() && (

                            <div
                              className={
                                styles.customerConfirmSummaryRow
                              }
                            >
                              <span>
                                Referência
                              </span>
                              <strong>
                                {
                                  customerForm.reference
                                }
                              </strong>
                            </div>

                          )}

                        </>

                      )}

                    </div>

                    {customerError && (

                      <p
                        className={
                          styles.customerError
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
                        styles.customerPrimaryButton
                      }
                      onClick={
                        saveCustomer
                      }
                      disabled={customerSaving}
                    >
                      {customerSaving ? 'Salvando...' : 'Confirmar dados →'}
                    </button>

                    <button
                      type="button"
                      className={
                        styles.customerEditButton
                      }
                      onClick={() =>
                        setShowCustomerForm(
                          true
                        )
                      }
                    >
                      Editar dados
                    </button>

                  </div>

                )}

                {/* =============================================
                    FORMULÁRIO COMPLETO
                    =============================================

                    Mostrado para clientes novos, ou quando
                    um cliente cadastrado pede para editar
                    os dados encontrados.
                    ============================================= */}

                {(!customerFound ||
                  showCustomerForm) && (

                <div
                  className={
                    styles.customerForm
                  }
                >

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
                        customerForm.name
                      }
                      onChange={(
                        event
                      ) =>
                        updateCustomerField(
                          'name',
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
                      WhatsApp
                    </span>

                    <input
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel"
                      value={formatPhone(
                        customerForm.phone
                      )}
                      onChange={(
                        event
                      ) =>
                        updateCustomerField(
                          'phone',
                          normalizePhone(
                            event
                              .target
                              .value
                          )
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
                          placeholder="Rua, avenida..."
                          value={
                            customerForm.address
                          }
                          onChange={(
                            event
                          ) =>
                            updateCustomerField(
                              'address',
                              event.target
                                .value
                            )
                          }
                        />
                      </label>

                      <div
                        className={
                          styles.customerFieldGrid
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
                              customerForm.number
                            }
                            onChange={(
                              event
                            ) =>
                              updateCustomerField(
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
                          </span>

                          <input
                  type="text"
                  autoComplete="address-line2"
                  maxLength={120}
                  placeholder="Apto, casa..."
                  value={
                    customerForm.complement

                            }
                            onChange={(
                              event
                            ) =>
                              updateCustomerField(
                                'complement',
                                event.target
                                  .value
                              )
                            }
                          />
                        </label>

                      </div>

                      <label className={styles.customerField}>
                        <span>CEP</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="postal-code"
                          placeholder="00000-000"
                          maxLength={9}
  value={customerForm.zipCode.length > 5 ? `${customerForm.zipCode.slice(0, 5)}-${customerForm.zipCode.slice(5)}` : customerForm.zipCode}
  onChange={(event) => updateCustomerField('zipCode', event.target.value.replace(/\D/g, '').slice(0, 8))}

                        />
                      </label>

                      <div className={styles.customerFieldGrid}>
                        <label className={styles.customerField}>
                          <span>Cidade</span>
                          <input type="text" autoComplete="address-level2" value={customerForm.city} onChange={(event) => updateCustomerField('city', event.target.value)} />
                        </label>
                        <label className={styles.customerField}>
                          <span>UF</span>
                          <input type="text" autoComplete="address-level1" maxLength={2} value={customerForm.state} onChange={(event) => updateCustomerField('state', event.target.value.toUpperCase())} />
                        </label>
                      </div>
                      {zipLookupStatus === 'loading' && <p role="status">Consultando CEP…</p>}
                      {zipLookupStatus === 'error' && <p role="status">Não foi possível localizar o CEP automaticamente. Confira o endereço manualmente.</p>}

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
                            customerForm.neighborhood
                          }
                          onChange={(
                            event
                          ) =>
                            updateCustomerField(
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
                  inputMode="numeric"
                  autoComplete="address-line2"
                  maxLength={30}
                  placeholder="123"
                  value={
                    customerForm.number

                        }
                      </strong>
                    </div>

                    <div>
                      <span>
                        Bairro
                      </span>

                      <strong>
                        {
                          customerForm.neighborhood
                        }
                      </strong>
                    </div>

                  </div>

                )}

                <button
                  type="button"
                  className={
                    styles.customerPrimaryButton
                  }
                  onClick={
                    continueFromDelivery
                  }
                >
                  Continuar →
                </button>

              </div>

            )}

            {/* =================================================
                PAGAMENTO
                ================================================= */}

            {checkoutStep ===
              'payment' && (

              <div
                className={
                  styles.checkoutScreen
                }
              >

                <div
                  className={
                    styles.checkoutHeader
                  }
                >

                  <button
                    type="button"
                    className={
                      styles.checkoutBack
                    }
                    onClick={() =>
                      setCheckoutStep(
                        'customer'
                      )
                    }
                  >
                    ← Voltar
                  </button>

                  <span
                    className={
                      styles.cartEyebrow
                    }
                  >
                    PAGAMENTO
                  </span>

                  <h2>
                    Como você vai pagar?
                  </h2>

                  <p>
                    Total do pedido: <strong>{formatPrice(orderTotal)}</strong>
                  </p>

                </div>

                {customerError && (
                  <p className={styles.customerError} role="status">
                    {customerError}
                  </p>
                )}

                <div className={styles.orderTotals} aria-label="Resumo do pedido">
                  <div><span>Subtotal</span><strong>{formatPrice(cartTotal)}</strong></div>
                  {deliveryMethod === 'delivery' && <div><span>{deliveryQuote.ok && deliveryQuote.zone ? `Zona: ${deliveryQuote.zone.name}` : 'Taxa de entrega'}</span><strong>{displayedDeliveryFee}</strong></div>}
                  <div className={styles.orderGrandTotal}><span>Total</span><strong>{displayedOrderTotal}</strong></div>
                </div>

                <div
                  className={
                    styles.checkoutOptions
                  }
                >

                  {ACCEPTED_PAYMENT_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`
                        ${styles.checkoutOption}
                        ${
                          paymentMethod === option.id
                            ? styles.checkoutOptionActive
                            : ''
                        }
                      `}
                      aria-pressed={paymentMethod === option.id}
                      onClick={() =>
                        setPaymentMethod(option.id)
                      }
                    >

                      <span
                        className={
                          styles.checkoutOptionIcon
                        }
                      >
                        {option.icon}
                      </span>

                      <span>
                        <strong>
                          {option.label}
                        </strong>

                        <small>
                          {option.description}
                        </small>
                      </span>

                      <span>
                        {paymentMethod ===
                        option.id
                          ? '✓'
                          : ''}
                      </span>

                    </button>
                  ))}

                </div>

                {paymentMethod ===
                  'pix' && (
                  renderPixInstructions()
                )}

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
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="Ex.: 100,00"
                      value={
                        changeFor
                      }
                      onChange={(
                        event
                      ) =>
                        setChangeFor(
                          formatChange(
                            event.target
                              .value
                          )
                        )
                      }
                    />

                  </label>

                )}

                {customerError && (

                  <p
                    className={
                      styles.customerError
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
                    styles.customerPrimaryButton
                  }
                  onClick={
                    continueToConfirmation
                  }
                >
                  Revisar pedido →
                </button>

              </div>

            )}

            {/* =================================================
                CONFIRMAÇÃO
                ================================================= */}

            {checkoutStep ===
              'confirmed' && (

              <div
                className={
                  styles.checkoutScreen
                }
              >

                <div
                  className={
                    styles.checkoutSuccess
                  }
                >

                  <span
                    className={
                      styles.checkoutSuccessMark
                    }
                  >
                    ✓
                  </span>

                  <span
                    className={
                      styles.cartEyebrow
                    }
                  >
                    PEDIDO PRONTO
                  </span>

                  <h2>
                    Confira tudo.
                  </h2>

                  <p>
                    Revise os dados antes de
                    enviar seu pedido para o
                    Brasão Burger.
                  </p>

                </div>

                <div
                  className={
                    styles.customerSummary
                  }
                >

                  <div>
                    <span>
                      Cliente
                    </span>

                    <strong>
                      {
                        customerForm.name
                      }
                    </strong>
                  </div>

                  <div>
                    <span>
                      Recebimento
                    </span>

                    <strong>
                      {deliveryMethod ===
                      'delivery'
                        ? 'Entrega'
                        : 'Retirada no local'}
                    </strong>
                  </div>

                  {deliveryMethod ===
                    'delivery' && (

                    <div>
                      <span>
                        Endereço
                      </span>

                      <strong>
                        {
                          customerForm.address
                        },{' '}
                        {
                          customerForm.number
                        }{' '}
                        —{' '}
                        {
                          customerForm.neighborhood
                        }
                      </strong>
                    </div>

                  )}

                  <div>
                    <span>
                      Pagamento
                    </span>

                    <strong>
                      {ACCEPTED_PAYMENT_OPTIONS.find((option) => option.id === paymentMethod)?.label ?? ''}
                    </strong>
                  </div>

                  {paymentMethod ===
                    'cash' &&
                    changeFor.trim() && (

                    <div>
                      <span>
                        Troco para
                      </span>

                      <strong>
                        R$ {changeFor}
                      </strong>
                    </div>

                  )}

                  <div><span>Subtotal</span><strong>{formatPrice(cartTotal)}</strong></div>
                  {deliveryMethod === 'delivery' && <div><span>{deliveryQuote.ok && deliveryQuote.zone ? `Zona: ${deliveryQuote.zone.name}` : 'Taxa de entrega'}</span><strong>{displayedDeliveryFee}</strong></div>}
                  <div><span>Total do pedido</span><strong>{displayedOrderTotal}</strong></div>

                </div>

                {paymentMethod ===
                  'pix' && (
                  renderPixInstructions()
                )}

                <div
                  className={
                    styles.orderPreview
                  }
                >

                  <span>
                    ITENS
                  </span>

                  {cart.map(
                    (item) => (

                      <div
                        key={
                          item.product.id
                        }
                      >

                        <span>
                          {
                            item.quantity
                          }x{' '}
                          {
                            item
                              .product
                              .name
                          }
                        </span>

                        <strong>
                          {formatPrice(
                            Number(
                              item
                                .product
                                .price
                            ) *
                              item.quantity
                          )}
                        </strong>

                      </div>

                    )
                  )}

                </div>

                {customerError && (

                  <p
                    className={
                      styles.customerError
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
                    styles.customerPrimaryButton
                  }
                  onClick={
                    sendOrderToWhatsApp
                  }
                  disabled={orderSaving}
                >
                  {orderSaving ? 'Salvando pedido...' : 'Enviar pedido pelo WhatsApp →'}
                </button>

                <button
                  type="button"
                  className={
                    styles.checkoutSecondaryButton
                  }
                  onClick={() =>
                    setCheckoutStep(
                      'payment'
                    )
                  }
                >
                  Voltar e editar
                </button>

              </div>

            )}

          </aside>

        </div>

      )}

    </main>
  )
}
