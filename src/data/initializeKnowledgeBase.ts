import carrierEmailsData from '../../data/carrier_emails.json'
import carrierProfilesData from '../../data/carrier_profiles.json'
import type { CarrierEmail } from '../types/email'
import type { CarrierInteraction } from '../types/interactions'
import type { EnrichedCall, RawCallRecording } from '../types/calls'
import { analyzeCall, normalizeCallAnalysis } from '../services/callAnalysis'
import { discoverCallRecordings } from '../services/callRecordings'
import {
  loadStoredAnalysis,
  loadStoredTranscripts,
  saveAnalysis,
  saveTranscript,
} from '../services/callStorage'
import { transcribeCall } from '../services/callTranscription'
import { emailToInteraction, callToInteraction } from '../services/conversations'
import { normalizeMcNumber } from '../services/emailThreading'
import { applyOverridesToInteractions } from '../services/interactionOverrides'
import { runWithConcurrency } from '../utils/runWithConcurrency'
import { loadLoadsFromCsv, loadRateHistoryFromCsv } from './supportingData'
import {
  clearKnowledgeTables,
  getTableCounts,
  markKnowledgeDbReady,
  openKnowledgeDatabase,
  replaceCarriers,
  replaceInteractions,
  replaceLoads,
  replaceRateHistory,
  type DbCarrier,
} from '../db/knowledgeDb'

export type KnowledgeBaseStatus = 'idle' | 'loading' | 'ready' | 'error'

export type InitProgress = {
  phase: string
  emailsLoaded: number
  emailsTotal: number
  callsProcessed: number
  callsTotal: number
  currentCallFileName: string | null
  warnings: string[]
}

export type KnowledgeBaseSummary = {
  emailsLoaded: number
  callsTotal: number
  callsProcessed: number
  callsFromCache: number
  callsNewlyTranscribed: number
  callFailures: number
  emailInteractions: number
  callInteractions: number
  totalInteractions: number
  loads: number
  carriers: number
  rateHistoryRows: number
  warnings: string[]
}

function loadEmails(): CarrierEmail[] {
  return carrierEmailsData as CarrierEmail[]
}

function loadSupportingData() {
  const loads = loadLoadsFromCsv()

  const emailByMc = new Map<string, string>()
  for (const email of loadEmails()) {
    const mc = normalizeMcNumber(email.mc_number)
    if (mc && !emailByMc.has(mc)) {
      emailByMc.set(mc, email.from_email)
    }
  }

  const carriers: DbCarrier[] = (carrierProfilesData as DbCarrier[]).map((profile) => ({
    ...profile,
    email: emailByMc.get(normalizeMcNumber(profile.mcNumber) ?? '') ?? null,
  }))

  const rateHistory = loadRateHistoryFromCsv()

  return { loads, carriers, rateHistory }
}

const CALL_PROCESSING_CONCURRENCY = 4

async function processCalls(
  recordings: RawCallRecording[],
  onProgress: (update: Partial<InitProgress>) => void,
  warnings: string[],
): Promise<{
  enriched: EnrichedCall[]
  callsFromCache: number
  callsNewlyTranscribed: number
  callFailures: number
}> {
  const transcripts = loadStoredTranscripts()
  const analysisMap = loadStoredAnalysis()
  const enriched: Array<EnrichedCall | undefined> = new Array(recordings.length)
  let callsFromCache = 0
  let callsNewlyTranscribed = 0
  let callFailures = 0
  let callsCompleted = 0
  let activeCallFileName: string | null = null

  await runWithConcurrency(recordings, CALL_PROCESSING_CONCURRENCY, async (recording, index) => {
    activeCallFileName = recording.fileName
    onProgress({
      callsProcessed: callsCompleted,
      currentCallFileName: activeCallFileName,
      phase: 'Processing calls',
    })

    let transcript = transcripts[recording.callId]
    let analysis = analysisMap[recording.callId]
    const hadCachedTranscript = transcript?.status === 'success'

    if (!hadCachedTranscript) {
      try {
        const text = await transcribeCall(recording)
        transcript = {
          callId: recording.callId,
          fileName: recording.fileName,
          transcript: text,
          status: 'success',
          error: null,
        }
        saveTranscript(transcript)
        transcripts[recording.callId] = transcript
        callsNewlyTranscribed += 1
      } catch (error) {
        callFailures += 1
        warnings.push(
          `${recording.callId} transcription failed: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        )
        callsCompleted += 1
        onProgress({
          callsProcessed: callsCompleted,
          currentCallFileName: activeCallFileName,
          phase: 'Processing calls',
        })
        return
      }
    } else {
      callsFromCache += 1
    }

    if (transcript?.status === 'success' && transcript.transcript && !analysis) {
      try {
        analysis = await analyzeCall(transcript.transcript, recording.fileTypeHint)
        saveAnalysis(recording.callId, analysis)
        analysisMap[recording.callId] = analysis
      } catch (error) {
        callFailures += 1
        warnings.push(
          `${recording.callId} analysis failed: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        )
      }
    }

    if (analysis) {
      analysis = normalizeCallAnalysis(analysis)
    }

    if (transcript?.status === 'success' || analysis) {
      enriched[index] = {
        ...recording,
        transcript,
        analysis,
      }
    }

    callsCompleted += 1
    onProgress({
      callsProcessed: callsCompleted,
      currentCallFileName: activeCallFileName,
      phase: 'Processing calls',
    })
  })

  onProgress({
    callsProcessed: recordings.length,
    currentCallFileName: null,
  })

  return {
    enriched: enriched.filter((call): call is EnrichedCall => call != null),
    callsFromCache,
    callsNewlyTranscribed,
    callFailures,
  }
}

function runSanityChecks(
  counts: ReturnType<typeof getTableCounts>,
  expectedEmailInteractions: number,
  expectedCallInteractions: number,
): void {
  if (counts.emailInteractions === 0) {
    throw new Error('Sanity check failed: no email interactions in database')
  }

  if (counts.callInteractions === 0) {
    throw new Error('Sanity check failed: no call interactions in database')
  }

  if (counts.loads === 0) {
    throw new Error('Sanity check failed: no loads in database')
  }

  if (counts.carriers === 0) {
    throw new Error('Sanity check failed: no carriers in database')
  }

  if (counts.rateHistory === 0) {
    throw new Error('Sanity check failed: no rate history in database')
  }

  if (counts.interactions !== expectedEmailInteractions + expectedCallInteractions) {
    throw new Error(
      `Sanity check failed: interaction count mismatch (${counts.interactions} vs ${expectedEmailInteractions + expectedCallInteractions})`,
    )
  }

  if (counts.duplicateIds > 0) {
    throw new Error('Sanity check failed: duplicate interaction IDs found')
  }
}

export async function initializeKnowledgeBase(
  onProgress?: (progress: InitProgress) => void,
): Promise<KnowledgeBaseSummary> {
  markKnowledgeDbReady(false)

  const warnings: string[] = []
  const progress: InitProgress = {
    phase: 'Loading emails',
    emailsLoaded: 0,
    emailsTotal: 0,
    callsProcessed: 0,
    callsTotal: 0,
    currentCallFileName: null,
    warnings,
  }

  const report = () => onProgress?.({ ...progress, warnings: [...warnings] })

  report()

  const emails = loadEmails()
  progress.emailsTotal = emails.length
  progress.emailsLoaded = emails.length
  progress.phase = 'Normalizing emails'
  report()

  const emailInteractions = emails.map(emailToInteraction)

  const recordings = discoverCallRecordings()
  progress.callsTotal = recordings.length
  progress.phase = 'Processing calls'
  report()

  const {
    enriched: processedCalls,
    callsFromCache,
    callsNewlyTranscribed,
    callFailures,
  } = await processCalls(recordings, (update) => {
    Object.assign(progress, update)
    report()
  }, warnings)

  const callInteractions = processedCalls
    .filter((call) => call.transcript?.status === 'success' || call.analysis)
    .map(callToInteraction)

  const interactions: CarrierInteraction[] = applyOverridesToInteractions([
    ...emailInteractions,
    ...callInteractions,
  ])

  progress.phase = 'Writing SQLite knowledge base'
  report()

  const database = await openKnowledgeDatabase()
  clearKnowledgeTables(database)

  const { loads, carriers, rateHistory } = loadSupportingData()

  replaceInteractions(database, interactions)
  replaceLoads(database, loads)
  replaceCarriers(database, carriers)
  replaceRateHistory(database, rateHistory)

  const counts = getTableCounts(database)
  runSanityChecks(counts, emailInteractions.length, callInteractions.length)

  markKnowledgeDbReady(true)

  const summary: KnowledgeBaseSummary = {
    emailsLoaded: emails.length,
    callsTotal: recordings.length,
    callsProcessed: processedCalls.length,
    callsFromCache,
    callsNewlyTranscribed,
    callFailures,
    emailInteractions: emailInteractions.length,
    callInteractions: callInteractions.length,
    totalInteractions: interactions.length,
    loads: counts.loads,
    carriers: counts.carriers,
    rateHistoryRows: counts.rateHistory,
    warnings,
  }

  console.log('Goodlane knowledge base ready')
  console.log(`Emails: ${summary.emailsLoaded}`)
  console.log(`Calls: ${summary.callsTotal}`)
  console.log(`Call failures: ${summary.callFailures}`)
  console.log(`Interactions: ${summary.totalInteractions}`)
  console.log(`Loads: ${summary.loads}`)
  console.log(`Carriers: ${summary.carriers}`)
  console.log(`Rate history rows: ${summary.rateHistoryRows}`)
  if (warnings.length > 0) {
    console.log('Warnings:', warnings)
  }

  progress.phase = warnings.length > 0 ? 'Ready with warnings' : 'Ready'
  report()

  return summary
}
