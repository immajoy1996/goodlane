import {
  Badge,
  Box,
  Button,
  Code,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Textarea,
  Title,
} from '@mantine/core'
import { useState } from 'react'
import { runAgent } from '../../agent/runAgent'
import type { InitProgress, KnowledgeBaseStatus } from '../../data/initializeKnowledgeBase'
import type { ChatMessage } from '../../services/openaiChat'
import { isChatConfigured } from '../../services/chatConfig'
import './AgentPage.css'

const EXAMPLE_PROMPTS = [
  'Which carriers have confirmed availability for load 29372289?',
  'What is the best current rate for load 29372289?',
  'Tell me about MC 107654',
  'Draft an email to MC 107654 offering $310 for load 29372289',
]

type ChatTurn = {
  role: 'user' | 'assistant'
  content: string
}

type Props = {
  knowledgeStatus: KnowledgeBaseStatus
  knowledgeProgress: InitProgress | null
  knowledgeReady: boolean
  onPrepareKnowledgeBase: () => void
}

export function AgentPage({
  knowledgeStatus,
  knowledgeProgress,
  knowledgeReady,
  onPrepareKnowledgeBase,
}: Props) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [activity, setActivity] = useState<
    Array<{ name: string; args: unknown; resultSummary: string }>
  >([])

  async function handleAsk(prompt = input) {
    const question = prompt.trim()
    if (!question || loading || !knowledgeReady) return

    if (!isChatConfigured()) {
      setError('Missing VITE_OPENAI_CHAT_URL. Add it to .env and restart the dev server.')
      return
    }

    setLoading(true)
    setError(null)
    setTurns((prev) => [...prev, { role: 'user', content: question }])
    setInput('')

    try {
      const previousMessages: ChatMessage[] = turns.map((turn) => ({
        role: turn.role,
        content: turn.content,
      }))
      const result = await runAgent(question, previousMessages)
      setActivity(result.activity)
      setTurns((prev) => [...prev, { role: 'assistant', content: result.answer }])
    } catch (err) {
      console.error('Agent request failed:', err)
      const message = err instanceof Error ? err.message : 'Agent request failed.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const lastAnswer = [...turns].reverse().find((turn) => turn.role === 'assistant')?.content
  const isDraft = lastAnswer?.includes('Subject:')

  return (
    <Box className="agent-page" p="md">
      <Stack gap="md">
        <div>
          <Title order={3}>Goodlane Carrier Agent</Title>
          <Text size="sm" c="dimmed">
            Ask about loads, carriers, rates, or request an email draft
          </Text>
        </div>

        {!knowledgeReady && (
          <Paper withBorder p="md" radius="md">
            <Stack gap="sm">
              <Text fw={600}>
                {knowledgeStatus === 'loading'
                  ? 'Preparing carrier knowledge base...'
                  : 'Knowledge base required'}
              </Text>
              <Text size="sm" c="dimmed">
                Emails and calls must be normalized into SQLite before the agent can query
                operational data.
              </Text>

              {knowledgeStatus === 'idle' && (
                <Button onClick={onPrepareKnowledgeBase}>Prepare Knowledge Base</Button>
              )}

              {knowledgeStatus === 'loading' && knowledgeProgress && (
                <Stack gap="xs">
                  <Group gap="xs">
                    <Loader size="sm" />
                    <Text size="sm">{knowledgeProgress.phase}</Text>
                  </Group>
                  <Text size="sm">
                    Emails: {knowledgeProgress.emailsLoaded} / {knowledgeProgress.emailsTotal}
                  </Text>
                  <Text size="sm">
                    Calls processed: {knowledgeProgress.callsProcessed} /{' '}
                    {knowledgeProgress.callsTotal}
                  </Text>
                  {knowledgeProgress.currentCallFileName && (
                    <Text size="sm" c="dimmed">
                      Transcribing: {knowledgeProgress.currentCallFileName}
                    </Text>
                  )}
                </Stack>
              )}

              {knowledgeStatus === 'error' && (
                <Button variant="light" onClick={onPrepareKnowledgeBase}>
                  Retry
                </Button>
              )}
            </Stack>
          </Paper>
        )}

        <Group gap="xs">
          {EXAMPLE_PROMPTS.map((prompt) => (
            <Button
              key={prompt}
              variant="light"
              size="xs"
              disabled={!knowledgeReady}
              onClick={() => {
                setInput(prompt)
                void handleAsk(prompt)
              }}
            >
              {prompt.length > 48 ? `${prompt.slice(0, 48)}…` : prompt}
            </Button>
          ))}
        </Group>

        <Textarea
          placeholder="Ask about a load, carrier, rate, or draft..."
          value={input}
          disabled={!knowledgeReady}
          onChange={(event) => setInput(event.currentTarget.value)}
          minRows={2}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void handleAsk()
            }
          }}
        />

        <Button
          onClick={() => void handleAsk()}
          loading={loading}
          disabled={!knowledgeReady || !input.trim()}
        >
          Ask
        </Button>

        {error && (
          <Paper withBorder p="md" bg="red.0">
            <Text c="red">{error}</Text>
          </Paper>
        )}

        {turns.length > 0 && (
          <Paper withBorder p="md">
            <Stack gap="sm">
              <Text fw={600}>Conversation</Text>
              {turns.map((turn, index) => (
                <Box key={index}>
                  <Badge variant="light" mb={4}>
                    {turn.role}
                  </Badge>
                  <Text style={{ whiteSpace: 'pre-wrap' }}>{turn.content}</Text>
                </Box>
              ))}
            </Stack>
          </Paper>
        )}

        {isDraft && lastAnswer && (
          <Paper withBorder p="md" className="draft-card">
            <Group justify="space-between" mb="sm">
              <Text fw={600}>Email Draft</Text>
              <Button size="xs" variant="outline" onClick={() => void navigator.clipboard.writeText(lastAnswer)}>
                Copy
              </Button>
            </Group>
            <Text style={{ whiteSpace: 'pre-wrap' }}>{lastAnswer}</Text>
          </Paper>
        )}

        {activity.length > 0 && (
          <Paper withBorder p="md">
            <Text fw={600} mb="sm">
              Sources / Activity
            </Text>
            <Stack gap="xs">
              {activity.map((item, index) => (
                <Box key={index}>
                  <Text size="sm" fw={500}>
                    ✓ {item.name}
                  </Text>
                  <Code block>{JSON.stringify(item.args, null, 2)}</Code>
                  <Text size="xs" c="dimmed">
                    {item.resultSummary}
                  </Text>
                </Box>
              ))}
            </Stack>
          </Paper>
        )}
      </Stack>
    </Box>
  )
}
