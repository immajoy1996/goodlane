import type { CallAvailability, CallRateStatus } from './calls'

export type CarrierEmail = {
  email_id: string
  timestamp: string
  from_name: string | null
  from_email: string
  to_email: string
  subject: string
  body: string
  mc_number: string | null
  load_reference: string | null
  equipment_mentioned: string | null
  rate_quoted_usd: number | null
  intent: string | null
}

/** LLM-extracted rate / availability fields from email body prose. */
export type EmailAnalysis = {
  brokerRateMentionedUsd: number | null
  carrierAskUsd: number | null
  agreedRateUsd: number | null
  rateStatus: CallRateStatus
  availability: CallAvailability
  questionsFromCarrier: string[]
  confidence: number
  warnings: string[]
  needsHumanReview: boolean
}

export type LoadResolutionSource =
  | 'structured_field'
  | 'subject'
  | 'body'
  | 'unknown'

export type ThreadedEmailMeta = {
  rawLoadReference: string | null
  resolvedLoadReference: string | null
  loadResolutionSource: LoadResolutionSource
  normalizedMcNumber: string | null
  normalizedEmail: string
  threadKey: string
  messageWarnings: string[]
}

export type EmailThread = {
  threadId: string
  loadId: string | null
  carrier: {
    mcNumber: string | null
    email: string
    displayName: string | null
  }
  messageCount: number
  firstMessageAt: string
  lastMessageAt: string
  subject: string
  messages: CarrierEmail[]
  threadType: 'single' | 'conversation'
  warnings: string[]
}

export type ThreadFilterType = 'all' | 'conversations' | 'single'

export type ThreadStats = {
  totalEmails: number
  conversations: number
  singleEmails: number
  totalThreads: number
  uniqueLoads: number
  uniqueCarriers: number
  unknownLoadEmails: number
}
