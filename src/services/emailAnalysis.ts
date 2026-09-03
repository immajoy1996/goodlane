import type { CarrierEmail, EmailAnalysis } from '../types/email'
import { normalizeStringList } from '../utils/normalizeStringList'
import { getChatUrl } from './chatConfig'

const ANALYSIS_MODEL = import.meta.env.VITE_ANALYSIS_MODEL?.trim() || 'gpt-4.1-mini'

const SYSTEM_PROMPT = `You analyze inbound freight carrier emails to a broker (Goodlane Logistics).

Extract structured rate and availability information from the email subject and body.
Be conservative and never hallucinate missing values.

Return valid JSON only with these fields:
brokerRateMentionedUsd, carrierAskUsd, agreedRateUsd, rateStatus, availability,
questionsFromCarrier, confidence, warnings, needsHumanReview

RATE RULES:
- An email may contain multiple dollar amounts. Do NOT treat them as interchangeable.
- brokerRateMentionedUsd = rate the broker posted/offered that the carrier is referencing
  (e.g. "Rate is posted as $310", "$310 won't cover", "not at $310").
- carrierAskUsd = rate the carrier is requesting or countering with
  (e.g. "Can you do $335?", "We could do $355", "floor is $360", "need at least $345").
- agreedRateUsd = only when the carrier explicitly accepts/agrees on a specific rate
  (e.g. "Agreed on $280", "Confirmed at $295").
- Do NOT set agreedRateUsd just because a number appears, or because intent metadata says confirm.
- If the carrier only asks whether a posted rate is firm, that posted amount is brokerRateMentionedUsd,
  not carrierAskUsd or agreedRateUsd.
- rateStatus should reflect negotiation state: counter, accepted, quoted, asking_rate, negotiating, or none.

AVAILABILITY:
- Explicit confirmation / "we're in" / "driver confirmed" -> confirmed
- Offering a truck / interested / can cover -> available
- Soft/maybe language -> conditional
- Cannot cover / declining -> unavailable
- Otherwise -> unknown

questionsFromCarrier = explicit questions the carrier asked (strings).
confidence = 0-1. warnings = short strings. needsHumanReview = true when rates are ambiguous.`

const RATE_CONTENT_RE = /\$\s*\d/

export function emailLikelyHasRateContent(email: CarrierEmail): boolean {
  return RATE_CONTENT_RE.test(email.subject) || RATE_CONTENT_RE.test(email.body)
}

function buildAnalysisPrompt(email: CarrierEmail): string {
  return `${SYSTEM_PROMPT}

Structured metadata (may be incomplete or wrong — prefer the email text for rates):
- intent: ${email.intent ?? 'unknown'}
- rate_quoted_usd: ${email.rate_quoted_usd ?? 'null'}
- mc_number: ${email.mc_number ?? 'null'}
- load_reference: ${email.load_reference ?? 'null'}

Subject: ${email.subject}

Body:
${email.body}`
}

function extractChatContent(data: unknown): string {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Invalid chat response format')
  }

  const response = data as Record<string, unknown>

  if (typeof response.text === 'string' && response.text.trim()) {
    return response.text.trim()
  }

  const choices = response.choices as Array<{ message?: { content?: string } }> | undefined
  const content = choices?.[0]?.message?.content

  if (typeof content === 'string' && content.trim()) {
    return content.trim()
  }

  throw new Error('Chat response did not contain text content')
}

function parseAnalysisJson(content: string): EmailAnalysis {
  const trimmed = content.trim()
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const jsonText = fencedMatch ? fencedMatch[1].trim() : trimmed

  return JSON.parse(jsonText) as EmailAnalysis
}

export function normalizeEmailAnalysis(parsed: EmailAnalysis): EmailAnalysis {
  return {
    ...parsed,
    brokerRateMentionedUsd: normalizeUsd(parsed.brokerRateMentionedUsd),
    carrierAskUsd: normalizeUsd(parsed.carrierAskUsd),
    agreedRateUsd: normalizeUsd(parsed.agreedRateUsd),
    questionsFromCarrier: normalizeStringList(parsed.questionsFromCarrier),
    warnings: normalizeStringList(parsed.warnings),
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
    needsHumanReview: Boolean(parsed.needsHumanReview),
    rateStatus: parsed.rateStatus ?? 'none',
    availability: parsed.availability ?? 'unknown',
  }
}

function normalizeUsd(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(Number(value))) return null
  return Number(value)
}

export async function analyzeEmail(email: CarrierEmail): Promise<EmailAnalysis> {
  const prompt = buildAnalysisPrompt(email)

  const response = await fetch(getChatUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: ANALYSIS_MODEL,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  })

  const rawBody = await response.text()

  if (!response.ok) {
    throw new Error(`Chat Lambda failed (${response.status}): ${rawBody}`)
  }

  let data: unknown

  try {
    data = JSON.parse(rawBody)
  } catch {
    throw new Error(`Invalid chat response: ${rawBody}`)
  }

  const content = extractChatContent(data)
  const parsed = parseAnalysisJson(content)

  return normalizeEmailAnalysis(parsed)
}
