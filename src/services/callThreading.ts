import type { CallAnalysis, CallThread, CallThreadState, EnrichedCall } from '../types/calls'
import { normalizeMcNumber } from './emailThreading'

function buildCarrierThreadKey(
  loadId: string | null,
  mcNumber: string | null,
  carrierName: string | null,
  callId: string,
): string {
  if (!loadId) {
    return `orphan:${callId}`
  }

  const normalizedMc = normalizeMcNumber(mcNumber)
  if (normalizedMc) {
    return `${loadId}:mc:${normalizedMc}`
  }

  const normalizedName = carrierName?.trim().toLowerCase()
  if (normalizedName && normalizedName.length > 2) {
    return `${loadId}:name:${normalizedName}`
  }

  return `orphan:${callId}`
}

function getCallAnalysisIdentity(call: EnrichedCall): {
  loadId: string | null
  mcNumber: string | null
  carrierName: string | null
} {
  const analysis = call.analysis
  return {
    loadId: analysis?.loadId ?? null,
    mcNumber: analysis?.mcNumber ?? null,
    carrierName: analysis?.carrierName ?? null,
  }
}

export function buildCallThreads(calls: EnrichedCall[]): CallThread[] {
  const analyzedCalls = calls.filter((call) => call.analysis)
  const groups = new Map<string, EnrichedCall[]>()

  for (const call of analyzedCalls) {
    const identity = getCallAnalysisIdentity(call)
    const threadKey = buildCarrierThreadKey(
      identity.loadId,
      identity.mcNumber,
      identity.carrierName,
      call.callId,
    )

    const existing = groups.get(threadKey)
    if (existing) {
      existing.push(call)
    } else {
      groups.set(threadKey, [call])
    }
  }

  const threads: CallThread[] = [...groups.entries()].map(([threadId, threadCalls]) => {
    const sortedCalls = [...threadCalls].sort((a, b) => a.callSequence - b.callSequence)
    const firstIdentity = getCallAnalysisIdentity(sortedCalls[0])
    const warnings: string[] = []

    if (!firstIdentity.loadId) {
      warnings.push('Missing load ID')
    }
    if (!firstIdentity.mcNumber && !firstIdentity.carrierName) {
      warnings.push('Missing carrier identity')
    }

    const callCount = sortedCalls.length

    return {
      threadId,
      loadId: firstIdentity.loadId,
      carrierName: firstIdentity.carrierName,
      mcNumber: normalizeMcNumber(firstIdentity.mcNumber),
      calls: sortedCalls,
      callCount,
      threadType: callCount === 1 ? 'single' : 'conversation',
      warnings,
    }
  })

  return threads.sort((a, b) => {
    const aLast = a.calls[a.calls.length - 1]?.callSequence ?? 0
    const bLast = b.calls[b.calls.length - 1]?.callSequence ?? 0
    return bLast - aLast
  })
}

export function getLatestCallThreadState(thread: CallThread): CallThreadState {
  const analyzedCalls = thread.calls.filter((call) => call.analysis)

  const state: CallThreadState = {
    currentRate: null,
    agreedRate: null,
    rateStatus: 'none',
    availability: 'unknown',
    outcome: 'unknown',
    carrierName: thread.carrierName,
    mcNumber: thread.mcNumber,
    loadId: thread.loadId,
    equipment: null,
    lastSummary: null,
    suggestedNextAction: null,
    needsHumanReview: false,
  }

  for (const call of analyzedCalls) {
    const analysis = call.analysis as CallAnalysis
    applyAnalysisToState(state, analysis)
  }

  return state
}

function applyAnalysisToState(state: CallThreadState, analysis: CallAnalysis): void {
  if (analysis.carrierName) state.carrierName = analysis.carrierName
  if (analysis.mcNumber) state.mcNumber = normalizeMcNumber(analysis.mcNumber)
  if (analysis.loadId) state.loadId = analysis.loadId
  if (analysis.equipment) state.equipment = analysis.equipment

  state.availability = analysis.availability
  state.outcome = analysis.outcome
  state.lastSummary = analysis.summary
  state.suggestedNextAction = analysis.suggestedNextAction
  state.needsHumanReview = state.needsHumanReview || analysis.needsHumanReview

  if (analysis.rateStatus === 'accepted' && analysis.agreedRateUsd != null) {
    state.agreedRate = analysis.agreedRateUsd
    state.currentRate = analysis.agreedRateUsd
    state.rateStatus = 'accepted'
    return
  }

  if (state.rateStatus === 'accepted') {
    return
  }

  state.rateStatus = analysis.rateStatus

  if (analysis.carrierAskUsd != null) {
    state.currentRate = analysis.carrierAskUsd
  } else if (analysis.brokerRateMentionedUsd != null) {
    state.currentRate = analysis.brokerRateMentionedUsd
  }

  if (analysis.agreedRateUsd != null && analysis.rateStatus === 'accepted') {
    state.agreedRate = analysis.agreedRateUsd
    state.currentRate = analysis.agreedRateUsd
  }
}

export function computeCallStats(
  calls: EnrichedCall[],
  threads: CallThread[],
): {
  totalFiles: number
  transcribed: number
  notTranscribed: number
  failed: number
  analyzed: number
  uniqueConversations: number
  multiCallConversations: number
  singleCallConversations: number
  needsReview: number
  missingLoadId: number
  missingCarrierIdentity: number
} {
  const transcribed = calls.filter((call) => call.transcript?.status === 'success').length
  const failed = calls.filter((call) => call.transcript?.status === 'failed').length
  const analyzed = calls.filter((call) => call.analysis).length
  const needsReview = calls.filter((call) => call.analysis?.needsHumanReview).length
  const missingLoadId = calls.filter((call) => call.analysis && !call.analysis.loadId).length
  const missingCarrierIdentity = calls.filter(
    (call) =>
      call.analysis && !call.analysis.mcNumber && !call.analysis.carrierName,
  ).length

  return {
    totalFiles: calls.length,
    transcribed,
    notTranscribed: calls.length - transcribed - failed,
    failed,
    analyzed,
    uniqueConversations: threads.length,
    multiCallConversations: threads.filter((thread) => thread.threadType === 'conversation').length,
    singleCallConversations: threads.filter((thread) => thread.threadType === 'single').length,
    needsReview,
    missingLoadId,
    missingCarrierIdentity,
  }
}
