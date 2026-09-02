import type { CarrierEmail } from '../types/email'
import type { EnrichedCall } from '../types/calls'
import type { CarrierInteraction, Conversation, ConversationState } from '../types/interactions'
import { normalizeMcNumber, resolveLoadReference } from './emailThreading'
import { discoverCallRecordings } from './callRecordings'
import { loadStoredAnalysis, loadStoredTranscripts } from './callStorage'
import { normalizeCallAnalysis } from './callAnalysis'
import { normalizeStringList } from '../utils/normalizeStringList'
import { enrichInteraction } from './entityResolution'
import { applyOverridesToInteractions } from './interactionOverrides'

// --- adapters: email / call → CarrierInteraction ---

export function emailToInteraction(email: CarrierEmail): CarrierInteraction {
  const load = resolveLoadReference(email)
  const rate = email.rate_quoted_usd

  let carrierRate: number | null = null
  let agreedRate: number | null = null

  if (rate != null) {
    if (email.intent === 'confirm') {
      agreedRate = rate
    } else {
      carrierRate = rate
    }
  }

  return enrichInteraction(
    {
      id: `email:${email.email_id}`,
      source: 'email',
      loadId: load.resolvedLoadReference,
      carrierName: email.from_name,
      mcNumber: normalizeMcNumber(email.mc_number),
      availability: email.intent === 'confirm' ? 'confirmed' : null,
      carrierRate,
      brokerRate: null,
      agreedRate,
      equipment: email.equipment_mentioned,
      questions: extractQuestions(`${email.subject}\n${email.body}`),
      timestamp: email.timestamp,
      rawText: `${email.subject}\n\n${email.body}`,
    },
    {
      loadResolutionSource: load.loadResolutionSource,
      rawLoadReference: load.rawLoadReference,
      fromEmail: email.from_email,
      messageWarnings: load.messageWarnings,
    },
  )
}

export function callToInteraction(call: EnrichedCall): CarrierInteraction {
  const analysis = call.analysis
  const transcript = call.transcript?.transcript ?? ''

  return enrichInteraction(
    {
      id: `call:${call.callId}`,
      source: 'call',
      loadId: analysis?.loadId?.replace(/\D/g, '') || null,
      carrierName: analysis?.carrierName ?? null,
      mcNumber: normalizeMcNumber(analysis?.mcNumber),
      availability: analysis?.availability ?? null,
      carrierRate: analysis?.carrierAskUsd ?? null,
      brokerRate: analysis?.brokerRateMentionedUsd ?? null,
      agreedRate: analysis?.agreedRateUsd ?? null,
      equipment: analysis?.equipment ?? null,
      questions: normalizeStringList(analysis?.questionsFromCarrier),
      timestamp: null,
      rawText: transcript || call.fileName,
    },
    {
      messageWarnings: analysis?.warnings ?? [],
      needsHumanReview: analysis?.needsHumanReview ?? false,
      analysisConfidence: analysis?.confidence,
    },
  )
}

function extractQuestions(text: string): string[] {
  return text
    .split(/[\n.!?]+/)
    .map((part) => part.trim())
    .filter((part) => part.includes('?'))
    .map((part) => (part.endsWith('?') ? part : `${part}?`))
}

// --- combine emails + calls ---

export function buildInteractions(
  emails: CarrierEmail[],
  calls: EnrichedCall[],
): CarrierInteraction[] {
  const fromEmails = emails.map(emailToInteraction)
  const fromCalls = calls
    .filter((call) => call.transcript?.status === 'success' || call.analysis)
    .map(callToInteraction)

  return applyOverridesToInteractions([...fromEmails, ...fromCalls])
}

export function loadCalls(): EnrichedCall[] {
  const recordings = discoverCallRecordings()
  const transcripts = loadStoredTranscripts()
  const analysisById = Object.fromEntries(
    Object.entries(loadStoredAnalysis()).map(([callId, analysis]) => [
      callId,
      normalizeCallAnalysis(analysis),
    ]),
  )

  return recordings.map((recording) => ({
    ...recording,
    transcript: transcripts[recording.callId],
    analysis: analysisById[recording.callId],
  }))
}

// --- sort oldest → newest ---

export function sortInteractions(interactions: CarrierInteraction[]): CarrierInteraction[] {
  return [...interactions].sort((a, b) => {
    const aTime = a.timestamp ? Date.parse(a.timestamp) : null
    const bTime = b.timestamp ? Date.parse(b.timestamp) : null

    if (aTime != null && bTime != null) return aTime - bTime
    if (aTime != null) return -1
    if (bTime != null) return 1

    return a.id.localeCompare(b.id)
  })
}

// --- current state: process oldest → newest ---

export function getCurrentState(interactions: CarrierInteraction[]): ConversationState {
  const sorted = sortInteractions(interactions)

  const state: ConversationState = {
    availability: null,
    currentRate: null,
    brokerRate: null,
    agreedRate: null,
    status: null,
    equipment: null,
    openQuestions: [],
    lastSource: null,
  }

  const questions = new Set<string>()

  for (const interaction of sorted) {
    state.lastSource = interaction.source

    if (interaction.equipment) {
      state.equipment = interaction.equipment
    }

    if (interaction.availability) {
      state.availability = interaction.availability
    }

    if (interaction.brokerRate != null) {
      state.brokerRate = interaction.brokerRate
    }

    if (interaction.carrierRate != null) {
      state.currentRate = interaction.carrierRate
    }

    // Latest explicit agreement overrides previous carrier asks.
    if (interaction.agreedRate != null) {
      state.agreedRate = interaction.agreedRate
      state.currentRate = interaction.agreedRate
      state.status = 'confirmed'
    }

    for (const question of interaction.questions) {
      questions.add(question)
    }
  }

  state.openQuestions = [...questions]
  return state
}

// --- group by load + carrier ---

function conversationKey(interaction: CarrierInteraction): string {
  const load = interaction.loadId ?? 'unknown'

  // MC number is our strongest carrier identifier.
  // Fall back to carrier name only when MC is unavailable.
  const carrier =
    interaction.mcNumber ??
    interaction.carrierName?.toLowerCase() ??
    interaction.id

  return `${load}:${carrier}`
}

export function groupInteractions(interactions: CarrierInteraction[]): Conversation[] {
  const groups = new Map<string, CarrierInteraction[]>()

  for (const interaction of interactions) {
    const key = conversationKey(interaction)
    const list = groups.get(key)
    if (list) {
      list.push(interaction)
    } else {
      groups.set(key, [interaction])
    }
  }

  const conversations: Conversation[] = []

  for (const [key, items] of groups) {
    const sorted = sortInteractions(items)
    const first = sorted[0]

    conversations.push({
      key,
      loadId: first.loadId,
      carrierName: first.carrierName,
      mcNumber: first.mcNumber,
      interactions: sorted,
      emailCount: sorted.filter((i) => i.source === 'email').length,
      callCount: sorted.filter((i) => i.source === 'call').length,
      state: getCurrentState(sorted),
    })
  }

  return conversations.sort((a, b) => {
    const aLast = a.interactions[a.interactions.length - 1]
    const bLast = b.interactions[b.interactions.length - 1]
    const aTime = aLast?.timestamp ? Date.parse(aLast.timestamp) : 0
    const bTime = bLast?.timestamp ? Date.parse(bLast.timestamp) : 0
    return bTime - aTime
  })
}

// --- query helpers ---

export function getConversation(
  conversations: Conversation[],
  loadId: string,
  mcNumber: string,
): Conversation | null {
  const mc = normalizeMcNumber(mcNumber)
  if (!mc) return null

  return (
    conversations.find((c) => c.loadId === loadId && c.mcNumber === mc) ?? null
  )
}

export function getInteractionsForLoad(
  interactions: CarrierInteraction[],
  loadId: string,
): CarrierInteraction[] {
  return sortInteractions(interactions.filter((i) => i.loadId === loadId))
}

export function getCarrierConversations(
  conversations: Conversation[],
  mcNumber: string,
): Conversation[] {
  const mc = normalizeMcNumber(mcNumber)
  if (!mc) return []
  return conversations.filter((c) => c.mcNumber === mc)
}

export function getCrossChannelTimeline(
  interactions: CarrierInteraction[],
  loadId: string,
  mcNumber: string,
): CarrierInteraction[] {
  const mc = normalizeMcNumber(mcNumber)
  if (!mc) return []

  return sortInteractions(
    interactions.filter((i) => i.loadId === loadId && i.mcNumber === mc),
  )
}

export function computeStats(
  interactions: CarrierInteraction[],
  conversations: Conversation[],
) {
  const emailCount = interactions.filter((i) => i.source === 'email').length
  const callCount = interactions.filter((i) => i.source === 'call').length

  return {
    emailInteractions: emailCount,
    callInteractions: callCount,
    totalInteractions: emailCount + callCount,
    conversations: conversations.length,
    crossChannel: conversations.filter((c) => c.emailCount > 0 && c.callCount > 0).length,
    emailOnly: conversations.filter((c) => c.emailCount > 0 && c.callCount === 0).length,
    callOnly: conversations.filter((c) => c.callCount > 0 && c.emailCount === 0).length,
  }
}
