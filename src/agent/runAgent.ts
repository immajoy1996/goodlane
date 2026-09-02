import {
  AGENT_TOOLS,
  executeTool,
  summarizeToolResult,
  type ToolActivity,
} from './tools'
import {
  extractAssistantMessage,
  postChatCompletion,
  type ChatMessage,
} from '../services/openaiChat'

const AGENT_MODEL = import.meta.env.VITE_ANALYSIS_MODEL?.trim() || 'gpt-4.1-mini'
const MAX_TOOL_ROUNDS = 5

const SYSTEM_PROMPT = `You are an AI freight broker intake assistant for Goodlane Logistics.

You help brokers understand inbound carrier communications across email and phone calls.

Use the provided tools whenever the answer depends on load, carrier, interaction, or market data.

Never invent load details, carrier status, rates, availability, compliance information, or historical context.

Important rate semantics:
- broker rate = rate Goodlane offered or mentioned
- carrier rate = carrier's current ask
- agreed rate = explicitly accepted/agreed rate

Do not confuse these.

Use the latest valid interaction when determining current state.

A carrier is not confirmed merely because they expressed interest.

When relevant, distinguish: confirmed, available, conditional, unavailable, unknown.

If data is missing or conflicting, say so.

Prefer concise operational answers.

When possible, mention the source interaction IDs supporting important claims.

If the user refers to a carrier by name, contact, email, MC number, or DOT number and the carrier identity is not already known, use find_carrier first.

Once the carrier is resolved to an MC number, use get_carrier_history when the user asks about reliability, authority, insurance, safety, onboarding, or previous loads.

If find_carrier returns multiple plausible matches, do not guess. Tell the user which matches exist or ask which one they mean.

If the user asks for a draft email, retrieve the required context first and then draft the email.

Do not claim an email was sent. You only draft emails.

Email draft format when drafting:
Subject: ...
Hi [name or blank greeting],
...
Best,
Goodlane Logistics`

export type AgentResult = {
  answer: string
  activity: ToolActivity[]
}

export async function runAgent(
  userMessage: string,
  previousMessages: ChatMessage[] = [],
): Promise<AgentResult> {
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...previousMessages,
    { role: 'user', content: userMessage },
  ]

  const activity: ToolActivity[] = []

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const data = await postChatCompletion({
      model: AGENT_MODEL,
      messages,
      tools: AGENT_TOOLS,
      tool_choice: 'auto',
    })

    const message = extractAssistantMessage(data)

    if (!message.tool_calls?.length) {
      return {
        answer: message.content?.trim() || 'No response from agent.',
        activity,
      }
    }

    messages.push({
      role: 'assistant',
      content: message.content,
      tool_calls: message.tool_calls,
    })

    for (const toolCall of message.tool_calls) {
      const name = toolCall.function.name
      let args: Record<string, unknown>

      try {
        args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>
      } catch {
        throw new Error('Could not parse tool arguments')
      }

      const result = executeTool(name, args)

      activity.push({
        name,
        args,
        resultSummary: summarizeToolResult(name, result),
      })

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      })
    }
  }

  throw new Error('Maximum tool-call rounds reached')
}
