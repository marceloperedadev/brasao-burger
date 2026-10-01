const MAX_SOURCE_BYTES = 20 * 1024 * 1024
const MAX_SOURCE_DIMENSION = 12_000
const MAX_IMAGE_PIXELS = 60_000_000
const MAX_OUTPUT_DIMENSION = 1_600
const SOFT_TARGET_BYTES = 300 * 1024
const MAX_OUTPUT_BYTES = 3 * 1024 * 1024

const INPUT_FORMATS: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/avif': ['.avif'],
}

export type OptimizedProductImage = {
  file: File
  sourceBytes: number
  width: number
  height: number
  reused: boolean
}

function validateInput(file: File) {
  const extensions = INPUT_FORMATS[file.type]
  if (!extensions?.some((extension) => file.name.toLowerCase().endsWith(extension))) {
    throw new Error('Use uma foto JPG, PNG, WebP ou AVIF com extensão compatível.')
  }
  if (file.size < 1 || file.size > MAX_SOURCE_BYTES) {
    throw new Error('A foto original deve ter até 20 MB.')
  }
}

function canvasToWebp(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.type !== 'image/webp') {
        reject(new Error('Este navegador não conseguiu converter a foto para WebP.'))
        return
      }
      resolve(blob)
    }, 'image/webp', quality)
  })
}

function canvasFor(bitmap: ImageBitmap, longestSide: number) {
  const scale = Math.min(1, longestSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d', { alpha: true })
  if (!context) throw new Error('Não foi possível preparar a foto neste navegador.')
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return canvas
}

export async function optimizeProductImage(file: File): Promise<OptimizedProductImage> {
  validateInput(file)
  if (typeof createImageBitmap !== 'function') {
    throw new Error('Seu navegador não oferece processamento de imagem compatível.')
  }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('O arquivo não contém uma imagem válida ou este navegador não consegue abri-lo.')
  }

  try {
    if (bitmap.width > MAX_SOURCE_DIMENSION || bitmap.height > MAX_SOURCE_DIMENSION || bitmap.width * bitmap.height > MAX_IMAGE_PIXELS) {
      throw new Error('A foto tem dimensões muito grandes para ser processada com segurança.')
    }

    const width = Math.min(bitmap.width, MAX_OUTPUT_DIMENSION)
    const height = Math.min(bitmap.height, MAX_OUTPUT_DIMENSION)
    if (file.type === 'image/webp' && bitmap.width <= MAX_OUTPUT_DIMENSION && bitmap.height <= MAX_OUTPUT_DIMENSION && file.size <= SOFT_TARGET_BYTES) {
      return { file, sourceBytes: file.size, width, height, reused: true }
    }

    let canvas = canvasFor(bitmap, MAX_OUTPUT_DIMENSION)
    let blob = await canvasToWebp(canvas, file.type === 'image/png' ? 0.82 : 0.80)
    if (blob.size > SOFT_TARGET_BYTES) blob = await canvasToWebp(canvas, 0.76)
    if (blob.size > SOFT_TARGET_BYTES && Math.max(canvas.width, canvas.height) > 1_200) {
      canvas = canvasFor(bitmap, 1_200)
      blob = await canvasToWebp(canvas, 0.76)
    }
    if (blob.size > MAX_OUTPUT_BYTES) {
      throw new Error('A foto continua muito pesada após a otimização. Tente uma imagem menor.')
    }

    return {
      file: new File([blob], `${crypto.randomUUID()}.webp`, { type: 'image/webp' }),
      sourceBytes: file.size,
      width: canvas.width,
      height: canvas.height,
      reused: false,
    }
  } finally {
    bitmap.close()
  }
}

export function formatImageSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export function imageSavingsPercent(sourceBytes: number, outputBytes: number) {
  if (sourceBytes <= 0 || outputBytes >= sourceBytes) return 0
  return Math.round((1 - outputBytes / sourceBytes) * 1_000) / 10
}