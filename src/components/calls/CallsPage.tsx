import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Paper,
  Progress,
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
import { useCallRecordings } from '../../hooks/useCallRecordings'
import type { CallViewMode, EnrichedCall } from '../../types/calls'
import {
  defaultCallFilters,
  filterCallThreads,
  filterCalls,
  formatCallTypeLabel,
  formatOutcomeLabel,
  type CallFilters,
} from '../../utils/callFilters'
import { CallDetailDrawer } from './CallDetailDrawer'
import { CallThreadDetailDrawer } from './CallThreadDetailDrawer'
import './CallsPage.css'

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

function transcriptStatusLabel(call: EnrichedCall): string {
  const status = call.transcript?.status ?? 'not_started'
  switch (status) {
    case 'success':
      return 'Transcribed'
    case 'transcribing':
      return 'Transcribing'
    case 'failed':
      return 'Failed'
    default:
      return 'Not transcribed'
  }
}

export function CallsPage() {
  const {
    calls,
    threads,
    stats,
    batchProgress,
    isTranscriptionConfigured,
    isChatConfigured,
    transcribingFileName,
    transcribeOne,
    analyzeOne,
    transcribeAll,
    analyzeAll,
    clearCache,
  } = useCallRecordings()

  const [viewMode, setViewMode] = useState<CallViewMode>('recordings')
  const [filters, setFilters] = useState<CallFilters>(defaultCallFilters)
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null)
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const filteredCalls = useMemo(() => filterCalls(calls, filters), [calls, filters])
  const filteredThreads = useMemo(
    () => filterCallThreads(threads, filters, viewMode),
    [threads, filters, viewMode],
  )

  const selectedCall = useMemo(
    () => calls.find((call) => call.callId === selectedCallId) ?? null,
    [calls, selectedCallId],
  )

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.threadId === selectedThreadId) ?? null,
    [threads, selectedThreadId],
  )

  const handleTranscribe = async (call: EnrichedCall, force = false) => {
    setActionError(null)
    try {
      await transcribeOne(call, force)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Transcription failed')
    }
  }

  const handleAnalyze = async (call: EnrichedCall, force = false) => {
    setActionError(null)
    try {
      await analyzeOne(call, force)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Analysis failed')
    }
  }

  return (
    <Box className="calls-page">
      <Stack gap="md" p="md">
        <Group justify="space-between" align="flex-end">
          <div>
            <Title order={3}>Call Recordings</Title>
            <Text size="sm" c="dimmed">
              Transcribe, analyze, and group carrier calls by load and MC number
            </Text>
          </div>
        </Group>

        {!isTranscriptionConfigured && (
          <Alert color="orange" title="Transcription endpoint missing">
            Add <code>VITE_TRANSCRIBE_AUDIO_URL</code> to your <code>.env</code> file and restart the
            dev server to enable transcription.
          </Alert>
        )}

        {!isChatConfigured && (
          <Alert color="orange" title="Chat endpoint missing">
            Add <code>VITE_OPENAI_CHAT_URL</code> to your <code>.env</code> file and restart the dev
            server to enable structured call analysis.
          </Alert>
        )}

        {transcribingFileName && (
          <Alert color="blue" title="Transcribing">
            Transcribing {transcribingFileName}...
          </Alert>
        )}

        {actionError && (
          <Alert color="red" title="Action failed" onClose={() => setActionError(null)} withCloseButton>
            {actionError}
          </Alert>
        )}

        {batchProgress.active && (
          <Paper withBorder p="md">
            <Stack gap="xs">
              <Text size="sm" fw={600}>
                {batchProgress.label} {batchProgress.current} / {batchProgress.total}
              </Text>
              <Progress value={(batchProgress.current / Math.max(batchProgress.total, 1)) * 100} />
              <Group gap="lg">
                <Text size="sm">Successful: {batchProgress.successful}</Text>
                <Text size="sm">Failed: {batchProgress.failed}</Text>
                <Text size="sm">Remaining: {batchProgress.remaining}</Text>
              </Group>
            </Stack>
          </Paper>
        )}

        <SimpleGrid cols={{ base: 2, sm: 3, md: 5 }} spacing="sm">
          <StatCard label="Total WAV Files" value={stats.totalFiles} />
          <StatCard label="Transcribed" value={stats.transcribed} />
          <StatCard label="Not Transcribed" value={stats.notTranscribed} />
          <StatCard label="Failed" value={stats.failed} />
          <StatCard label="Analyzed" value={stats.analyzed} />
          <StatCard label="Conversations" value={stats.uniqueConversations} />
          <StatCard label="Multi-call" value={stats.multiCallConversations} />
          <StatCard label="Single-call" value={stats.singleCallConversations} />
          <StatCard label="Needs Review" value={stats.needsReview} />
        </SimpleGrid>

        <Paper withBorder p="md">
          <Stack gap="md">
            <Group>
              <Button
                disabled={!isTranscriptionConfigured || batchProgress.active}
                onClick={() => {
                  setActionError(null)
                  void transcribeAll()
                }}
              >
                Transcribe All
              </Button>
              <Button
                variant="light"
                disabled={!isChatConfigured || batchProgress.active}
                onClick={() => {
                  setActionError(null)
                  void analyzeAll()
                }}
              >
                Analyze All Transcribed Calls
              </Button>
              <Button variant="subtle" color="red" onClick={clearCache}>
                Clear cached transcripts
              </Button>
            </Group>

            <Group grow align="flex-end">
              <TextInput
                label="Search"
                placeholder="Filename, carrier, MC, load, transcript, summary..."
                value={filters.search}
                onChange={(event) => {
                  const search = event.currentTarget.value
                  setFilters((current) => ({ ...current, search }))
                }}
              />
            </Group>

            <Group justify="space-between">
              <Group>
                <SegmentedControl
                  value={viewMode}
                  onChange={(value) => {
                    setViewMode(value as CallViewMode)
                    setFilters(defaultCallFilters)
                  }}
                  data={[
                    { label: 'Recordings', value: 'recordings' },
                    { label: 'Conversations', value: 'conversations' },
                  ]}
                />
                <SegmentedControl
                  value={filters.type}
                  onChange={(value) =>
                    setFilters((current) => ({
                      ...current,
                      type: value as CallFilters['type'],
                    }))
                  }
                  data={
                    viewMode === 'recordings'
                      ? [
                          { label: 'All', value: 'all' },
                          { label: 'Rate', value: 'rate_negotiation' },
                          { label: 'Availability', value: 'availability_check' },
                          { label: 'Compliance', value: 'compliance_check' },
                          { label: 'Load Details', value: 'load_details' },
                          { label: 'Voicemail', value: 'voicemail' },
                          { label: 'Needs Review', value: 'needs_review' },
                        ]
                      : [
                          { label: 'All', value: 'all' },
                          { label: 'Rate', value: 'rate_negotiation' },
                          { label: 'Availability', value: 'availability_check' },
                          { label: 'Compliance', value: 'compliance_check' },
                          { label: 'Load Details', value: 'load_details' },
                          { label: 'Voicemail', value: 'voicemail' },
                          { label: 'Single', value: 'single' },
                          { label: 'Multi-call', value: 'conversation' },
                          { label: 'Needs Review', value: 'needs_review' },
                        ]
                  }
                />
              </Group>
              <Text size="sm" c="dimmed">
                {viewMode === 'recordings'
                  ? `Showing ${filteredCalls.length} of ${calls.length} recordings`
                  : `Showing ${filteredThreads.length} of ${threads.length} conversations`}
              </Text>
            </Group>
          </Stack>
        </Paper>

        {viewMode === 'recordings' ? (
          <Paper withBorder radius="md" className="calls-table-shell">
            <ScrollArea>
              <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Filename</Table.Th>
                    <Table.Th>Filename Type</Table.Th>
                    <Table.Th>Detected Type</Table.Th>
                    <Table.Th>Carrier</Table.Th>
                    <Table.Th>MC #</Table.Th>
                    <Table.Th>Load #</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Outcome</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {filteredCalls.length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={8}>
                        <Text ta="center" c="dimmed" py="lg">
                          No recordings match your search or filters.
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ) : (
                    filteredCalls.map((call) => (
                      <Table.Tr
                        key={call.callId}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setSelectedCallId(call.callId)}
                      >
                        <Table.Td>
                          <Text size="sm" fw={600}>
                            {call.fileName}
                          </Text>
                        </Table.Td>
                        <Table.Td>{formatCallTypeLabel(call.fileTypeHint)}</Table.Td>
                        <Table.Td>
                          {call.analysis
                            ? formatCallTypeLabel(call.analysis.detectedCallType)
                            : 'Not analyzed'}
                        </Table.Td>
                        <Table.Td>{call.analysis?.carrierName ?? '—'}</Table.Td>
                        <Table.Td>{call.analysis?.mcNumber ?? '—'}</Table.Td>
                        <Table.Td>{call.analysis?.loadId ?? '—'}</Table.Td>
                        <Table.Td>
                          <Badge variant="light">{transcriptStatusLabel(call)}</Badge>
                        </Table.Td>
                        <Table.Td>
                          {call.analysis
                            ? formatOutcomeLabel(call.analysis.outcome)
                            : 'Not analyzed'}
                        </Table.Td>
                      </Table.Tr>
                    ))
                  )}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Paper>
        ) : (
          <Paper withBorder radius="md" className="calls-table-shell">
            <ScrollArea>
              <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Carrier</Table.Th>
                    <Table.Th>MC #</Table.Th>
                    <Table.Th>Load #</Table.Th>
                    <Table.Th>Calls</Table.Th>
                    <Table.Th>Latest Call Type</Table.Th>
                    <Table.Th>Current Outcome</Table.Th>
                    <Table.Th>Needs Review</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {filteredThreads.length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={7}>
                        <Text ta="center" c="dimmed" py="lg">
                          {stats.analyzed === 0
                            ? 'Analyze calls to build carrier/load conversations.'
                            : 'No conversations match your search or filters.'}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ) : (
                    filteredThreads.map((thread) => {
                      const latestCall = thread.calls[thread.calls.length - 1]
                      const needsReview = thread.calls.some(
                        (call) => call.analysis?.needsHumanReview,
                      )

                      return (
                        <Table.Tr
                          key={thread.threadId}
                          style={{ cursor: 'pointer' }}
                          onClick={() => setSelectedThreadId(thread.threadId)}
                        >
                          <Table.Td>{thread.carrierName ?? 'Unknown Carrier'}</Table.Td>
                          <Table.Td>{thread.mcNumber ?? '—'}</Table.Td>
                          <Table.Td>{thread.loadId ?? '—'}</Table.Td>
                          <Table.Td>
                            <Badge
                              color={thread.threadType === 'conversation' ? 'blue' : 'gray'}
                              variant={thread.threadType === 'conversation' ? 'filled' : 'light'}
                            >
                              {thread.callCount} call{thread.callCount === 1 ? '' : 's'}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            {latestCall?.analysis
                              ? formatCallTypeLabel(latestCall.analysis.detectedCallType)
                              : formatCallTypeLabel(latestCall.fileTypeHint)}
                          </Table.Td>
                          <Table.Td>
                            {latestCall?.analysis
                              ? formatOutcomeLabel(latestCall.analysis.outcome)
                              : '—'}
                          </Table.Td>
                          <Table.Td>
                            {needsReview ? (
                              <Badge color="orange">Yes</Badge>
                            ) : (
                              <Text size="sm" c="dimmed">
                                No
                              </Text>
                            )}
                          </Table.Td>
                        </Table.Tr>
                      )
                    })
                  )}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Paper>
        )}
      </Stack>

      <CallDetailDrawer
        call={selectedCall}
        opened={selectedCallId !== null}
        onClose={() => setSelectedCallId(null)}
        onTranscribe={handleTranscribe}
        onAnalyze={handleAnalyze}
        isTranscriptionConfigured={isTranscriptionConfigured}
        isChatConfigured={isChatConfigured}
      />

      <CallThreadDetailDrawer
        thread={selectedThread}
        opened={selectedThreadId !== null}
        onClose={() => setSelectedThreadId(null)}
      />
    </Box>
  )
}
