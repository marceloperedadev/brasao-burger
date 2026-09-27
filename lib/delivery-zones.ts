import type { SupabaseClient } from '@supabase/supabase-js'

export const MINIMUM_DELIVERY_FEE = 5

export const DELIVERY_ZONE_KEYS = [
  'very_near',
  'near',
  'medium',
  'far',
  'very_far',
] as const

export type DeliveryZoneKey = (typeof DELIVERY_ZONE_KEYS)[number]

export type DeliveryZone = {
  zoneKey: DeliveryZoneKey
  name: string
  sortOrder: number
  description: string | null
  criteriaType: 'neighborhood' | 'distance'
  neighborhoods: string[]
  minimumDistanceKm: number | null
  maximumDistanceKm: number | null
  fee: number | null
  active: boolean
  requiresManualConfirmation: boolean
}

export type DeliveryConfig = {
  enabled: boolean
  configurationReady: boolean
  minimumFee: number
  serviceCity: string
  serviceState: string
  zones: DeliveryZone[]
}

type DeliverySettingsRecord = {
  enabled: boolean
  configuration_ready: boolean
  minimum_fee: number | string
  service_city: string
  service_state: string
}

export async function loadDeliveryConfig(client: SupabaseClient): Promise<DeliveryConfig> {
  const { data: settingsData, error: settingsError } = await client
    .from('delivery_settings')
    .select('enabled,configuration_ready,minimum_fee,service_city,service_state')
    .eq('id', 1)
    .maybeSingle()

  if (settingsError || !settingsData) throw new Error('Delivery settings are missing or unavailable.')
  const settings = settingsData as DeliverySettingsRecord

  const { data: zoneData, error: zoneError } = await client
    .from('delivery_zones')
    .select('zone_key,name,sort_order,description,criteria_type,neighborhoods,fee,active,requires_manual_confirmation')
    .eq('active', true)
    .order('sort_order')

  if (zoneError || !zoneData) throw new Error('Active delivery zones are unavailable.')

  return {
    enabled: settings.enabled,
    configurationReady: settings.configuration_ready,
    minimumFee: Number(settings.minimum_fee),
    serviceCity: settings.service_city,
    serviceState: settings.service_state,
    zones: zoneData.map((zone) => ({
      zoneKey: zone.zone_key,
      name: zone.name,
      sortOrder: zone.sort_order,
      description: zone.description,
      criteriaType: zone.criteria_type,
      neighborhoods: zone.neighborhoods,
      minimumDistanceKm: null,
      maximumDistanceKm: null,
      fee: zone.fee === null ? null : Number(zone.fee),
      active: zone.active,
      requiresManualConfirmation: zone.requires_manual_confirmation,
    })) as DeliveryZone[],
  }
}

export type DeliveryQuoteResult =
  | { ok: true; fee: number; zone: DeliveryZone | null }
  | { ok: false; reason: 'unavailable' | 'disabled' | 'not_ready' | 'invalid' | 'outside_area' | 'zone_not_found' | 'ambiguous_zone' | 'manual_confirmation_required' }

export type DeliveryQuoteSnapshot = {
  feeCents: number
  zoneKey: DeliveryZoneKey
}

export function isDeliveryQuoteSnapshotCurrent(
  expected: DeliveryQuoteSnapshot,
  current: Extract<DeliveryQuoteResult, { ok: true }>,
) {
  return current.zone !== null &&
    expected.feeCents === Math.round(current.fee * 100) &&
    expected.zoneKey === current.zone.zoneKey
}

export function normalizeDeliveryArea(value: string) {
  return value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

export function isDeliveryLocationCovered(city: string, state: string, config: Pick<DeliveryConfig, 'serviceCity' | 'serviceState'>) {
  return normalizeDeliveryArea(city) === normalizeDeliveryArea(config.serviceCity) &&
    state.trim().toUpperCase() === config.serviceState.trim().toUpperCase()
}

export function resolveDeliveryQuote(
  method: 'delivery' | 'pickup',
  city: string,
  state: string,
  neighborhood: string,
  config: DeliveryConfig | null,
): DeliveryQuoteResult {
  if (method === 'pickup') return { ok: true, fee: 0, zone: null }
  if (!config) return { ok: false, reason: 'unavailable' }
  if (typeof config.enabled !== 'boolean' || typeof config.configurationReady !== 'boolean' ||
      typeof config.minimumFee !== 'number' || !Number.isFinite(config.minimumFee) ||
      config.minimumFee < MINIMUM_DELIVERY_FEE || !config.serviceCity.trim() ||
      !/^[A-Z]{2}$/.test(config.serviceState) || !Array.isArray(config.zones)) {
    return { ok: false, reason: 'invalid' }
  }
  if (!config.enabled) return { ok: false, reason: 'disabled' }
  if (!config.configurationReady) return { ok: false, reason: 'not_ready' }
  if (!isDeliveryLocationCovered(city, state, config)) return { ok: false, reason: 'outside_area' }

  const activeZones = config.zones.filter((zone) => zone.active)
  if (activeZones.length === 0) return { ok: false, reason: 'not_ready' }
  const claimedAreas = new Set<string>()
  for (const zone of activeZones) {
    if (!DELIVERY_ZONE_KEYS.includes(zone.zoneKey) || !zone.name.trim() ||
        !['neighborhood', 'distance'].includes(zone.criteriaType) || !Number.isInteger(zone.sortOrder) ||
        typeof zone.fee !== 'number' || !Number.isFinite(zone.fee) ||
        Math.round(zone.fee * 100) / 100 < config.minimumFee ||
        !Array.isArray(zone.neighborhoods) || typeof zone.requiresManualConfirmation !== 'boolean' ||
        (zone.criteriaType === 'neighborhood' && zone.neighborhoods.length === 0) ||
        (zone.criteriaType === 'distance' && (!Number.isFinite(zone.minimumDistanceKm) || !Number.isFinite(zone.maximumDistanceKm) || zone.minimumDistanceKm! < 0 || zone.maximumDistanceKm! <= zone.minimumDistanceKm!))) {
      return { ok: false, reason: 'invalid' }
    }
    // Distance boundaries are stored for future routing integration; without a
    // real route provider the checkout must fail closed instead of guessing.
    if (zone.criteriaType === 'distance') return { ok: false, reason: 'invalid' }
    for (const neighborhood of zone.neighborhoods) {
      if (typeof neighborhood !== 'string' || !neighborhood.trim()) return { ok: false, reason: 'invalid' }
      const normalized = normalizeDeliveryArea(neighborhood)
      if (claimedAreas.has(normalized)) return { ok: false, reason: 'ambiguous_zone' }
      claimedAreas.add(normalized)
    }
  }

  const target = normalizeDeliveryArea(neighborhood)
  if (!target) return { ok: false, reason: 'zone_not_found' }
  const matches = activeZones.filter((zone) => zone.neighborhoods.some((area) => normalizeDeliveryArea(area) === target))
  if (matches.length === 0) return { ok: false, reason: 'zone_not_found' }
  if (matches.length > 1) return { ok: false, reason: 'ambiguous_zone' }
  const zone = matches[0]
  if (zone.requiresManualConfirmation) return { ok: false, reason: 'manual_confirmation_required' }
  return { ok: true, fee: Math.round(zone.fee! * 100) / 100, zone }
}

export function calculateOrderTotal(subtotal: number, deliveryFee: number) {
  if (!Number.isFinite(subtotal) || subtotal < 0 || !Number.isFinite(deliveryFee) || deliveryFee < 0) return null
  return (Math.round(subtotal * 100) + Math.round(deliveryFee * 100)) / 100
}
