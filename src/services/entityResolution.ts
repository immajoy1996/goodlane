import carrierProfilesData from '../../data/carrier_profiles.json'
import type { LoadResolutionSource } from '../types/email'
import type { CarrierInteraction, ConfidenceLevel } from '../types/interactions'
import { loadKnownLoads } from '../data/supportingData'
import { normalizeMcNumber } from './emailThreading'

export type LoadMatch = {
  loadId: string
  score: number
  reason: string
  origin: string
  destination: string
  equipmentType: string
}

export type CarrierMatch = {
  mcNumber: string
  companyName: string
  score: number
  reason: string
  primaryContact: string
  equipmentTypes: string[]
}

type KnownLoad = {
  loadId: string
  origin: string
  destination: string
  equipmentType: string
}

type KnownCarrier = {
  mcNumber: string
  companyName: string
  primaryContact: string
  equipmentTypes: string[]
}

const LOAD_NUMBER_PATTERN = /(?:load\s*#?\s*|#)?(\d{6,10})/gi

let knownLoads: KnownLoad[] | null = null
let knownCarriers: KnownCarrier[] | null = null

function getKnownLoads(): KnownLoad[] {
  if (knownLoads) return knownLoads
  knownLoads = loadKnownLoads()
  return knownLoads
}

function getKnownCarriers(): KnownCarrier[] {
  if (knownCarriers) return knownCarriers

  knownCarriers = (carrierProfilesData as KnownCarrier[]).map((carrier) => ({
    mcNumber: carrier.mcNumber,
    companyName: carrier.companyName,
    primaryContact: carrier.primaryContact,
    equipmentTypes: carrier.equipmentTypes,
  }))

  return knownCarriers
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function levenshtein(a: string, b: string): number {
  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i])
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      )
    }
  }

  return matrix[b.length][a.length]
}

function digitSimilarity(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  const maxLen = Math.max(a.length, b.length)
  const distance = levenshtein(a, b)
  return Math.max(0, 1 - distance / maxLen)
}

function extractLoadCandidates(text: string): string[] {
  const matches = [...text.matchAll(LOAD_NUMBER_PATTERN)]
  const digits = matches
    .map((match) => match[1].replace(/\D/g, ''))
    .filter((value) => value.length >= 6)

  return [...new Set(digits)]
}

function scoreLoadCandidate(candidate: string, load: KnownLoad): { score: number; reason: string } {
  if (candidate === load.loadId) {
    return { score: 1, reason: 'Exact load ID match' }
  }

  const similarity = digitSimilarity(candidate, load.loadId)
  if (similarity >= 0.875) {
    return { score: similarity, reason: 'Likely garbled load ID (1-2 digit difference)' }
  }

  if (candidate.length >= 6 && load.loadId.startsWith(candidate)) {
    return { score: 0.82, reason: 'Partial load ID prefix match' }
  }

  if (candidate.length >= 6 && candidate.startsWith(load.loadId.slice(0, 6))) {
    return { score: 0.78, reason: 'Shared load ID prefix' }
  }

  return { score: 0, reason: '' }
}

export function suggestLoadMatches(
  rawReference: string | null,
  text: string,
  limit = 5,
): LoadMatch[] {
  const candidates = new Set<string>()
  if (rawReference?.trim()) {
    candidates.add(rawReference.trim().replace(/\D/g, ''))
  }
  for (const candidate of extractLoadCandidates(text)) {
    candidates.add(candidate)
  }

  const matches: LoadMatch[] = []

  for (const load of getKnownLoads()) {
    let bestScore = 0
    let bestReason = ''

    for (const candidate of candidates) {
      if (!candidate) continue
      const { score, reason } = scoreLoadCandidate(candidate, load)
      if (score > bestScore) {
        bestScore = score
        bestReason = reason
      }
    }

    if (bestScore >= 0.75) {
      matches.push({
        loadId: load.loadId,
        score: bestScore,
        reason: bestReason,
        origin: load.origin,
        destination: load.destination,
        equipmentType: load.equipmentType,
      })
    }
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, limit)
}

function scoreCarrierByName(name: string, carrier: KnownCarrier): number {
  const normalizedName = normalizeText(name)
  const normalizedCompany = normalizeText(carrier.companyName)
  const normalizedContact = normalizeText(carrier.primaryContact)

  if (!normalizedName) return 0
  if (normalizedName === normalizedCompany) return 1
  if (normalizedCompany.includes(normalizedName) || normalizedName.includes(normalizedCompany)) {
    return 0.92
  }
  if (normalizedContact && (normalizedContact.includes(normalizedName) || normalizedName.includes(normalizedContact))) {
    return 0.88
  }

  const distance = levenshtein(normalizedName, normalizedCompany)
  const maxLen = Math.max(normalizedName.length, normalizedCompany.length)
  if (maxLen === 0) return 0

  const similarity = 1 - distance / maxLen
  return similarity >= 0.72 ? similarity : 0
}

export function suggestCarrierMatches(
  carrierName: string | null,
  mcNumber: string | null,
  email: string | null,
  text: string,
  limit = 5,
): CarrierMatch[] {
  const matches: CarrierMatch[] = []
  const normalizedMc = normalizeMcNumber(mcNumber)
  const normalizedEmail = email?.trim().toLowerCase() ?? ''

  for (const carrier of getKnownCarriers()) {
    let score = 0
    let reason = ''

    if (normalizedMc) {
      const mcSimilarity = digitSimilarity(normalizedMc, carrier.mcNumber)
      if (mcSimilarity === 1) {
        score = 1
        reason = 'Exact MC match'
      } else if (mcSimilarity >= 0.8) {
        score = mcSimilarity
        reason = 'Likely garbled MC number'
      }
    }

    if (carrierName) {
      const nameScore = scoreCarrierByName(carrierName, carrier)
      if (nameScore > score) {
        score = nameScore
        reason = 'Carrier name match'
      }
    }

    if (normalizedEmail && carrier.companyName) {
      const companyToken = normalizeText(carrier.companyName).split(' ')[0]
      if (companyToken.length >= 4 && normalizedEmail.includes(companyToken)) {
        const emailScore = 0.76
        if (emailScore > score) {
          score = emailScore
          reason = 'Email domain/name hint'
        }
      }
    }

    const textMentions = normalizeText(text)
    const companyInText = normalizeText(carrier.companyName)
    if (companyInText.length >= 4 && textMentions.includes(companyInText)) {
      const textScore = 0.84
      if (textScore > score) {
        score = textScore
        reason = 'Carrier mentioned in message'
      }
    }

    if (score >= 0.72) {
      matches.push({
        mcNumber: carrier.mcNumber,
        companyName: carrier.companyName,
        score,
        reason,
        primaryContact: carrier.primaryContact,
        equipmentTypes: carrier.equipmentTypes,
      })
    }
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, limit)
}

export type ResolutionContext = {
  loadResolutionSource?: LoadResolutionSource
  rawLoadReference?: string | null
  fromEmail?: string | null
  messageWarnings?: string[]
  needsHumanReview?: boolean
  analysisConfidence?: number
}

function isKnownLoad(loadId: string | null): boolean {
  if (!loadId) return false
  return getKnownLoads().some((load) => load.loadId === loadId)
}

function isKnownCarrier(mcNumber: string | null): boolean {
  if (!mcNumber) return false
  return getKnownCarriers().some((carrier) => carrier.mcNumber === mcNumber)
}

function assessLoadConfidence(
  interaction: Pick<CarrierInteraction, 'loadId' | 'rawText'>,
  context: ResolutionContext,
): ConfidenceLevel {
  const warnings = context.messageWarnings ?? []
  const hasConflict = warnings.some((warning) => warning.toLowerCase().includes('conflict'))

  if (!interaction.loadId) {
    return 'low'
  }

  if (hasConflict) {
    return 'low'
  }

  if (context.loadResolutionSource === 'structured_field') {
    return isKnownLoad(interaction.loadId) ? 'high' : 'medium'
  }

  if (context.loadResolutionSource === 'subject' || context.loadResolutionSource === 'body') {
    return isKnownLoad(interaction.loadId) ? 'medium' : 'low'
  }

  if (context.needsHumanReview) {
    return 'low'
  }

  if (typeof context.analysisConfidence === 'number') {
    if (context.analysisConfidence >= 0.85 && isKnownLoad(interaction.loadId)) {
      return 'high'
    }
    if (context.analysisConfidence >= 0.65) {
      return 'medium'
    }
    return 'low'
  }

  return isKnownLoad(interaction.loadId) ? 'medium' : 'low'
}

function assessMcConfidence(
  interaction: Pick<CarrierInteraction, 'source' | 'mcNumber' | 'carrierName' | 'rawText'>,
  context: ResolutionContext,
): ConfidenceLevel {
  if (!interaction.mcNumber) {
    return 'low'
  }

  if (context.needsHumanReview) {
    return isKnownCarrier(interaction.mcNumber) ? 'medium' : 'low'
  }

  if (isKnownCarrier(interaction.mcNumber)) {
    if (interaction.source === 'email') {
      return 'high'
    }
    if (typeof context.analysisConfidence === 'number' && context.analysisConfidence >= 0.8) {
      return 'high'
    }
    return 'medium'
  }

  const suggestions = suggestCarrierMatches(
    interaction.carrierName,
    interaction.mcNumber,
    context.fromEmail ?? null,
    interaction.rawText,
    1,
  )

  if (suggestions[0]?.mcNumber === interaction.mcNumber && suggestions[0].score >= 0.95) {
    return 'medium'
  }

  return 'low'
}

export function enrichInteraction(
  interaction: Omit<
    CarrierInteraction,
    | 'loadIdConfidence'
    | 'mcNumberConfidence'
    | 'needsReview'
    | 'resolutionWarnings'
    | 'manuallyAssigned'
  >,
  context: ResolutionContext = {},
): CarrierInteraction {
  const resolutionWarnings = [...(context.messageWarnings ?? [])]

  const loadIdConfidence = assessLoadConfidence(interaction, context)
  const mcNumberConfidence = assessMcConfidence(interaction, context)

  const needsReview =
    loadIdConfidence === 'low' ||
    mcNumberConfidence === 'low' ||
    !interaction.loadId ||
    !interaction.mcNumber

  if (!interaction.loadId) {
    resolutionWarnings.push('Load ID missing or unresolved')
  } else if (loadIdConfidence === 'low') {
    resolutionWarnings.push('Load ID may be incorrect or ambiguous')
  }

  if (!interaction.mcNumber) {
    resolutionWarnings.push('MC number missing or unresolved')
  } else if (mcNumberConfidence === 'low') {
    resolutionWarnings.push('MC number may be incorrect or ambiguous')
  }

  return {
    ...interaction,
    loadIdConfidence,
    mcNumberConfidence,
    needsReview,
    resolutionWarnings: [...new Set(resolutionWarnings)],
    manuallyAssigned: false,
  }
}

export function applyManualAssignment(interaction: CarrierInteraction): CarrierInteraction {
  return {
    ...interaction,
    loadIdConfidence: interaction.loadId ? 'high' : 'low',
    mcNumberConfidence: interaction.mcNumber ? 'high' : 'low',
    needsReview: !interaction.loadId || !interaction.mcNumber,
    manuallyAssigned: true,
    resolutionWarnings: interaction.resolutionWarnings.filter(
      (warning) => !warning.toLowerCase().includes('missing'),
    ),
  }
}
