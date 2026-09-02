import { useMemo, useState } from 'react'
import {
  Badge,
  Box,
  Drawer,
  Group,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core'
import type { CarrierInteraction, Conversation } from '../../types/interactions'
import { computeStats, groupInteractions } from '../../services/conversations'
import { discoverCallRecordings } from '../../services/callRecordings'
import { getAllInteractions } from '../../services/retrieval'
import { formatOutcomeLabel } from '../../utils/callFilters'
import { InteractionReviewPanel } from './InteractionReviewPanel'
import './UnifiedConversations.css'

type Props = {
  knowledgeReady: boolean
}

function formatRate(value: number | null): string {
  if (value == null) return '—'
  return `$${value}`
}

function interactionLabel(interaction: CarrierInteraction): string {
  const sourceId = interaction.id.split(':')[1] ?? interaction.id
  return `${interaction.source.toUpperCase()} — ${sourceId}`
}

function confidenceColor(level: string): string {
  if (level === 'high') return 'green'
  if (level === 'medium') return 'yellow'
  return 'red'
}

function TimelineItem({
  interaction,
  audioUrl,
}: {
  interaction: CarrierInteraction
  audioUrl?: string
}) {
  return (
    <Paper withBorder p="md" radius="md" className="timeline-item">
      <Stack gap="xs">
        <Group justify="space-between" align="flex-start">
          <Text fw={700}>{interactionLabel(interaction)}</Text>
          <Group gap={4}>
            <Badge size="xs" color={confidenceColor(interaction.loadIdConfidence)}>
              Load {interaction.loadIdConfidence}
            </Badge>
            <Badge size="xs" color={confidenceColor(interaction.mcNumberConfidence)}>
              MC {interaction.mcNumberConfidence}
            </Badge>
            {interaction.manuallyAssigned && (
              <Badge size="xs" color="blue">
                Manual
              </Badge>
            )}
          </Group>
        </Group>
        <Group gap="md">
          <Text size="xs" c="dimmed">
            Load: {interaction.loadId ?? '—'}
          </Text>
          <Text size="xs" c="dimmed">
            MC: {interaction.mcNumber ?? '—'}
          </Text>
        </Group>
        {interaction.timestamp && (
          <Text size="xs" c="dimmed">
            {new Date(interaction.timestamp).toLocaleString()}
          </Text>
        )}
        {audioUrl && <audio controls src={audioUrl} style={{ width: '100%' }} />}
        <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
          {interaction.rawText}
        </Text>
      </Stack>
    </Paper>
  )
}

export function UnifiedConversations({ knowledgeReady }: Props) {
  const [refreshKey, setRefreshKey] = useState(0)
  const calls = useMemo(() => discoverCallRecordings(), [])
  const interactions = useMemo(
    () => (knowledgeReady ? getAllInteractions() : []),
    [knowledgeReady, refreshKey],
  )
  const conversations = useMemo(() => groupInteractions(interactions), [interactions])
  const stats = useMemo(() => computeStats(interactions, conversations), [interactions, conversations])

  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const selected = useMemo(
    () => conversations.find((conversation) => conversation.key === selectedKey) ?? null,
    [conversations, selectedKey],
  )

  const audioByCallId = useMemo(
    () => new Map(calls.map((call) => [call.callId, call.audioUrl])),
    [calls],
  )

  return (
    <Box className="unified-conversations">
      <Stack gap="md" p="md">
        <div>
          <Title order={3}>Unified Conversations</Title>
          <Text size="sm" c="dimmed">
            {knowledgeReady
              ? 'Cross-channel data from SQLite knowledge base'
              : 'Prepare the knowledge base on the Agent tab to load unified data'}
          </Text>
        </div>

        {!knowledgeReady && (
          <Paper withBorder p="md">
            <Text size="sm">Knowledge base not prepared yet.</Text>
          </Paper>
        )}

        {knowledgeReady && (
          <>
        <InteractionReviewPanel
          refreshKey={refreshKey}
          onAssigned={() => setRefreshKey((value) => value + 1)}
        />

        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
          <Stat label="Emails" value={stats.emailInteractions} />
          <Stat label="Calls" value={stats.callInteractions} />
          <Stat label="Conversations" value={stats.conversations} />
          <Stat label="Cross-Channel" value={stats.crossChannel} />
        </SimpleGrid>

        <ConversationTable conversations={conversations} onSelect={setSelectedKey} />
          </>
        )}
      </Stack>

      <Drawer
        opened={selectedKey !== null}
        onClose={() => setSelectedKey(null)}
        position="right"
        size="xl"
        title="Unified Timeline"
      >
        {selected && <ConversationTimeline conversation={selected} audioByCallId={audioByCallId} />}
      </Drawer>
    </Box>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Paper withBorder p="sm" radius="md">
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {label}
      </Text>
      <Text size="xl" fw={700}>
        {value}
      </Text>
    </Paper>
  )
}

function ConversationTable({
  conversations,
  onSelect,
}: {
  conversations: Conversation[]
  onSelect: (key: string) => void
}) {
  return (
    <Paper withBorder radius="md" className="conversation-table-shell">
      <ScrollArea>
        <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Load</Table.Th>
              <Table.Th>Carrier</Table.Th>
              <Table.Th>MC #</Table.Th>
              <Table.Th>Review</Table.Th>
              <Table.Th>Emails</Table.Th>
              <Table.Th>Calls</Table.Th>
              <Table.Th>Availability</Table.Th>
              <Table.Th>Current Rate</Table.Th>
              <Table.Th>Agreed Rate</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Last Source</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {conversations.map((conversation) => (
              <Table.Tr
                key={conversation.key}
                style={{ cursor: 'pointer' }}
                onClick={() => onSelect(conversation.key)}
              >
                <Table.Td>{conversation.loadId ?? '—'}</Table.Td>
                <Table.Td>{conversation.carrierName ?? 'Unknown'}</Table.Td>
                <Table.Td>{conversation.mcNumber ?? '—'}</Table.Td>
                <Table.Td>
                  {conversation.interactions.some((interaction) => interaction.needsReview) ? (
                    <Badge color="red" size="sm">
                      Review
                    </Badge>
                  ) : (
                    <Badge color="green" size="sm" variant="light">
                      OK
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td>{conversation.emailCount}</Table.Td>
                <Table.Td>{conversation.callCount}</Table.Td>
                <Table.Td>{formatOutcomeLabel(conversation.state.availability ?? 'unknown')}</Table.Td>
                <Table.Td>{formatRate(conversation.state.currentRate)}</Table.Td>
                <Table.Td>{formatRate(conversation.state.agreedRate)}</Table.Td>
                <Table.Td>{formatOutcomeLabel(conversation.state.status ?? 'unknown')}</Table.Td>
                <Table.Td>{conversation.state.lastSource ?? '—'}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Paper>
  )
}

function ConversationTimeline({
  conversation,
  audioByCallId,
}: {
  conversation: Conversation
  audioByCallId: Map<string, string>
}) {
  return (
    <ScrollArea h="calc(100vh - 80px)">
      <Stack gap="md" pr="sm">
        <Paper withBorder p="md">
          <Title order={4}>
            Load #{conversation.loadId ?? '—'} · {conversation.carrierName ?? 'Unknown'}
          </Title>
          <Text size="sm" c="dimmed">
            MC {conversation.mcNumber ?? '—'} · {conversation.emailCount} emails ·{' '}
            {conversation.callCount} calls
          </Text>
          <Group gap="xs" mt="xs">
            <Badge>Status: {formatOutcomeLabel(conversation.state.status ?? 'unknown')}</Badge>
            <Badge color="blue">Rate: {formatRate(conversation.state.currentRate)}</Badge>
            {conversation.state.agreedRate != null && (
              <Badge color="green">Agreed: {formatRate(conversation.state.agreedRate)}</Badge>
            )}
          </Group>
        </Paper>

        {conversation.interactions.map((interaction) => {
          const callId = interaction.id.startsWith('call:')
            ? interaction.id.slice('call:'.length)
            : null

          return (
            <TimelineItem
              key={interaction.id}
              interaction={interaction}
              audioUrl={callId ? audioByCallId.get(callId) : undefined}
            />
          )
        })}
      </Stack>
    </ScrollArea>
  )
}
