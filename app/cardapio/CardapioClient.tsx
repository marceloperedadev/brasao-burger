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
  id: number
  name: string
  phone: string
  address: string
  number: string
  complement: string | null
  neighborhood: string
  reference: string | null
}

type CustomerForm = {
  name: string
  phone: string
  address: string
  number: string
  complement: string
  neighborhood: string
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
 * Calculada no cliente (não no servidor) para evitar
 * inconsistência de fuso horário entre o servidor e o
 * navegador da pessoa. É chamada dentro de um useEffect,
 * então só roda depois que a página já carregou.
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

function getTodayHoursStatus(): HoursStatus {
  const now = new Date()

  const dayKey =
    WEEKDAY_KEYS[now.getDay()]

  const today =
    SITE_CONFIG.openingHours[dayKey]

  if (
    !today ||
    today.closed ||
    !today.open ||
    !today.close
  ) {
    return {
      isOpen: false,
      label: 'Fechado hoje',
    }
  }

  const [openHour, openMinute] =
    today.open
      .split(':')
      .map(Number)

  const [closeHour, closeMinute] =
    today.close
      .split(':')
      .map(Number)

  const nowMinutes =
    now.getHours() * 60 +
    now.getMinutes()

  const openMinutes =
    openHour * 60 + openMinute

  const closeMinutes =
    closeHour * 60 + closeMinute

  const isOpen =
    nowMinutes >= openMinutes &&
    nowMinutes < closeMinutes

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

  /*
   * =========================================================
   * PARÂMETROS DA URL
   * =========================================================
   */

  const categoryFromUrl =
    searchParams.get('categoria')

  const productFromUrl =
    searchParams.get('produto')

  const [selectedProduct, setSelectedProduct] =
    useState<Product | null>(null)

  const [quantity, setQuantity] =
    useState(1)

  const [cart, setCart] =
    useState<CartItem[]>([])

  const [cartOpen, setCartOpen] =
    useState(false)

  const [activeCategory, setActiveCategory] =
    useState(
      categories[0]?.slug ?? ''
    )

  /*
   * =========================================================
   * SELECIONAR CATEGORIA VINDO DA URL
   * =========================================================
   */

  useEffect(() => {
    if (categories.length === 0) {
      return
    }

    if (categoryFromUrl) {
      const categoryExists =
        categories.some(
          (category) =>
            category.slug ===
            categoryFromUrl
        )

      if (categoryExists) {
        setActiveCategory(
          categoryFromUrl
        )

        return
      }
    }

    setActiveCategory(
      (current) =>
        categories.some(
          (category) =>
            category.slug ===
            current
        )
          ? current
          : categories[0].slug
    )
  }, [
    categoryFromUrl,
    categories,
  ])

  /*
   * =========================================================
   * ABRIR PRODUTO VINDO DA URL
   * =========================================================
   */

  useEffect(() => {
    if (!productFromUrl) {
      return
    }

    if (
      products.length === 0 ||
      categories.length === 0
    ) {
      return
    }

    const productId =
      Number(productFromUrl)

    if (
      !Number.isInteger(productId)
    ) {
      return
    }

    const product =
      products.find(
        (item) =>
          item.id === productId
      )

    if (!product) {
      return
    }

    const productCategory =
      categories.find(
        (category) =>
          category.id ===
          product.category_id
      )

    if (productCategory) {
      setActiveCategory(
        productCategory.slug
      )
    }

    setSelectedProduct(product)
    setQuantity(1)
  }, [
    productFromUrl,
    products,
    categories,
  ])

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
      reference: '',
    })

  const [customerFound, setCustomerFound] =
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

  const [customerLoading, setCustomerLoading] =
    useState(false)

  const [customerSaving, setCustomerSaving] =
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
    useState<PaymentMethod>('pix')

  const [changeFor, setChangeFor] =
    useState('')

  /*
   * Feedback visual (troca o texto do botão
   * para "Copiado!" por alguns segundos).
   */
  const [pixKeyCopied, setPixKeyCopied] =
    useState(false)

  /*
   * Status do horário de hoje ("aberto agora" /
   * "fechado agora"), exibido na barra de confiança
   * do cardápio. Começa null e só é preenchido depois
   * de montar no navegador, para não gerar diferença
   * entre o HTML do servidor e o do cliente.
   */
  const [hoursStatus, setHoursStatus] =
    useState<HoursStatus | null>(
      null
    )

  useEffect(() => {
    setHoursStatus(
      getTodayHoursStatus()
    )
  }, [])

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
    return phone.replace(/\D/g, '')
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
   * PIX — COPIAR CHAVE
   * =========================================================
   */

  async function copyPixKey() {
    const pixKey =
      SITE_CONFIG.payment.pixKey

    if (!pixKey) {
      return
    }

    try {
      await navigator.clipboard.writeText(
        pixKey
      )

      setPixKeyCopied(true)

      setTimeout(() => {
        setPixKeyCopied(false)
      }, 2500)
    } catch (error) {
      console.error(
        'Erro ao copiar a chave Pix:',
        error
      )
    }
  }

  /*
   * =========================================================
   * PRODUTO
   * =========================================================
   */

  function openProduct(
    product: Product
  ) {
    setSelectedProduct(product)
    setQuantity(1)
  }

  function closeProduct() {
    setSelectedProduct(null)
    setQuantity(1)
  }

  function increaseQuantity() {
    setQuantity(
      (current) => current + 1
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
                    item.quantity +
                    amount,
                }
              : item
        )
      }

      return [
        ...currentCart,
        {
          product,
          quantity: amount,
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
                  item.quantity + 1,
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
    setCart([])

    setCheckoutStep('cart')

    setCustomerFound(false)

    setShowCustomerForm(false)

    setCustomerError('')

    setCustomerForm({
      name: '',
      phone: '',
      address: '',
      number: '',
      complement: '',
      neighborhood: '',
      reference: '',
    })

    setDeliveryMethod('delivery')
    setPaymentMethod('pix')
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
        (total, item) =>
          total +
          Number(
            item.product.price
          ) *
            item.quantity,
        0
      ),
    [cart]
  )

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

  /*
   * =========================================================
   * FORMULÁRIO
   * =========================================================
   */

  function updateCustomerField(
    field: keyof CustomerForm,
    value: string
  ) {
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
    setCheckoutStep('phone')
  }

  /*
   * =========================================================
   * BUSCAR CLIENTE
   * =========================================================
   */

  async function searchCustomer() {
    const phone =
      normalizePhone(
        customerForm.phone
      )

    if (phone.length < 10) {
      setCustomerError(
        'Digite um WhatsApp válido.'
      )

      return
    }

    setCustomerLoading(true)
    setCustomerError('')
    setCustomerFound(false)

    try {
      const response =
        await fetch(
          `/api/customer?phone=${encodeURIComponent(
            phone
          )}`,
          {
            method: 'GET',
            cache: 'no-store',
          }
        )

      const data =
        await response.json()

      if (!response.ok) {
        throw new Error(
          data?.error ||
            'Não foi possível consultar o cadastro.'
        )
      }

      if (data.customer) {
        const customer =
          data.customer as Customer

        setCustomerForm({
          name:
            customer.name ?? '',

          phone:
            customer.phone ??
            phone,

          address:
            customer.address ??
            '',

          number:
            customer.number ?? '',

          complement:
            customer.complement ??
            '',

          neighborhood:
            customer.neighborhood ??
            '',

          reference:
            customer.reference ??
            '',
        })

        setCustomerFound(true)
        setShowCustomerForm(false)
      } else {
        setCustomerForm(
          (current) => ({
            ...current,
            phone,
          })
        )

        setCustomerFound(false)
        setShowCustomerForm(true)
      }

      setCheckoutStep('delivery')
    } catch (error) {
      console.error(
        'Erro ao buscar cliente:',
        error
      )

      setCustomerError(
        error instanceof Error
          ? error.message
          : 'Não foi possível consultar o cadastro.'
      )
    } finally {
      setCustomerLoading(false)
    }
  }

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

      reference:
        customerForm.reference.trim(),
    }

    if (!payload.name) {
      setCustomerError(
        'Digite seu nome.'
      )

      return
    }

    if (phone.length < 10) {
      setCustomerError(
        'Digite um WhatsApp válido.'
      )

      return
    }

    if (requiresAddress) {
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
    }

    setCustomerSaving(true)
    setCustomerError('')

    try {
      const response =
        await fetch(
          '/api/customer',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify(
              payload
            ),
          }
        )

      const data =
        await response.json()

      if (!response.ok) {
        throw new Error(
          data?.error ||
            'Não foi possível salvar seu cadastro.'
        )
      }

      if (data.customer) {
        const customer =
          data.customer as Customer

        setCustomerForm({
          name:
            customer.name ?? '',

          phone:
            customer.phone ??
            phone,

          address:
            customer.address ??
            '',

          number:
            customer.number ?? '',

          complement:
            customer.complement ??
            '',

          neighborhood:
            customer.neighborhood ??
            '',

          reference:
            customer.reference ??
            '',
        })
      }

      /*
       * A escolha de entrega/retirada já
       * aconteceu na etapa anterior — daqui
       * vamos direto para o pagamento.
       */
      setCheckoutStep('payment')
    } catch (error) {
      console.error(
        'Erro ao salvar cliente:',
        error
      )

      setCustomerError(
        error instanceof Error
          ? error.message
          : 'Não foi possível salvar seu cadastro.'
      )
    } finally {
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

  /*
   * =========================================================
   * MENSAGEM DO WHATSAPP
   * =========================================================
   */

  function buildWhatsAppMessage() {
    const lines: string[] = []

    lines.push(
      '🍔 *NOVO PEDIDO — BRASÃO BURGER*'
    )

    lines.push('')
    lines.push('*ITENS DO PEDIDO*')

    cart.forEach((item) => {
      const itemTotal =
        Number(
          item.product.price
        ) *
        item.quantity

      lines.push(
        `${item.quantity}x ${item.product.name} — ${formatPrice(
          itemTotal
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
    lines.push('*CLIENTE*')

    lines.push(
      `Nome: ${customerForm.name}`
    )

    lines.push(
      `WhatsApp: ${formatPhone(
        customerForm.phone
      )}`
    )

    lines.push('')
    lines.push('*ENTREGA*')

    if (
      deliveryMethod ===
      'delivery'
    ) {
      lines.push(
        'Forma: Entrega'
      )

      lines.push(
        `Endereço: ${customerForm.address}, ${customerForm.number}`
      )

      if (
        customerForm.complement.trim()
      ) {
        lines.push(
          `Complemento: ${customerForm.complement}`
        )
      }

      lines.push(
        `Bairro: ${customerForm.neighborhood}`
      )

      if (
        customerForm.reference.trim()
      ) {
        lines.push(
          `Referência: ${customerForm.reference}`
        )
      }
    } else {
      lines.push(
        'Forma: Retirada no local'
      )
    }

    lines.push('')
    lines.push('*PAGAMENTO*')

    if (
      paymentMethod === 'pix'
    ) {
      lines.push(
        'Forma: Pix'
      )

      if (
        SITE_CONFIG.payment.pixKey
      ) {
        lines.push(
          `Chave Pix: ${SITE_CONFIG.payment.pixKey}`
        )
      }
    }

    if (
      paymentMethod === 'card'
    ) {
      lines.push(
        'Forma: Cartão'
      )
    }

    if (
      paymentMethod === 'cash'
    ) {
      lines.push(
        'Forma: Dinheiro'
      )

      if (changeFor.trim()) {
        lines.push(
          `Troco para: R$ ${changeFor}`
        )
      } else {
        lines.push(
          'Sem necessidade de troco'
        )
      }
    }

    lines.push('')
    lines.push(
      'Aguardo a confirmação do pedido. Obrigado!'
    )

    return lines.join('\n')
  }

  /*
   * =========================================================
   * ENVIAR PEDIDO PARA WHATSAPP
   * =========================================================
   */

  function sendOrderToWhatsApp() {
    if (cart.length === 0) {
      return
    }

    const message =
      buildWhatsAppMessage()

 const url = `https://wa.me/${SITE_CONFIG.whatsapp.number}?text=${encodeURIComponent(
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

          <a
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
          </a>

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
        >

          {categories.map(
            (category) => (

              <button
                key={category.id}
                type="button"
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
                        <img
                          src={
                            product.image_url
                          }
                          alt=""
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

          <a href="/">
            Início ↗
          </a>

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
              onClick={() =>
                setCartOpen(true)
              }
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
            className={
              styles.modal
            }
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-title"
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
                <img
                  src={
                    selectedProduct.image_url
                  }
                  alt={
                    selectedProduct.name
                  }
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
            className={
              styles.cartPanel
            }
            role="dialog"
            aria-modal="true"
            aria-labelledby="cart-title"
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
                            <img
                              src={
                                item.product.image_url
                              }
                              alt=""
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
                    Seu WhatsApp
                  </h2>

                  <p>
                    Informe seu WhatsApp para
                    encontrarmos seu cadastro.
                  </p>

                </div>

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
                      WhatsApp
                    </span>

                    <input
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel"
                      placeholder="(12) 99999-9999"
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
                      autoFocus
                    />

                  </label>

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
                      searchCustomer
                    }
                    disabled={
                      customerLoading
                    }
                  >
                    {customerLoading
                      ? 'Consultando...'
                      : 'Continuar →'}
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
                      disabled={
                        customerSaving
                      }
                    >
                      {customerSaving
                        ? 'Salvando...'
                        : 'Confirmar dados →'}
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
                          placeholder="Perto de..."
                          value={
                            customerForm.reference
                          }
                          onChange={(
                            event
                          ) =>
                            updateCustomerField(
                              'reference',
                              event.target
                                .value
                            )
                          }
                        />
                      </label>

                    </>

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
                      saveCustomer
                    }
                    disabled={
                      customerSaving
                    }
                  >
                    {customerSaving
                      ? 'Salvando...'
                      : 'Continuar →'}
                  </button>

                </div>

                )}

              </div>

            )}

            {/* =================================================
                ENTREGA
                ================================================= */}

            {checkoutStep ===
              'delivery' && (

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
                        'phone'
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
                    ENTREGA
                  </span>

                  <h2>
                    Como você vai receber?
                  </h2>

                  <p>
                    Escolha entre receber em
                    casa ou retirar no Brasão.
                  </p>

                </div>

                <div
                  className={
                    styles.checkoutOptions
                  }
                >

                  <button
                    type="button"
                    className={`
                      ${styles.checkoutOption}
                      ${
                        deliveryMethod ===
                        'delivery'
                          ? styles.checkoutOptionActive
                          : ''
                      }
                    `}
                    onClick={() =>
                      setDeliveryMethod(
                        'delivery'
                      )
                    }
                  >

                    <span
                      className={
                        styles.checkoutOptionIcon
                      }
                    >
                      🛵
                    </span>

                    <span>
                      <strong>
                        Entrega
                      </strong>

                      <small>
                        Receba no endereço
                        cadastrado
                      </small>
                    </span>

                    <span>
                      {deliveryMethod ===
                      'delivery'
                        ? '✓'
                        : ''}
                    </span>

                  </button>

                  <button
                    type="button"
                    className={`
                      ${styles.checkoutOption}
                      ${
                        deliveryMethod ===
                        'pickup'
                          ? styles.checkoutOptionActive
                          : ''
                      }
                    `}
                    onClick={() =>
                      setDeliveryMethod(
                        'pickup'
                      )
                    }
                  >

                    <span
                      className={
                        styles.checkoutOptionIcon
                      }
                    >
                      📍
                    </span>

                    <span>
                      <strong>
                        Retirada
                      </strong>

                      <small>
                        Retire no Brasão Burger
                      </small>
                    </span>

                    <span>
                      {deliveryMethod ===
                      'pickup'
                        ? '✓'
                        : ''}
                    </span>

                  </button>

                </div>

                {deliveryMethod ===
                  'delivery' &&
                  customerForm.address.trim() && (

                  <div
                    className={
                      styles.customerSummary
                    }
                  >

                    <div>
                      <span>
                        Endereço em seu cadastro
                      </span>

                      <strong>
                        {
                          customerForm.address
                        },{' '}
                        {
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
                    Total do pedido:{' '}
                    <strong>
                      {formatPrice(
                        cartTotal
                      )}
                    </strong>
                  </p>

                </div>

                <div
                  className={
                    styles.checkoutOptions
                  }
                >

                  <button
                    type="button"
                    className={`
                      ${styles.checkoutOption}
                      ${
                        paymentMethod ===
                        'pix'
                          ? styles.checkoutOptionActive
                          : ''
                      }
                    `}
                    onClick={() =>
                      setPaymentMethod(
                        'pix'
                      )
                    }
                  >

                    <span
                      className={
                        styles.checkoutOptionIcon
                      }
                    >
                      ◈
                    </span>

                    <span>
                      <strong>
                        Pix
                      </strong>

                      <small>
                        Pagamento via Pix
                      </small>
                    </span>

                    <span>
                      {paymentMethod ===
                      'pix'
                        ? '✓'
                        : ''}
                    </span>

                  </button>

                  <button
                    type="button"
                    className={`
                      ${styles.checkoutOption}
                      ${
                        paymentMethod ===
                        'cash'
                          ? styles.checkoutOptionActive
                          : ''
                      }
                    `}
                    onClick={() =>
                      setPaymentMethod(
                        'cash'
                      )
                    }
                  >

                    <span
                      className={
                        styles.checkoutOptionIcon
                      }
                    >
                      R$
                    </span>

                    <span>
                      <strong>
                        Dinheiro
                      </strong>

                      <small>
                        Pague na entrega ou
                        retirada
                      </small>
                    </span>

                    <span>
                      {paymentMethod ===
                      'cash'
                        ? '✓'
                        : ''}
                    </span>

                  </button>

                  <button
                    type="button"
                    className={`
                      ${styles.checkoutOption}
                      ${
                        paymentMethod ===
                        'card'
                          ? styles.checkoutOptionActive
                          : ''
                      }
                    `}
                    onClick={() =>
                      setPaymentMethod(
                        'card'
                      )
                    }
                  >

                    <span
                      className={
                        styles.checkoutOptionIcon
                      }
                    >
                      ▣
                    </span>

                    <span>
                      <strong>
                        Cartão
                      </strong>

                      <small>
                        Crédito ou débito
                      </small>
                    </span>

                    <span>
                      {paymentMethod ===
                      'card'
                        ? '✓'
                        : ''}
                    </span>

                  </button>

                </div>

                {paymentMethod ===
                  'pix' && (

                  <div
                    className={
                      styles.pixKeyBox
                    }
                  >

                    {SITE_CONFIG.payment
                      .pixKey ? (

                      <>

                        <span
                          className={
                            styles.pixKeyLabel
                          }
                        >
                          Chave Pix
                          {SITE_CONFIG
                            .payment
                            .pixKeyType
                            ? ` (${SITE_CONFIG.payment.pixKeyType})`
                            : ''}
                        </span>

                        <div
                          className={
                            styles.pixKeyRow
                          }
                        >
                          <strong>
                            {
                              SITE_CONFIG
                                .payment
                                .pixKey
                            }
                          </strong>

                          <button
                            type="button"
                            className={
                              styles.pixCopyButton
                            }
                            onClick={
                              copyPixKey
                            }
                          >
                            {pixKeyCopied
                              ? 'Copiado!'
                              : 'Copiar'}
                          </button>
                        </div>

                      </>

                    ) : (

                      <span
                        className={
                          styles.pixKeyLabel
                        }
                      >
                        A chave Pix será
                        enviada pelo Brasão
                        Burger assim que o
                        pedido for confirmado
                        no WhatsApp.
                      </span>

                    )}

                  </div>

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
                      {paymentMethod ===
                        'pix' &&
                        'Pix'}

                      {paymentMethod ===
                        'cash' &&
                        'Dinheiro'}

                      {paymentMethod ===
                        'card' &&
                        'Cartão'}
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

                  <div>
                    <span>
                      Total do pedido
                    </span>

                    <strong>
                      {formatPrice(
                        cartTotal
                      )}
                    </strong>
                  </div>

                </div>

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
                >
                  Enviar pedido pelo WhatsApp →
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