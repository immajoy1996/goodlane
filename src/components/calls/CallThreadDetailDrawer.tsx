import {
  Badge,
  Divider,
  Drawer,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import type { CallThread } from '../../types/calls'
import { getLatestCallThreadState } from '../../services/callThreading'
import { formatCallTypeLabel, formatOutcomeLabel } from '../../utils/callFilters'

type CallThreadDetailDrawerProps = {
  thread: CallThread | null
  opened: boolean
  onClose: () => void
}

export function CallThreadDetailDrawer({ thread, opened, onClose }: CallThreadDetailDrawerProps) {
  if (!thread) return null

  const state = getLatestCallThreadState(thread)

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="xl"
      title="Call Conversation"
    >
      <ScrollArea h="calc(100vh - 80px)">
        <Stack gap="md" pr="sm">
          <Paper withBorder p="md">
            <Stack gap="xs">
              <Title order={4}>
                Load #{thread.loadId ?? '—'} · {thread.carrierName ?? 'Unknown Carrier'}
              </Title>
              <Text size="sm" c="dimmed">
                MC {thread.mcNumber ?? '—'} · {thread.callCount} calls
              </Text>
              <Group gap="xs">
                <Badge color={thread.threadType === 'conversation' ? 'blue' : 'gray'}>
                  {thread.threadType === 'conversation' ? 'Conversation' : 'Single call'}
                </Badge>
                {state.needsHumanReview && <Badge color="orange">Needs review</Badge>}
              </Group>
              <Divider />
              <Text size="sm" fw={600}>
                Current state
              </Text>
              <Text size="sm">
                Rate: {state.currentRate != null ? `$${state.currentRate}` : '—'}
                {state.agreedRate != null ? ` (agreed $${state.agreedRate})` : ''}
              </Text>
              <Text size="sm">Outcome: {formatOutcomeLabel(state.outcome)}</Text>
              <Text size="sm">Availability: {formatOutcomeLabel(state.availability)}</Text>
              {state.lastSummary && (
                <Text size="sm" c="dimmed">
                  {state.lastSummary}
                </Text>
              )}
            </Stack>
          </Paper>

          {thread.calls.map((call) => (
            <Paper key={call.callId} withBorder p="md">
              <Stack gap="sm">
                <Group justify="space-between">
                  <div>
                    <Text fw={700}>{call.callId.toUpperCase()}</Text>
                    <Text size="sm" c="dimmed">
                      {call.analysis
                        ? formatCallTypeLabel(call.analysis.detectedCallType)
                        : formatCallTypeLabel(call.fileTypeHint)}
                    </Text>
                  </div>
                  {call.analysis && (
                    <Badge>{formatOutcomeLabel(call.analysis.outcome)}</Badge>
                  )}
                </Group>

                <audio controls src={call.audioUrl} style={{ width: '100%' }} />

                {call.analysis?.summary && (
                  <Text size="sm" fw={500}>
                    {call.analysis.summary}
                  </Text>
                )}

                <Stack gap={4}>
                  <Text size="xs" c="dimmed" fw={600}>
                    TRANSCRIPT
                  </Text>
                  <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                    {call.transcript?.transcript || 'No transcript'}
                  </Text>
                </Stack>
              </Stack>
            </Paper>
          ))}
        </Stack>
      </ScrollArea>
    </Drawer>
  )
}
