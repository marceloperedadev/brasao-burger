import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const client = await readFile(new URL('../app/cardapio/CardapioClient.tsx', import.meta.url), 'utf8')
const saveCustomerStart = client.indexOf('async function saveCustomer()')
const saveCustomerEnd = client.indexOf('function continueFromDelivery()', saveCustomerStart)
assert.notEqual(saveCustomerStart, -1)
assert.notEqual(saveCustomerEnd, -1)
const saveCustomer = client.slice(saveCustomerStart, saveCustomerEnd)

test('checkout advances after an authenticated profile save is confirmed', () => {
  const request = saveCustomer.indexOf("fetch('/api/customer'")
  const responseCheck = saveCustomer.indexOf('!response.ok', request)
  const confirmedCustomerCheck = saveCustomer.indexOf('isPersistedCustomer(savedCustomer, session.user.id)', responseCheck)
  const nextStep = saveCustomer.indexOf("setCheckoutStep('payment')", confirmedCustomerCheck)

  assert.notEqual(request, -1)
  assert.ok(responseCheck > request)
  assert.ok(confirmedCustomerCheck > responseCheck)
  assert.ok(nextStep > confirmedCustomerCheck)
})

test('HTTP, invalid response, and network failures leave checkout on the customer step', () => {
  const request = saveCustomer.indexOf("fetch('/api/customer'")
  const catchStart = saveCustomer.indexOf('} catch {', request)
  const finallyStart = saveCustomer.indexOf('} finally {', catchStart)
  const failurePath = saveCustomer.slice(catchStart, finallyStart)

  assert.notEqual(catchStart, -1)
  assert.ok(finallyStart > catchStart)
  assert.doesNotMatch(failurePath, /setCheckoutStep\('payment'\)/)
  assert.match(failurePath, /Não foi possível salvar os dados do cliente/)
})

test('duplicate profile saves are blocked while one save is in flight', () => {
  assert.match(saveCustomer, /if \(customerSaveInFlight\.current\) return/)
  assert.match(saveCustomer, /customerSaveInFlight\.current = true/)
  assert.match(saveCustomer, /customerSaveInFlight\.current = false/)
  assert.match(saveCustomer, /finally\s*\{[\s\S]*customerSaveInFlight\.current = false/)
})

test('profile response must belong to the signed-in user and contain required fields', () => {
  assert.match(client, /function isPersistedCustomer\(value: unknown, userId: string\)/)
  assert.match(client, /customer\.user_id === userId/)
  assert.match(client, /customer\.name\.trim\(\)\.length > 0/)
  assert.ok(client.includes('/^\\d{10,11}$/.test(customer.phone)'))
})
