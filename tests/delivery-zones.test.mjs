import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const source = await readFile(new URL('../lib/delivery-zones.ts', import.meta.url), 'utf8')
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const deliveryZonesModule = { exports: {} }
new Function('exports', 'module', transpiled)(deliveryZonesModule.exports, deliveryZonesModule)
const { calculateOrderTotal, isDeliveryQuoteSnapshotCurrent, loadDeliveryConfig, resolveDeliveryQuote } = deliveryZonesModule.exports

const activeZone = {
  zoneKey: 'very_near',
  name: 'Muito perto',
  sortOrder: 1,
  description: null,
  criteriaType: 'neighborhood',
  neighborhoods: ['Centro'],
  minimumDistanceKm: null,
  maximumDistanceKm: null,
  fee: 5,
  active: true,
  requiresManualConfirmation: false,
}

function config(overrides = {}) {
  return {
    enabled: true,
    configurationReady: true,
    minimumFee: 5,
    serviceCity: 'Taubaté',
    serviceState: 'SP',
    zones: [activeZone],
    ...overrides,
  }
}

test('accepts an active zone at the R$ 5,00 minimum and normalizes names', () => {
  const quote = resolveDeliveryQuote('delivery', 'TAUBATE', 'sp', ' centro ', config())
  assert.equal(quote.ok, true)
  assert.equal(quote.fee, 5)
  assert.equal(quote.zone.name, 'Muito perto')
})

test('accepts an active zone at R$ 5,01', () => {
  const quote = resolveDeliveryQuote('delivery', 'TAUBATE', 'SP', 'Centro', config({
    zones: [{ ...activeZone, fee: 5.01 }],
  }))
  assert.equal(quote.ok, true)
  assert.equal(quote.fee, 5.01)
})

test('rejects an active zone priced below the minimum', () => {
  const quote = resolveDeliveryQuote('delivery', 'Taubaté', 'SP', 'Centro', config({
    zones: [{ ...activeZone, fee: 4.99 }],
  }))
  assert.deepEqual(quote, { ok: false, reason: 'invalid' })
})

test('rejects zero and negative zone rates', () => {
  for (const fee of [1, 0, -0.01]) {
    assert.deepEqual(resolveDeliveryQuote('delivery', 'TAUBATE', 'SP', 'Centro', config({
      zones: [{ ...activeZone, fee }],
    })), { ok: false, reason: 'invalid' })
  }
})

test('does not resolve an inactive zone', () => {
  const quote = resolveDeliveryQuote('delivery', 'Taubaté', 'SP', 'Centro', config({
    configurationReady: false,
    zones: [{ ...activeZone, active: false }],
  }))
  assert.deepEqual(quote, { ok: false, reason: 'not_ready' })
})

test('rejects an address outside the configured city and state', () => {
  const quote = resolveDeliveryQuote('delivery', 'Tremembé', 'SP', 'Centro', config())
  assert.deepEqual(quote, { ok: false, reason: 'outside_area' })
})

test('rejects a matching city with the wrong state', () => {
  assert.deepEqual(resolveDeliveryQuote('delivery', 'TAUBATE', 'RJ', 'Centro', config()), {
    ok: false,
    reason: 'outside_area',
  })
})

test('rejects a neighborhood without an active zone', () => {
  const quote = resolveDeliveryQuote('delivery', 'Taubaté', 'SP', 'Bairro sem cadastro', config())
  assert.deepEqual(quote, { ok: false, reason: 'zone_not_found' })
})

test('rejects missing and invalid configuration', () => {
  assert.deepEqual(resolveDeliveryQuote('delivery', 'Taubaté', 'SP', 'Centro', null), {
    ok: false,
    reason: 'unavailable',
  })
  assert.deepEqual(resolveDeliveryQuote('delivery', 'Taubaté', 'SP', 'Centro', config({ minimumFee: 4 })), {
    ok: false,
    reason: 'invalid',
  })
})

test('fails closed when delivery settings cannot be read', async () => {
  const client = {
    from() {
      return {
        select() { return this },
        eq() { return this },
        maybeSingle() { return Promise.resolve({ data: null, error: new Error('database unavailable') }) },
      }
    },
  }
  await assert.rejects(loadDeliveryConfig(client), /missing or unavailable/)
})

test('fails closed when active zones cannot be read', async () => {
  const client = {
    from(table) {
      return {
        select() { return this },
        eq() { return this },
        maybeSingle() {
          return Promise.resolve({ data: {
            enabled: true,
            configuration_ready: true,
            minimum_fee: 5,
            service_city: 'Taubaté',
            service_state: 'SP',
          }, error: null })
        },
        order() { return Promise.resolve({ data: null, error: new Error(`${table} unavailable`) }) },
      }
    },
  }
  await assert.rejects(loadDeliveryConfig(client), /zones are unavailable/)
})

test('blocks delivery while configuration has not been marked ready', () => {
  const quote = resolveDeliveryQuote('delivery', 'Taubaté', 'SP', 'Centro', config({ configurationReady: false }))
  assert.deepEqual(quote, { ok: false, reason: 'not_ready' })
})

test('rejects ambiguous neighborhood mappings', () => {
  const quote = resolveDeliveryQuote('delivery', 'Taubaté', 'SP', 'Centro', config({
    zones: [activeZone, { ...activeZone, zoneKey: 'near', name: 'Perto', sortOrder: 2, fee: 7 }],
  }))
  assert.deepEqual(quote, { ok: false, reason: 'ambiguous_zone' })
})

test('pickup remains free even if delivery configuration is unavailable', () => {
  assert.deepEqual(resolveDeliveryQuote('pickup', '', '', '', null), {
    ok: true,
    fee: 0,
    zone: null,
  })
})

test('pickup remains free while delivery is disabled', () => {
  assert.deepEqual(resolveDeliveryQuote('pickup', 'TaubatÃ©', 'SP', '', config({ enabled: false })), {
    ok: true,
    fee: 0,
    zone: null,
  })
})

test('pickup zero fee is independent of zone, minimum, and delivery configuration', () => {
  assert.deepEqual(resolveDeliveryQuote('pickup', '', '', '', config({
    enabled: false,
    configurationReady: false,
    minimumFee: 999,
    zones: [],
  })), { ok: true, fee: 0, zone: null })
})

test('blocks zones requiring manual confirmation', () => {
  assert.deepEqual(resolveDeliveryQuote('delivery', 'TAUBATE', 'SP', 'Centro', config({
    zones: [{ ...activeZone, requiresManualConfirmation: true }],
  })), { ok: false, reason: 'manual_confirmation_required' })
})

test('fails closed for distance zones without a route service', () => {
  assert.deepEqual(resolveDeliveryQuote('delivery', 'TAUBATE', 'SP', 'Centro', config({
    zones: [{ ...activeZone, criteriaType: 'distance', neighborhoods: [], minimumDistanceKm: 0, maximumDistanceKm: 2 }],
  })), { ok: false, reason: 'invalid' })
})

test('uses the configured zone rate regardless of client-supplied fee data', () => {
  const quote = resolveDeliveryQuote('delivery', 'Taubaté', 'SP', 'Centro', config(), { deliveryFee: 0 })
  assert.equal(quote.ok && quote.fee, 5)
})

test('orders API does not read a delivery fee from the client request', async () => {
  const source = await readFile(new URL('../app/api/orders/route.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /(?:body|details)\.(?:deliveryFee|deliveryZone|zoneKey|fee|subtotal|total)/)
  assert.match(source, /deliveryFee = quote\.fee/)
})

test('API and order RPC ignore client subtotal and total values', async () => {
  const route = await readFile(new URL('../app/api/orders/route.ts', import.meta.url), 'utf8')
  const rpc = await readFile(new URL('../supabase/migrations/202609250001_create_orders.sql', import.meta.url), 'utf8')
  const forgedPayload = { subtotal: 0, total: 0, deliveryFee: 0 }
  assert.equal(forgedPayload.subtotal, 0)
  assert.equal(forgedPayload.total, 0)
  assert.doesNotMatch(route, /(?:body|details)\.(?:subtotal|total)/)
  assert.match(rpc, /v_subtotal_cents := v_subtotal_cents \+ v_line_cents/)
  assert.match(rpc, /v_total_cents := v_subtotal_cents \+ round\(v_delivery_fee \* 100\)::bigint/)
})

test('client-supplied zone and tariff cannot override the server quote', () => {
  const request = { deliveryFee: 0, fee: 1, deliveryZone: 'very_far', zoneKey: 'very_far' }
  const quote = resolveDeliveryQuote('delivery', 'TAUBATE', 'SP', 'Centro', config(), request)
  assert.equal(quote.ok && quote.fee, 5)
  assert.equal(quote.ok && quote.zone.zoneKey, 'very_near')
})

test('same delivery quote snapshot permits continuing', () => {
  assert.equal(isDeliveryQuoteSnapshotCurrent({ feeCents: 500, zoneKey: 'very_near' }, {
    ok: true,
    fee: 5,
    zone: activeZone,
  }), true)
})

test('changed delivery quote snapshot requires confirmation of the new quote', () => {
  const current = { ok: true, fee: 7, zone: { ...activeZone, zoneKey: 'near' } }
  assert.equal(isDeliveryQuoteSnapshotCurrent({ feeCents: 500, zoneKey: 'very_near' }, current), false)
  assert.equal(isDeliveryQuoteSnapshotCurrent({ feeCents: 700, zoneKey: 'near' }, current), true)
})

test('order API checks quote consistency before calling the persistence RPC', async () => {
  const route = await readFile(new URL('../app/api/orders/route.ts', import.meta.url), 'utf8')
  assert.match(route, /DELIVERY_QUOTE_CHANGED/)
  assert.match(route, /isDeliveryQuoteSnapshotCurrent\(expectedQuote, quote\)/)
  assert.ok(route.indexOf('isDeliveryQuoteSnapshotCurrent(expectedQuote, quote)') < route.indexOf("supabase.rpc('create_order_atomic_checked'"))
})

test('database migration protects delivery floor without blocking free pickup', async () => {
  const migration = await readFile(new URL('../supabase/migrations/202609260007_enforce_order_delivery_fee_minimum.sql', import.meta.url), 'utf8')
  assert.match(migration, /delivery_method = 'pickup' and delivery_fee = 0/i)
  assert.match(migration, /delivery_method = 'delivery' and delivery_fee >= 5\.00/i)
  assert.match(migration, /not valid/i)
})

test('checkout refreshes config and requires confirmation after quote changes', async () => {
  const client = await readFile(new URL('../app/cardapio/CardapioClient.tsx', import.meta.url), 'utf8')
  assert.match(client, /expectedDeliveryQuote:/)
  assert.match(client, /setDeliveryConfig\(result\.config as DeliveryConfig\)/)
  assert.match(client, /confirme novamente/i)
})

test('calculates the displayed total with the same server quote', () => {
  const quote = resolveDeliveryQuote('delivery', 'Taubaté', 'SP', 'Centro', config({
    zones: [{ ...activeZone, fee: 7 }],
  }))
  assert.equal(quote.ok && calculateOrderTotal(26.8, quote.fee), 33.8)
})

test('does not produce a total from invalid rates', () => {
  assert.equal(calculateOrderTotal(26.8, Number.NaN), null)
  assert.equal(calculateOrderTotal(-1, 5), null)
})
