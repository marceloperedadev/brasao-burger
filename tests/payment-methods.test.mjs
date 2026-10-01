import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const ts = require('typescript')

const siteConfigSource = await readFile(new URL('../app/config/site.ts', import.meta.url), 'utf8')
const transpiledSiteConfig = ts.transpileModule(siteConfigSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const siteConfigModule = { exports: {} }
new Function('exports', 'module', transpiledSiteConfig)(siteConfigModule.exports, siteConfigModule)
const { SITE_CONFIG } = siteConfigModule.exports

const checkoutClient = await readFile(new URL('../app/cardapio/CardapioClient.tsx', import.meta.url), 'utf8')
const ordersRoute = await readFile(new URL('../app/api/orders/route.ts', import.meta.url), 'utf8')
const ordersMigration = await readFile(
  new URL('../supabase/migrations/202609250001_create_orders.sql', import.meta.url),
  'utf8',
)
const paymentStatusMigration = await readFile(
  new URL('../supabase/migrations/202609260009_manual_pix_payment_status.sql', import.meta.url),
  'utf8',
)

/** Value accepted by POST /api/orders for each config id in `payment.accepted`. */
const API_PAYMENT_METHODS = { pix: 'pix', dinheiro: 'cash', cartao: 'card' }

test('PIX is offered as an accepted payment method', () => {
  const accepted = SITE_CONFIG.payment.accepted
  const pix = accepted.find((method) => method.id === 'pix')

  assert.ok(pix, 'PIX must be listed in SITE_CONFIG.payment.accepted')
  assert.equal(pix.label, 'Pix')
  assert.ok(accepted.some((method) => method.id === 'dinheiro'))
  assert.ok(accepted.some((method) => method.id === 'cartao'))
})

test('PIX is paid at pickup or delivery without a key sent by the site', () => {
  assert.equal(Object.hasOwn(SITE_CONFIG.payment, 'pixKey'), false)
  assert.equal(Object.hasOwn(SITE_CONFIG.payment, 'pixKeyType'), false)
  assert.match(checkoutClient, /Pagamento via Pix na retirada ou ao entregador no recebimento/)
  assert.doesNotMatch(checkoutClient, /Chave Pix: aguardando envio|chave será enviada/i)
})

test('every accepted payment method maps to a value the orders API understands', () => {
  for (const method of SITE_CONFIG.payment.accepted) {
    assert.ok(
      Object.hasOwn(API_PAYMENT_METHODS, method.id),
      `${method.id} is not mapped to an orders API payment value`,
    )
  }
  assert.equal(API_PAYMENT_METHODS.pix, 'pix')
})

test('orders API accepts PIX only while it stays in the site config', () => {
  assert.match(ordersRoute, /paymentMethod !== 'pix'/)
  assert.match(ordersRoute, /function acceptedPayment\(method: PaymentMethod\)/)
  assert.match(ordersRoute, /SITE_CONFIG\.payment\.accepted\.some/)
  assert.match(ordersRoute, /if \(!acceptedPayment\(input\.paymentMethod\)\)/)
})

test('orders API persists the payment method chosen by the customer', () => {
  assert.match(ordersRoute, /paymentMethod: input\.paymentMethod,/)
  assert.match(ordersRoute, /create_order_atomic_checked/)
  assert.match(
    ordersMigration,
    /payment_method text not null check \(payment_method in \('pix', 'cash', 'card'\)\)/,
  )
})

test('checkout builds its payment options from the accepted configuration', () => {
  assert.match(
    checkoutClient,
    /const ACCEPTED_PAYMENT_OPTIONS[\s\S]{0,80}SITE_CONFIG\.payment\.accepted[\s\S]{0,60}\.map\(/,
  )
  assert.match(checkoutClient, /ACCEPTED_PAYMENT_OPTIONS\.map\(\(option\) =>/)
  assert.doesNotMatch(
    checkoutClient,
    /hidden=\{!isPaymentMethodAccepted/,
    'payment options must be derived from the config instead of hidden per method',
  )
})

test('checkout explains manual PIX payment at fulfillment', () => {
  assert.match(checkoutClient, /function renderPixInstructions\(\)/)
  assert.match(checkoutClient, /Pagamento via Pix na retirada ou ao entregador no recebimento/)
  assert.match(checkoutClient, /confirmação do recebimento pela loja/)
  assert.doesNotMatch(checkoutClient, /SITE_CONFIG\.payment\.pixKey/)
  assert.match(
    checkoutClient,
    /renderPixInstructions\(\)/,
    'the PIX instructions must be reused in checkout and review',
  )
})

test('the WhatsApp message carries the PIX method to the store', () => {
  const messageStart = checkoutClient.indexOf('function buildWhatsAppMessage')
  const messageEnd = checkoutClient.indexOf('async function sendOrderToWhatsApp')
  const buildWhatsAppMessage = checkoutClient.slice(messageStart, messageEnd)

  assert.notEqual(messageStart, -1)
  assert.ok(messageEnd > messageStart)
  assert.match(buildWhatsAppMessage, /order\.paymentMethod === 'pix'/)
  assert.match(buildWhatsAppMessage, /lines\.push\('Forma: Pix'\)/)
  assert.match(buildWhatsAppMessage, /Pagamento: Pix ao entregador/)
  assert.match(buildWhatsAppMessage, /Pagamento: Pix na retirada/)
})

test('unknown API errors are translated instead of shown in English', () => {
  assert.match(checkoutClient, /function translateOrderError\(message: string\)/)
  assert.match(checkoutClient, /translateOrderError\(result\.error\)/)
  assert.match(checkoutClient, /'This payment method is unavailable\.':/)
})

test('manual PIX orders start as unpaid and the migration is not destructive', () => {
  assert.match(
    paymentStatusMigration,
    /add column if not exists payment_status text not null default 'pending'/,
  )
  assert.match(
    paymentStatusMigration,
    /payment_status in \('pending', 'confirmed', 'cancelled', 'refunded'\)/,
  )
  assert.doesNotMatch(paymentStatusMigration, /update\s+public\.orders/i)
  assert.doesNotMatch(paymentStatusMigration, /delete\s+from/i)
  assert.doesNotMatch(paymentStatusMigration, /drop\s+table/i)
})

test('creating an order never writes a paid payment status', () => {
  assert.doesNotMatch(
    ordersMigration,
    /payment_status/,
    'the order creation function must rely on the default pending status',
  )
  assert.match(ordersMigration, /insert into public\.orders \(/)
})
