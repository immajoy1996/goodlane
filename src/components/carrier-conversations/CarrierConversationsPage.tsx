import {
  Badge,
  Box,
  Drawer,
  Group,
  Paper,
  ScrollArea,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useMemo, useState } from 'react'
import type { EmailThread } from '../../types/email'
import {
  defaultThreadFilters,
  filterThreads,
  formatMessageDateTime,
  formatThreadDate,
  type ThreadFilters,
} from '../../utils/threadFilters'
import './CarrierConversations.css'

type CarrierConversationsPageProps = {
  threads: EmailThread[]
  stats: {
    totalEmails: number
    conversations: number
    singleEmails: number
    totalThreads: number
    uniqueLoads: number
    uniqueCarriers: number
    unknownLoadEmails: number
  }
}

function StatCard({ label, value }: { label: string; value: number }) {
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

function ThreadTypeBadge({ thread }: { thread: EmailThread }) {
  const label = `${thread.messageCount} message${thread.messageCount === 1 ? '' : 's'}`

  return (
    <Badge
      variant={thread.threadType === 'conversation' ? 'filled' : 'light'}
      color={thread.threadType === 'conversation' ? 'blue' : 'gray'}
    >
      {label}
    </Badge>
  )
}

function ThreadDetailDrawer({
  thread,
  opened,
  onClose,
}: {
  thread: EmailThread | null
  opened: boolean
  onClose: () => void
}) {
  if (!thread) {
    return null
  }

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="lg"
      title="Conversation"
      padding="md"
    >
      <Stack gap="md">
        <Paper withBorder p="md" radius="md">
          <Stack gap={4}>
            <Title order={4}>{thread.carrier.displayName ?? 'Unknown Carrier'}</Title>
            <Text size="sm" c="dimmed">
              {thread.carrier.email}
            </Text>
            <Group gap="lg">
              <Text size="sm">
                <Text span fw={600}>
                  MC #
                </Text>{' '}
                {thread.carrier.mcNumber ?? '—'}
              </Text>
              <Text size="sm">
                <Text span fw={600}>
                  Load #
                </Text>{' '}
                {thread.loadId ?? '—'}
              </Text>
              <Text size="sm">
                <Text span fw={600}>
                  Messages
                </Text>{' '}
                {thread.messageCount}
              </Text>
            </Group>
            {thread.warnings.length > 0 && (
              <Stack gap={4}>
                {thread.warnings.map((warning) => (
                  <Badge key={warning} color="orange" variant="light">
                    {warning}
                  </Badge>
                ))}
              </Stack>
            )}
          </Stack>
        </Paper>

        <ScrollArea h="calc(100vh - 220px)">
          <Stack gap="md">
            {thread.messages.map((message) => (
              <Paper key={message.email_id} withBorder p="md" radius="md">
                <Stack gap="xs">
                  <Text size="xs" c="dimmed" fw={600}>
                    {formatMessageDateTime(message.timestamp)}
                  </Text>
                  <Text fw={600}>{message.subject}</Text>
                  <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                    {message.body}
                  </Text>
                </Stack>
              </Paper>
            ))}
          </Stack>
        </ScrollArea>
      </Stack>
    </Drawer>
  )
}

export function CarrierConversationsPage({ threads, stats }: CarrierConversationsPageProps) {
  const [filters, setFilters] = useState<ThreadFilters>(defaultThreadFilters)
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)

  const filteredThreads = useMemo(() => filterThreads(threads, filters), [threads, filters])
  const selectedThread = useMemo(
    () => threads.find((thread) => thread.threadId === selectedThreadId) ?? null,
    [threads, selectedThreadId],
  )

  return (
    <Box className="carrier-conversations">
      <Stack gap="md" p="md">
        <Group justify="space-between" align="flex-end">
          <div>
            <Title order={3}>Carrier Conversations</Title>
            <Text size="sm" c="dimmed">
              Inbound freight carrier email threads reconstructed by load and carrier
            </Text>
          </div>
        </Group>

        <SimpleGrid cols={{ base: 2, sm: 3, md: 6 }} spacing="sm">
          <StatCard label="Total Emails" value={stats.totalEmails} />
          <StatCard label="Conversations" value={stats.conversations} />
          <StatCard label="Single Emails" value={stats.singleEmails} />
          <StatCard label="Total Threads" value={stats.totalThreads} />
          <StatCard label="Unique Loads" value={stats.uniqueLoads} />
          <StatCard label="Unique Carriers" value={stats.uniqueCarriers} />
        </SimpleGrid>

        <Paper withBorder p="md" radius="md">
          <Stack gap="md">
            <Group grow align="flex-end">
              <TextInput
                label="Search"
                placeholder="Carrier, MC, load, subject, body..."
                value={filters.search}
                onChange={(event) => {
                  const search = event.currentTarget.value
                  setFilters((current) => ({ ...current, search }))
                }}
              />
              <TextInput
                label="Load ID"
                placeholder="29001091"
                value={filters.loadId}
                onChange={(event) => {
                  const loadId = event.currentTarget.value
                  setFilters((current) => ({ ...current, loadId }))
                }}
              />
              <TextInput
                label="Carrier"
                placeholder="Name or email"
                value={filters.carrier}
                onChange={(event) => {
                  const carrier = event.currentTarget.value
                  setFilters((current) => ({ ...current, carrier }))
                }}
              />
            </Group>

            <Group justify="space-between">
              <SegmentedControl
                value={filters.type}
                onChange={(value) =>
                  setFilters((current) => ({
                    ...current,
                    type: value as ThreadFilters['type'],
                  }))
                }
                data={[
                  { label: 'All', value: 'all' },
                  { label: 'Conversations', value: 'conversations' },
                  { label: 'Single emails', value: 'single' },
                ]}
              />
              <Text size="sm" c="dimmed">
                Showing {filteredThreads.length} of {threads.length} threads
              </Text>
            </Group>
          </Stack>
        </Paper>

        <Paper withBorder radius="md" className="thread-table-shell">
          <ScrollArea>
            <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Carrier</Table.Th>
                  <Table.Th>MC #</Table.Th>
                  <Table.Th>Load #</Table.Th>
                  <Table.Th>Latest subject</Table.Th>
                  <Table.Th>Messages</Table.Th>
                  <Table.Th>Last activity</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filteredThreads.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={6}>
                      <Text ta="center" c="dimmed" py="lg">
                        No threads match your search or filters.
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  filteredThreads.map((thread) => (
                    <Table.Tr
                      key={thread.threadId}
                      className={
                        thread.threadType === 'conversation'
                          ? 'thread-row thread-row--conversation'
                          : 'thread-row thread-row--single'
                      }
                      onClick={() => setSelectedThreadId(thread.threadId)}
                      style={{ cursor: 'pointer' }}
                    >
                      <Table.Td>
                        <Stack gap={0}>
                          <Text fw={600}>{thread.carrier.displayName ?? 'Unknown Carrier'}</Text>
                          <Text size="xs" c="dimmed">
                            {thread.carrier.email}
                          </Text>
                        </Stack>
                      </Table.Td>
                      <Table.Td>{thread.carrier.mcNumber ?? '—'}</Table.Td>
                      <Table.Td>{thread.loadId ?? '—'}</Table.Td>
                      <Table.Td>
                        <Text size="sm" lineClamp={2}>
                          {thread.subject}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <ThreadTypeBadge thread={thread} />
                      </Table.Td>
                      <Table.Td>{formatThreadDate(thread.lastMessageAt)}</Table.Td>
                    </Table.Tr>
                  ))
                )}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Paper>
      </Stack>

      <ThreadDetailDrawer
        thread={selectedThread}
        opened={selectedThreadId !== null}
        onClose={() => setSelectedThreadId(null)}
      />
    </Box>
  )
}
