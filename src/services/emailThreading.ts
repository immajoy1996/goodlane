import type {
  CarrierEmail,
  EmailThread,
  LoadResolutionSource,
  ThreadedEmailMeta,
} from '../types/email'

const LOAD_NUMBER_PATTERN = /(?:load\s*#?\s*|#)(\d{8})/gi
const LOAD_NUMBER_CAPTURE = /(?:load\s*#?\s*|#)(\d{8})/i

export function normalizeMcNumber(mcNumber: string | null | undefined): string | null {
  if (!mcNumber) return null
  const digits = mcNumber.replace(/mc/gi, '').replace(/[#\s-]/g, '').replace(/\D/g, '')
  return digits.length > 0 ? digits : null
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function extractLoadFromText(text: string): string | null {
  const match = text.match(LOAD_NUMBER_CAPTURE)
  return match ? match[1] : null
}

function extractAllLoadsFromText(text: string): string[] {
  const matches = [...text.matchAll(LOAD_NUMBER_PATTERN)]
  return [...new Set(matches.map((match) => match[1]))]
}

export function resolveLoadReference(email: CarrierEmail): {
  rawLoadReference: string | null
  resolvedLoadReference: string | null
  loadResolutionSource: LoadResolutionSource
  messageWarnings: string[]
} {
  const rawLoadReference = email.load_reference
  const messageWarnings: string[] = []

  const structuredLoad = rawLoadReference?.trim() || null
  const subjectLoad = extractLoadFromText(email.subject)
  const bodyLoads = extractAllLoadsFromText(email.body)

  if (structuredLoad) {
    const conflictingSubjectLoad =
      subjectLoad && subjectLoad !== structuredLoad ? subjectLoad : null
    const conflictingBodyLoads = bodyLoads.filter((load) => load !== structuredLoad)

    if (conflictingSubjectLoad || conflictingBodyLoads.length > 0) {
      messageWarnings.push('Possible load reference conflict')
    }

    return {
      rawLoadReference,
      resolvedLoadReference: structuredLoad,
      loadResolutionSource: 'structured_field',
      messageWarnings,
    }
  }

  if (subjectLoad) {
    if (bodyLoads.length > 0 && bodyLoads.some((load) => load !== subjectLoad)) {
      messageWarnings.push('Possible load reference conflict')
    }

    return {
      rawLoadReference,
      resolvedLoadReference: subjectLoad,
      loadResolutionSource: 'subject',
      messageWarnings,
    }
  }

  if (bodyLoads.length === 1) {
    return {
      rawLoadReference,
      resolvedLoadReference: bodyLoads[0],
      loadResolutionSource: 'body',
      messageWarnings,
    }
  }

  if (bodyLoads.length > 1) {
    messageWarnings.push('Possible load reference conflict')
  }

  return {
    rawLoadReference,
    resolvedLoadReference: null,
    loadResolutionSource: 'unknown',
    messageWarnings,
  }
}

function buildCarrierIdentity(
  normalizedMcNumber: string | null,
  normalizedEmail: string,
): string | null {
  if (normalizedMcNumber) {
    return `mc:${normalizedMcNumber}`
  }

  if (normalizedEmail) {
    return `email:${normalizedEmail}`
  }

  return null
}

export function buildThreadKey(
  email: CarrierEmail,
  meta: Pick<
    ThreadedEmailMeta,
    'resolvedLoadReference' | 'normalizedMcNumber' | 'normalizedEmail'
  >,
): string {
  const carrierIdentity = buildCarrierIdentity(
    meta.normalizedMcNumber,
    meta.normalizedEmail,
  )

  if (!meta.resolvedLoadReference || !carrierIdentity) {
    return `orphan:${email.email_id}`
  }

  return `${meta.resolvedLoadReference}:${carrierIdentity}`
}

function enrichEmail(email: CarrierEmail): CarrierEmail & ThreadedEmailMeta {
  const normalizedMcNumber = normalizeMcNumber(email.mc_number)
  const normalizedEmail = normalizeEmail(email.from_email)
  const loadResolution = resolveLoadReference(email)

  const meta = {
    ...loadResolution,
    normalizedMcNumber,
    normalizedEmail,
  }

  return {
    ...email,
    ...meta,
    threadKey: buildThreadKey(email, meta),
  }
}

function compareTimestampsAsc(a: string, b: string): number {
  return new Date(a).getTime() - new Date(b).getTime()
}

function compareTimestampsDesc(a: string, b: string): number {
  return new Date(b).getTime() - new Date(a).getTime()
}

export function buildEmailThreads(emails: CarrierEmail[]): EmailThread[] {
  const enrichedEmails = emails.map(enrichEmail)
  const groups = new Map<string, (CarrierEmail & ThreadedEmailMeta)[]>()

  for (const email of enrichedEmails) {
    const existing = groups.get(email.threadKey)
    if (existing) {
      existing.push(email)
    } else {
      groups.set(email.threadKey, [email])
    }
  }

  const threads: EmailThread[] = [...groups.entries()].map(([threadKey, messages]) => {
    const sortedMessages = [...messages].sort((a, b) =>
      compareTimestampsAsc(a.timestamp, b.timestamp),
    )

    const firstMessage = sortedMessages[0]
    const lastMessage = sortedMessages[sortedMessages.length - 1]
    const carrierSource = firstMessage
    const warnings = [
      ...new Set(sortedMessages.flatMap((message) => message.messageWarnings)),
    ]

    const cleanMessages: CarrierEmail[] = sortedMessages.map((message) => ({
      email_id: message.email_id,
      timestamp: message.timestamp,
      from_name: message.from_name,
      from_email: message.from_email,
      to_email: message.to_email,
      subject: message.subject,
      body: message.body,
      mc_number: message.mc_number,
      load_reference: message.load_reference,
      equipment_mentioned: message.equipment_mentioned,
      rate_quoted_usd: message.rate_quoted_usd,
      intent: message.intent,
    }))

    const messageCount = cleanMessages.length

    return {
      threadId: threadKey,
      loadId: firstMessage.resolvedLoadReference,
      carrier: {
        mcNumber: carrierSource.normalizedMcNumber,
        email: carrierSource.normalizedEmail,
        displayName: carrierSource.from_name,
      },
      messageCount,
      firstMessageAt: firstMessage.timestamp,
      lastMessageAt: lastMessage.timestamp,
      subject: lastMessage.subject,
      messages: cleanMessages,
      threadType: messageCount === 1 ? 'single' : 'conversation',
      warnings,
    }
  })

  const sortedThreads = threads.sort((a, b) =>
    compareTimestampsDesc(a.lastMessageAt, b.lastMessageAt),
  )

  assertThreadIntegrity(emails, sortedThreads)

  return sortedThreads
}

export function assertThreadIntegrity(
  rawEmails: CarrierEmail[],
  threads: EmailThread[],
): void {
  const assignedIds = threads.flatMap((thread) => thread.messages.map((message) => message.email_id))
  const uniqueIds = new Set(assignedIds)

  if (assignedIds.length !== rawEmails.length) {
    throw new Error(
      `Thread integrity error: assigned ${assignedIds.length} messages, expected ${rawEmails.length}`,
    )
  }

  if (uniqueIds.size !== rawEmails.length) {
    throw new Error('Thread integrity error: duplicate email assignments detected')
  }

  const rawIdSet = new Set(rawEmails.map((email) => email.email_id))
  for (const id of uniqueIds) {
    if (!rawIdSet.has(id)) {
      throw new Error(`Thread integrity error: unknown email_id ${id}`)
    }
  }

  const messageCountSum = threads.reduce((sum, thread) => sum + thread.messageCount, 0)
  if (messageCountSum !== rawEmails.length) {
    throw new Error(
      `Thread integrity error: sum(thread.messageCount)=${messageCountSum}, expected ${rawEmails.length}`,
    )
  }
}

export function computeThreadStats(
  rawEmails: CarrierEmail[],
  threads: EmailThread[],
): {
  totalEmails: number
  conversations: number
  singleEmails: number
  totalThreads: number
  uniqueLoads: number
  uniqueCarriers: number
  unknownLoadEmails: number
} {
  const enriched = rawEmails.map(enrichEmail)

  return {
    totalEmails: rawEmails.length,
    conversations: threads.filter((thread) => thread.threadType === 'conversation').length,
    singleEmails: threads.filter((thread) => thread.threadType === 'single').length,
    totalThreads: threads.length,
    uniqueLoads: new Set(
      threads.map((thread) => thread.loadId).filter((loadId): loadId is string => loadId !== null),
    ).size,
    uniqueCarriers: new Set(
      threads.map((thread) =>
        thread.carrier.mcNumber
          ? `mc:${thread.carrier.mcNumber}`
          : `email:${thread.carrier.email}`,
      ),
    ).size,
    unknownLoadEmails: enriched.filter(
      (email) => email.loadResolutionSource === 'unknown',
    ).length,
  }
}
