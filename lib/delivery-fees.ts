export type DeliveryFees = Record<string, number>

function normalizeArea(value: string) {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function parseDeliveryFees(raw: string | undefined): DeliveryFees {
  if (!raw) return {}

  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, fee]) => typeof fee === 'number' && Number.isFinite(fee) && fee >= 0)
        .map(([key, fee]) => {
          if (key === '*') return [key, Math.round(Number(fee) * 100) / 100]
          if (key.startsWith('bairro:')) {
            return [`bairro:${normalizeArea(key.slice('bairro:'.length))}`, Math.round(Number(fee) * 100) / 100]
          }
          if (key.startsWith('cep:')) {
            return [`cep:${key.slice('cep:'.length).replace(/\D/g, '')}`, Math.round(Number(fee) * 100) / 100]
          }
          return [key, Math.round(Number(fee) * 100) / 100]
        }),
    )
  } catch {
    return {}
  }
}

export function calculateDeliveryFee(
  fees: DeliveryFees,
  zipCode: string,
  neighborhood: string,
): number | null {
  const zip = zipCode.replace(/\D/g, '')
  const area = normalizeArea(neighborhood)
  const byZip = zip.length === 8 ? fees[`cep:${zip}`] : undefined
  const byNeighborhood = area ? fees[`bairro:${area}`] : undefined
  return byZip ?? byNeighborhood ?? fees['*'] ?? null
}
