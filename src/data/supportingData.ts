import loadsCsv from '../../data/loads.csv?raw'
import rateHistoryCsv from '../../data/rate_history.csv?raw'
import type { DbLoad, RateHistoryRow } from '../db/knowledgeDb'
import { parseCsv, toCsvNumber } from '../utils/parseCsv'

function formatLocation(city: string, state: string): string {
  if (!city && !state) return ''
  if (!city) return state
  if (!state) return city
  return `${city}, ${state}`
}

export function loadLoadsFromCsv(): DbLoad[] {
  return parseCsv(loadsCsv).map((row) => ({
    loadId: row.load_id,
    origin: formatLocation(row.origin_city, row.origin_state),
    destination: formatLocation(row.destination_city, row.destination_state),
    distanceMiles: toCsvNumber(row.distance_miles),
    equipmentType: row.equipment_type,
    weightLbs: toCsvNumber(row.weight_lbs),
    pickupDate: row.pickup_date,
    pickupWindow: row.pickup_window,
    deliveryDate: row.delivery_date,
    offeredRateUsd: toCsvNumber(row.offered_rate_usd),
    status: row.status,
    shipperName: row.shipper_name,
    internalNotes: row.internal_notes ?? '',
  }))
}

export function loadRateHistoryFromCsv(): RateHistoryRow[] {
  return parseCsv(rateHistoryCsv).map((row) => ({
    weekStart: row.week_start,
    originState: row.origin_state,
    destinationState: row.destination_state,
    equipmentType: row.equipment_type,
    avgRatePerMile: toCsvNumber(row.avg_rate_per_mile),
    minRatePerMile: toCsvNumber(row.min_rate_per_mile),
    maxRatePerMile: toCsvNumber(row.max_rate_per_mile),
    loadVolume: toCsvNumber(row.load_volume),
  }))
}

export type KnownLoadSummary = {
  loadId: string
  origin: string
  destination: string
  equipmentType: string
}

export function loadKnownLoads(): KnownLoadSummary[] {
  return loadLoadsFromCsv().map((load) => ({
    loadId: load.loadId,
    origin: load.origin,
    destination: load.destination,
    equipmentType: load.equipmentType,
  }))
}
