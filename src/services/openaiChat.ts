export async function postChatCompletion(body: Record<string, unknown>): Promise<unknown> {
  const url = import.meta.env.VITE_OPENAI_CHAT_URL?.trim()
  if (!url) {
    throw new Error('Missing VITE_OPENAI_CHAT_URL')
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const rawBody = await response.text()

  if (!response.ok) {
    throw new Error(`Chat Lambda failed (${response.status}): ${rawBody}`)
  }

  try {
    return JSON.parse(rawBody)
  } catch {
    throw new Error(`Invalid chat response: ${rawBody}`)
  }
}

export function extractAssistantMessage(data: unknown): AssistantMessage {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Invalid chat response format')
  }

  const response = data as Record<string, unknown>
  const choices = response.choices as Array<{ message?: AssistantMessage }> | undefined
  const message = choices?.[0]?.message

  if (!message) {
    throw new Error('Chat response did not contain a message')
  }

  return message
}

export type ToolCall = {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export type AssistantMessage = {
  role: 'assistant'
  content: string | null
  tool_calls?: ToolCall[]
}

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | AssistantMessage
  | { role: 'tool'; tool_call_id: string; content: string }
