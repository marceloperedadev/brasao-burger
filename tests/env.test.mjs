import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const ts = require('typescript')

function loadTsModule(relativeUrl, exportNames) {
  return readFile(new URL(relativeUrl, import.meta.url), 'utf8').then((source) => {
    const transpiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText
    const loadedModule = { exports: {} }
    new Function('exports', 'module', 'require', transpiled)(
      loadedModule.exports,
      loadedModule,
      require,
    )
    return Object.fromEntries(exportNames.map((name) => [name, loadedModule.exports[name]]))
  })
}

const { parseAdminUserIds, getStorageBucket, getSiteUrl } = await loadTsModule('../lib/env.ts', [
  'parseAdminUserIds',
  'getStorageBucket',
  'getSiteUrl',
])

const validUuid = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f607'
const otherValidUuid = '11111111-2222-4333-8444-555555555555'

test('splits and normalizes a comma separated admin id list', () => {
  assert.deepEqual(parseAdminUserIds(` ${validUuid.toUpperCase()} , ${otherValidUuid} `), [
    validUuid,
    otherValidUuid,
  ])
})

test('returns an empty list for undefined, blank or malformed ids', () => {
  assert.deepEqual(parseAdminUserIds(undefined), [])
  assert.deepEqual(parseAdminUserIds(null), [])
  assert.deepEqual(parseAdminUserIds('   '), [])
  assert.deepEqual(parseAdminUserIds('admin@example.com, not-a-uuid'), [])
})

test('drops invalid entries but keeps the valid ones', () => {
  assert.deepEqual(parseAdminUserIds(`nope,${validUuid},12345`), [validUuid])
})

test('storage bucket falls back to product-images', () => {
  const previous = process.env.SUPABASE_STORAGE_BUCKET
  try {
    delete process.env.SUPABASE_STORAGE_BUCKET
    assert.equal(getStorageBucket(), 'product-images')
    process.env.SUPABASE_STORAGE_BUCKET = 'uploads'
    assert.equal(getStorageBucket(), 'uploads')
  } finally {
    if (previous === undefined) delete process.env.SUPABASE_STORAGE_BUCKET
    else process.env.SUPABASE_STORAGE_BUCKET = previous
  }
})

test('site url has no trailing slash', () => {
  const previous = process.env.NEXT_PUBLIC_SITE_URL
  try {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com/'
    assert.equal(getSiteUrl(), 'https://example.com')
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
    else process.env.NEXT_PUBLIC_SITE_URL = previous
  }
})