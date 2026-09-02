export type ConfidenceLevel = 'high' | 'medium' | 'low'

export type CarrierInteraction = {
  id: string
  source: 'email' | 'call'
  loadId: string | null
  carrierName: string | null
  mcNumber: string | null
  availability: string | null
  carrierRate: number | null
  brokerRate: number | null
  agreedRate: number | null
  equipment: string | null
  questions: string[]
  timestamp: string | null
  rawText: string
  loadIdConfidence: ConfidenceLevel
  mcNumberConfidence: ConfidenceLevel
  needsReview: boolean
  resolutionWarnings: string[]
  manuallyAssigned: boolean
}

export type ConversationState = {
  availability: string | null
  currentRate: number | null
  brokerRate: number | null
  agreedRate: number | null
  status: string | null
  equipment: string | null
  openQuestions: string[]
  lastSource: 'email' | 'call' | null
}

export type Conversation = {
  key: string
  loadId: string | null
  carrierName: string | null
  mcNumber: string | null
  interactions: CarrierInteraction[]
  emailCount: number
  callCount: number
  state: ConversationState
}
