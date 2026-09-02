export type CallTypeHint =
  | 'rate_negotiation'
  | 'availability_check'
  | 'compliance_check'
  | 'load_details'
  | 'voicemail'
  | 'unknown'

export type DetectedCallType =
  | 'rate_negotiation'
  | 'availability_check'
  | 'compliance_check'
  | 'load_details'
  | 'voicemail'
  | 'mixed'
  | 'other'

export type RawCallRecording = {
  callId: string
  fileName: string
  audioUrl: string
  fileTypeHint: CallTypeHint
  callSequence: number
}

export type TranscriptStatus = 'not_started' | 'transcribing' | 'success' | 'failed'

export type CallTranscript = {
  callId: string
  fileName: string
  transcript: string
  status: TranscriptStatus
  error: string | null
}

export type CallAvailability =
  | 'confirmed'
  | 'available'
  | 'conditional'
  | 'unavailable'
  | 'unknown'

export type CallRateStatus =
  | 'counter'
  | 'accepted'
  | 'quoted'
  | 'asking_rate'
  | 'negotiating'
  | 'none'

export type CallOutcome =
  | 'confirmed'
  | 'negotiating'
  | 'needs_follow_up'
  | 'information_only'
  | 'rejected'
  | 'unknown'

export type CallAnalysis = {
  detectedCallType: DetectedCallType
  carrierName: string | null
  mcNumber: string | null
  dotNumber: string | null
  loadId: string | null
  equipment: string | null
  availability: CallAvailability
  availabilityDate: string | null
  brokerRateMentionedUsd: number | null
  carrierAskUsd: number | null
  agreedRateUsd: number | null
  rateStatus: CallRateStatus
  questionsFromCarrier: string[]
  questionsFromBroker: string[]
  complianceIssues: string[]
  loadDetailsMentioned: {
    pickupDate: string | null
    pickupWindow: string | null
    deliveryDate: string | null
    weightLbs: number | null
    origin: string | null
    destination: string | null
  }
  outcome: CallOutcome
  summary: string
  suggestedNextAction: string | null
  confidence: number
  warnings: string[]
  needsHumanReview: boolean
}

export type EnrichedCall = RawCallRecording & {
  transcript?: CallTranscript
  analysis?: CallAnalysis
}

export type CallThread = {
  threadId: string
  loadId: string | null
  carrierName: string | null
  mcNumber: string | null
  calls: EnrichedCall[]
  callCount: number
  threadType: 'single' | 'conversation'
  warnings: string[]
}

export type CallThreadState = {
  currentRate: number | null
  agreedRate: number | null
  rateStatus: CallRateStatus
  availability: CallAvailability
  outcome: CallOutcome
  carrierName: string | null
  mcNumber: string | null
  loadId: string | null
  equipment: string | null
  lastSummary: string | null
  suggestedNextAction: string | null
  needsHumanReview: boolean
}

export type BatchProgress = {
  active: boolean
  current: number
  total: number
  successful: number
  failed: number
  remaining: number
  label: string
}

export type CallStats = {
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
}

export type CallFilterType =
  | 'all'
  | 'rate_negotiation'
  | 'availability_check'
  | 'compliance_check'
  | 'load_details'
  | 'voicemail'
  | 'single'
  | 'conversation'
  | 'needs_review'

export type CallViewMode = 'recordings' | 'conversations'
