import type { CallAnalysis, CallTypeHint } from '../types/calls'
import { normalizeStringList } from '../utils/normalizeStringList'
import { getChatUrl } from './chatConfig'

const ANALYSIS_MODEL = import.meta.env.VITE_ANALYSIS_MODEL?.trim() || 'gpt-4.1-mini'

const SYSTEM_PROMPT = `You analyze freight broker/carrier phone call transcripts.

Extract structured freight information. Be conservative and never hallucinate missing values.

Return valid JSON only with these fields:
detectedCallType, carrierName, mcNumber, dotNumber, loadId, equipment, availability,
availabilityDate, brokerRateMentionedUsd, carrierAskUsd, agreedRateUsd, rateStatus,
questionsFromCarrier, questionsFromBroker, complianceIssues, loadDetailsMentioned,
outcome, summary, suggestedNextAction, confidence, warnings, needsHumanReview

RATE RULES:
- A call may contain multiple dollar amounts. Do NOT treat them as interchangeable.
- brokerRateMentionedUsd = rate offered/mentioned by the broker.
- carrierAskUsd = rate requested/needed by the carrier.
- agreedRateUsd = only when the transcript clearly indicates acceptance/agreement on a specific rate.
- Do NOT mark a rate as agreed just because both parties mentioned the same number unless acceptance is explicit.
- rateStatus should reflect the negotiation state.

CARRIER IDENTITY:
- Extract carrier name, MC number, DOT number when clearly stated.
- Normalize MC numbers to digits only when confident.
- If MC is garbled or uncertain, set mcNumber to null and needsHumanReview=true with a warning.

LOAD IDENTITY:
- Extract numeric load IDs when clearly spoken (e.g. "load 29372450").
- Do not infer a load ID from vague references like "the Jersey load".

AVAILABILITY:
- "I have a truck Friday" -> available
- "I might have one Friday" -> conditional
- "We're booked, driver will be there Friday" -> confirmed
- "We can't cover it" -> unavailable
- Vague availability should remain unknown/conditional, not confirmed.

FILENAME TYPE HINT:
- The filename type hint is metadata only and may not match actual call content.
- Set detectedCallType from transcript content, not from the hint.

detectedCallType must be one of: rate_negotiation, availability_check, compliance_check, load_details, voicemail, mixed, other
availability must be one of: confirmed, available, conditional, unavailable, unknown
rateStatus must be one of: counter, accepted, quoted, asking_rate, negotiating, none
outcome must be one of: confirmed, negotiating, needs_follow_up, information_only, rejected, unknown
loadDetailsMentioned must be an object with: pickupDate, pickupWindow, deliveryDate, weightLbs, origin, destination`

function buildAnalysisPrompt(transcript: string, fileTypeHint: CallTypeHint): string {
  return `${SYSTEM_PROMPT}

Filename type hint (metadata only): ${fileTypeHint}

Transcript:
${transcript}`
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

function parseAnalysisJson(content: string): CallAnalysis {
  const trimmed = content.trim()
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const jsonText = fencedMatch ? fencedMatch[1].trim() : trimmed

  return JSON.parse(jsonText) as CallAnalysis
}

export async function analyzeCall(
  transcript: string,
  fileTypeHint: CallTypeHint,
): Promise<CallAnalysis> {
  const prompt = buildAnalysisPrompt(transcript, fileTypeHint)

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

  return normalizeCallAnalysis(parsed)
}

export function normalizeCallAnalysis(parsed: CallAnalysis): CallAnalysis {
  return {
    ...parsed,
    mcNumber: parsed.mcNumber ? parsed.mcNumber.replace(/\D/g, '') || null : null,
    loadId: parsed.loadId ? parsed.loadId.replace(/\D/g, '') || null : null,
    questionsFromCarrier: normalizeStringList(parsed.questionsFromCarrier),
    questionsFromBroker: normalizeStringList(parsed.questionsFromBroker),
    complianceIssues: normalizeStringList(parsed.complianceIssues),
    warnings: normalizeStringList(parsed.warnings),
  }
}
