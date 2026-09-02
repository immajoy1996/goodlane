import type { CallAnalysis, CallTranscript } from '../types/calls'

const TRANSCRIPTS_KEY = 'goodlane_call_transcripts_v1'
const ANALYSIS_KEY = 'goodlane_call_analysis_v1'

type StoredTranscripts = Record<string, CallTranscript>
type StoredAnalysis = Record<string, CallAnalysis>

let transcriptCache: StoredTranscripts | null = null
let analysisCache: StoredAnalysis | null = null

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch (error) {
    console.warn(`Failed to read ${key} from localStorage`, error)
    return fallback
  }
}

function writeJson<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    console.error(`Failed to write ${key} to localStorage`, error)
    throw error
  }
}

function getTranscriptCache(): StoredTranscripts {
  if (!transcriptCache) {
    transcriptCache = readJson<StoredTranscripts>(TRANSCRIPTS_KEY, {})
  }
  return transcriptCache
}

function getAnalysisCache(): StoredAnalysis {
  if (!analysisCache) {
    analysisCache = readJson<StoredAnalysis>(ANALYSIS_KEY, {})
  }
  return analysisCache
}

function persistTranscripts(): void {
  writeJson(TRANSCRIPTS_KEY, getTranscriptCache())
}

function persistAnalysis(): void {
  writeJson(ANALYSIS_KEY, getAnalysisCache())
}

export function loadStoredTranscripts(): StoredTranscripts {
  return { ...getTranscriptCache() }
}

export function saveTranscript(transcript: CallTranscript): void {
  const cache = getTranscriptCache()
  cache[transcript.callId] = transcript
  persistTranscripts()
}

export function saveTranscripts(transcripts: CallTranscript[]): void {
  const cache = getTranscriptCache()
  for (const transcript of transcripts) {
    cache[transcript.callId] = transcript
  }
  persistTranscripts()
}

export function clearStoredTranscripts(): void {
  transcriptCache = {}
  localStorage.removeItem(TRANSCRIPTS_KEY)
}

export function loadStoredAnalysis(): StoredAnalysis {
  return { ...getAnalysisCache() }
}

export function saveAnalysis(callId: string, analysis: CallAnalysis): void {
  const cache = getAnalysisCache()
  cache[callId] = analysis
  persistAnalysis()
}

export function clearStoredAnalysis(): void {
  analysisCache = {}
  localStorage.removeItem(ANALYSIS_KEY)
}

export function clearAllCallCache(): void {
  clearStoredTranscripts()
  clearStoredAnalysis()
}
