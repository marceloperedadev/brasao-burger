import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const auth = await readFile(new URL('../lib/admin-auth.ts', import.meta.url), 'utf8')
const adminApi = await readFile(new URL('../app/api/admin/route.ts', import.meta.url), 'utf8')
const imageApi = await readFile(new URL('../app/api/admin/images/route.ts', import.meta.url), 'utf8')
const imageOptimizer = await readFile(new URL('../lib/optimize-product-image.ts', import.meta.url), 'utf8')
const migration = await readFile(new URL('../supabase/migrations/202609300001_create_product_images_bucket.sql', import.meta.url), 'utf8')
const copyPasteSetup = await readFile(new URL('../supabase/ADMIN_SETUP_COPY_PASTE.sql', import.meta.url), 'utf8')
const adminPage = await readFile(new URL('../app/admin/layout.tsx', import.meta.url), 'utf8')
const adminClient = await readFile(new URL('../app/admin/admin-api.ts', import.meta.url), 'utf8')
const adminShell = await readFile(new URL('../app/admin/(protected)/AdminShell.tsx', import.meta.url), 'utf8')

test('admin APIs authenticate Supabase user and require an explicit UUID allowlist', () => {
  assert.match(auth, /authorization/)
  assert.match(auth, /process\.env\.ADMIN_USER_IDS/)
  assert.match(auth, /authClient\.auth\.getUser\(token\)/)
  assert.match(auth, /userIds\.includes\(data\.user\.id\.toLowerCase\(\)\)/)
  assert.match(auth, /SUPABASE_SECRET_KEY/)
  assert.doesNotMatch(auth, /NEXT_PUBLIC_SUPABASE_SECRET_KEY/)
  assert.doesNotMatch(adminClient + adminShell, /SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY/)
})

test('all administrative read and write endpoints invoke the server-side guard', () => {
  assert.match(adminApi, /export async function GET\(request: Request\)[\s\S]*?requireAdmin\(request\)/)
  assert.match(adminApi, /export async function POST\(request: Request\)[\s\S]*?requireAdmin\(request\)/)
  assert.match(adminApi, /export async function PATCH\(request: Request\)[\s\S]*?requireAdmin\(request\)/)
  assert.match(imageApi, /export async function POST\(request: Request\)[\s\S]*?requireAdmin\(request\)/)
  assert.match(imageApi, /export async function DELETE\(request: Request\)[\s\S]*?requireAdmin\(request\)/)
})

test('product images are decoded, resized proportionally and converted to WebP before upload', () => {
  assert.match(imageOptimizer, /createImageBitmap\(file/)
  assert.match(imageOptimizer, /MAX_OUTPUT_DIMENSION = 1_600/)
  assert.match(imageOptimizer, /canvas\.toBlob[\s\S]*?'image\/webp'/)
  assert.match(imageOptimizer, /image\/png' \? 0\.82 : 0\.80/)
  assert.match(imageOptimizer, /file\.type === 'image\/webp'[\s\S]*?SOFT_TARGET_BYTES/)
  assert.match(imageApi, /image\.type !== 'image\/webp'/)
  assert.match(imageApi, /readWebpDimensions\(bytes\)/)
})

test('uploads are content-addressed and bounded; no originals are sent by the product form', async () => {
  const productForm = await readFile(new URL('../app/admin/(protected)/produtos/ProductForm.tsx', import.meta.url), 'utf8')
  assert.match(imageApi, /MAX_OPTIMIZED_BYTES = 3 \* 1024 \* 1024/)
  assert.match(imageApi, /createHash\('sha256'\)/)
  assert.match(imageApi, /upsert: false/)
  assert.match(imageApi, /readBoundedForm\(request\)/)
  assert.match(productForm, /optimizeProductImage\(file\)/)
  assert.match(productForm, /form\.set\('image', optimized\.file\)/)
  assert.doesNotMatch(productForm, /form\.set\('image', file\)/)
})

test('image cleanup is restricted to managed assets and preserves referenced files', () => {
  assert.ok(imageApi.includes('if (!/^products\\/[0-9a-f]{64}\\.webp$/i.test(path))'))
  assert.match(imageApi, /\.from\('products'\)\.select\('id', \{ count: 'exact', head: true \}\)\.eq\('image_url', imageUrl\)/)
  assert.match(imageApi, /if \(\(count \?\? 0\) > 0\)/)
})

test('admin pages are marked noindex and the bucket migration is additive', () => {
  assert.match(adminPage, /robots: \{ index: false, follow: false \}/)
  assert.match(migration, /if not found then[\s\S]*?insert into storage\.buckets/i)
  assert.match(migration, /already exists as private/i)
  assert.doesNotMatch(migration, /delete\s+from\s+storage\.objects/i)
  assert.doesNotMatch(migration, /drop\s+table/i)
})

test('admin JSON bodies are bounded and product numbers are not coerced from malformed input', () => {
  assert.match(adminApi, /size > 16_384/)
  assert.match(adminApi, /typeof body\.price === 'number'/)
  assert.match(adminApi, /typeof body\.categoryId === 'number'/)
  assert.match(adminApi, /Number\.isSafeInteger\(sortOrder\)/)
})

test('copy-paste SQL validates prerequisites and does not delete data or alter an existing bucket', () => {
  assert.match(copyPasteSetup, /begin;[\s\S]*?commit;/i)
  assert.match(copyPasteSetup, /Admin setup stopped: required columns are missing/)
  assert.match(copyPasteSetup, /add column if not exists payment_status/)
  assert.match(copyPasteSetup, /if not found then[\s\S]*?insert into storage\.buckets/i)
  assert.match(copyPasteSetup, /already exists as private/)
  assert.doesNotMatch(copyPasteSetup, /delete\s+from\s+storage\.objects/i)
  assert.doesNotMatch(copyPasteSetup, /drop\s+table|drop\s+column/i)
})