import type { EmailAnalysis } from '../types/email'

const ANALYSIS_KEY = 'goodlane_email_analysis_v1'

type StoredEmailAnalysis = Record<string, EmailAnalysis>

let analysisCache: StoredEmailAnalysis | null = null

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

function getAnalysisCache(): StoredEmailAnalysis {
  if (!analysisCache) {
    analysisCache = readJson<StoredEmailAnalysis>(ANALYSIS_KEY, {})
  }
  return analysisCache
}

function persistAnalysis(): void {
  writeJson(ANALYSIS_KEY, getAnalysisCache())
}

export function loadStoredEmailAnalysis(): StoredEmailAnalysis {
  return { ...getAnalysisCache() }
}

export function saveEmailAnalysis(emailId: string, analysis: EmailAnalysis): void {
  const cache = getAnalysisCache()
  cache[emailId] = analysis
  persistAnalysis()
}

export function clearStoredEmailAnalysis(): void {
  analysisCache = {}
  localStorage.removeItem(ANALYSIS_KEY)
}
