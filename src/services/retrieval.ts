import type { CarrierInteraction, Conversation } from '../types/interactions'
import {
  getDatabase,
  isKnowledgeDbReady,
  searchCarriers,
  selectAllInteractions,
  selectCarrierByMc,
  selectInteractionsByLoadId,
  selectLoadById,
  selectRateHistory,
  updateInteractionRecord,
} from '../db/knowledgeDb'
import {
  getConversation,
  groupInteractions,
  sortInteractions,
} from './conversations'
import { normalizeMcNumber } from './emailThreading'
import { assignAndPersistInteraction } from './interactionOverrides'

// --- result types ---

export type LoadCarrierSummary = {
  carrierName: string | null
  mcNumber: string | null
  availability: string
  equipment: string | null
  currentCarrierRate: number | null
  brokerRate: number | null
  agreedRate: number | null
  status: string | null
  questions: string[]
  emailCount: number
  callCount: number
  interactionCount: number
  latestInteractionId: string | null
  latestInteractionSource: 'email' | 'call' | null
  sources: string[]
}

export type LoadInteractionsResult = {
  loadId: string
  carriers: LoadCarrierSummary[]
}

export type BestOfferResult = {
  carrierName: string | null
  mcNumber: string | null
  rate: number
  availability: string
  agreedRate: number | null
  sourceIds: string[]
}

export type LoadDetails = {
  loadId: string
  origin: string
  destination: string
  distanceMiles: number
  equipmentType: string
  weightLbs: number
  pickupDate: string
  pickupWindow: string
  deliveryDate: string
  offeredRateUsd: number
  status: string
  shipperName: string
  internalNotes: string
}

export type CarrierHistory = {
  mcNumber: string
  companyName: string
  primaryContact: string
  equipmentTypes: string[]
  preferredLanes: string[]
  reliabilityScore: number
  loadsCompletedWithGoodlane: number
  avgResponseTimeHours: number
  insuranceExpiry: string
  authorityStatus: string
  safetyRating: string
  onboarded: boolean
  notes: string
}

export type CarrierSearchMatch = {
  companyName: string | null
  mcNumber: string | null
  dotNumber: string | null
  contactName: string | null
  email: string | null
}

export type RateContext = {
  latest: {
    weekStart: string
    avgRatePerMile: number
    minRatePerMile: number
    maxRatePerMile: number
    loadVolume: number
  } | null
  recentWeeks: Array<{
    weekStart: string
    avgRatePerMile: number
    minRatePerMile: number
    maxRatePerMile: number
    loadVolume: number
  }>
  recentAverageRatePerMile: number | null
}

function assertKnowledgeBaseReady(): void {
  if (!isKnowledgeDbReady()) {
    throw new Error('Knowledge base is not ready')
  }
}

export { isKnowledgeDbReady }

export function getAllInteractions(): CarrierInteraction[] {
  assertKnowledgeBaseReady()
  return selectAllInteractions(getDatabase())
}

export function getInteractionsNeedingReview(): CarrierInteraction[] {
  return getAllInteractions().filter((interaction) => interaction.needsReview)
}

export function assignInteractionEntities(
  interaction: CarrierInteraction,
  assignment: { loadId: string | null; mcNumber: string | null },
): CarrierInteraction {
  assertKnowledgeBaseReady()

  const updated = assignAndPersistInteraction(interaction, assignment)
  updateInteractionRecord(getDatabase(), updated)
  return updated
}

// --- main retrieval functions (all query SQLite) ---

export function getLoadInteractions(loadId: string): LoadInteractionsResult {
  assertKnowledgeBaseReady()
  const interactions = selectInteractionsByLoadId(getDatabase(), loadId)
  const conversations = groupInteractions(interactions)
  const carriers = conversations.map(toCarrierSummary)

  return {
    loadId,
    carriers: sortCarriers(carriers),
  }
}

export function getBestCurrentOffer(loadId: string): BestOfferResult | null {
  const { carriers } = getLoadInteractions(loadId)

  const withRate = carriers.filter((carrier) => {
    if (carrier.availability === 'unavailable') return false
    return (carrier.agreedRate ?? carrier.currentCarrierRate) != null
  })

  const confirmed = withRate
    .filter((carrier) => isConfirmed(carrier))
    .sort((a, b) => effectiveRate(a)! - effectiveRate(b)!)

  if (confirmed.length > 0) {
    return toBestOffer(confirmed[0])
  }

  const available = withRate
    .filter((carrier) => carrier.availability === 'available')
    .sort((a, b) => effectiveRate(a)! - effectiveRate(b)!)

  if (available.length > 0) {
    return toBestOffer(available[0])
  }

  return null
}

export function getConfirmedCarriers(loadId: string): LoadCarrierSummary[] {
  const { carriers } = getLoadInteractions(loadId)
  return carriers.filter((carrier) => isConfirmed(carrier))
}

export function getInteractionsForCarrier(
  loadId: string,
  mcNumber: string,
): CarrierInteraction[] {
  assertKnowledgeBaseReady()
  const conversations = groupInteractions(selectInteractionsByLoadId(getDatabase(), loadId))
  const conversation = getConversation(conversations, loadId, mcNumber)
  if (!conversation) return []
  return sortInteractions(conversation.interactions)
}

export function getLoadDetails(loadId: string): LoadDetails | null {
  assertKnowledgeBaseReady()
  return selectLoadById(getDatabase(), loadId)
}

export function getCarrierHistory(mcNumber: string): CarrierHistory | null {
  assertKnowledgeBaseReady()
  const mc = normalizeMcNumber(mcNumber)
  if (!mc) return null

  const carrier = selectCarrierByMc(getDatabase(), mc)
  if (!carrier) return null

  const { email: _email, ...history } = carrier
  return history
}

export function findCarrier(query: string): CarrierSearchMatch[] {
  assertKnowledgeBaseReady()
  return searchCarriers(getDatabase(), query)
}

export function getRateContext(
  originState: string,
  destinationState: string,
  equipmentType: string,
): RateContext {
  assertKnowledgeBaseReady()

  const matches = selectRateHistory(
    getDatabase(),
    originState,
    destinationState,
    equipmentType,
  )

  if (matches.length === 0) {
    return { latest: null, recentWeeks: [], recentAverageRatePerMile: null }
  }

  const recentWeeks = matches.slice(0, 4).map((row) => ({
    weekStart: row.week_start,
    avgRatePerMile: row.avg_rate_per_mile,
    minRatePerMile: row.min_rate_per_mile,
    maxRatePerMile: row.max_rate_per_mile,
    loadVolume: row.load_volume,
  }))

  const recentAverageRatePerMile =
    recentWeeks.reduce((sum, row) => sum + row.avgRatePerMile, 0) / recentWeeks.length

  return {
    latest: recentWeeks[0],
    recentWeeks,
    recentAverageRatePerMile,
  }
}

// --- helpers ---

function toCarrierSummary(conversation: Conversation): LoadCarrierSummary {
  const last = conversation.interactions[conversation.interactions.length - 1]

  return {
    carrierName: conversation.carrierName,
    mcNumber: conversation.mcNumber,
    availability: conversation.state.availability ?? 'unknown',
    equipment: conversation.state.equipment,
    currentCarrierRate: conversation.state.currentRate,
    brokerRate: conversation.state.brokerRate,
    agreedRate: conversation.state.agreedRate,
    status: conversation.state.status,
    questions: conversation.state.openQuestions,
    emailCount: conversation.emailCount,
    callCount: conversation.callCount,
    interactionCount: conversation.interactions.length,
    latestInteractionId: last?.id ?? null,
    latestInteractionSource: conversation.state.lastSource,
    sources: conversation.interactions.map((interaction) => interaction.id),
  }
}

function isConfirmed(carrier: LoadCarrierSummary): boolean {
  return carrier.status === 'confirmed' || carrier.availability === 'confirmed'
}

function effectiveRate(carrier: LoadCarrierSummary): number | null {
  return carrier.agreedRate ?? carrier.currentCarrierRate
}

function toBestOffer(carrier: LoadCarrierSummary): BestOfferResult {
  const rate = effectiveRate(carrier)!
  return {
    carrierName: carrier.carrierName,
    mcNumber: carrier.mcNumber,
    rate,
    availability: carrier.availability,
    agreedRate: carrier.agreedRate,
    sourceIds: carrier.sources,
  }
}

const availabilityRank: Record<string, number> = {
  confirmed: 0,
  available: 1,
  conditional: 2,
  unknown: 3,
  unavailable: 4,
}

function sortCarriers(carriers: LoadCarrierSummary[]): LoadCarrierSummary[] {
  return [...carriers].sort((a, b) => {
    const aRank = carrierSortRank(a)
    const bRank = carrierSortRank(b)
    if (aRank !== bRank) return aRank - bRank

    const aRate = effectiveRate(a)
    const bRate = effectiveRate(b)
    if (aRate != null && bRate != null && aRate !== bRate) {
      return aRate - bRate
    }

    return (a.mcNumber ?? a.carrierName ?? '').localeCompare(b.mcNumber ?? b.carrierName ?? '')
  })
}

function carrierSortRank(carrier: LoadCarrierSummary): number {
  if (isConfirmed(carrier)) return 0
  return availabilityRank[carrier.availability] ?? 3
}
