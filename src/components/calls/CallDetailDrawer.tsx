import {
  Badge,
  Button,
  Divider,
  Drawer,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import type { EnrichedCall } from '../../types/calls'
import { normalizeStringList } from '../../utils/normalizeStringList'
import { formatCallTypeLabel, formatOutcomeLabel } from '../../utils/callFilters'

type CallDetailDrawerProps = {
  call: EnrichedCall | null
  opened: boolean
  onClose: () => void
  onTranscribe: (call: EnrichedCall, force?: boolean) => Promise<void>
  onAnalyze: (call: EnrichedCall, force?: boolean) => Promise<void>
  isTranscriptionConfigured: boolean
  isChatConfigured: boolean
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <Group justify="space-between" align="flex-start">
      <Text size="sm" fw={600}>
        {label}
      </Text>
      <Text size="sm" ta="right" maw="65%">
        {value ?? '—'}
      </Text>
    </Group>
  )
}

export function CallDetailDrawer({
  call,
  opened,
  onClose,
  onTranscribe,
  onAnalyze,
  isTranscriptionConfigured,
  isChatConfigured,
}: CallDetailDrawerProps) {
  if (!call) return null

  const transcript = call.transcript
  const analysis = call.analysis
  const transcriptStatus = transcript?.status ?? 'not_started'
  const carrierQuestions = normalizeStringList(analysis?.questionsFromCarrier)
  const brokerQuestions = normalizeStringList(analysis?.questionsFromBroker)
  const complianceIssues = normalizeStringList(analysis?.complianceIssues)
  const warnings = normalizeStringList(analysis?.warnings)

  return (
    <Drawer opened={opened} onClose={onClose} position="right" size="lg" title="Call Detail">
      <ScrollArea h="calc(100vh - 80px)">
        <Stack gap="md" pr="sm">
          <Paper withBorder p="md">
            <Stack gap="xs">
              <Title order={4}>{call.fileName}</Title>
              <Group gap="xs">
                <Badge variant="light">Filename: {formatCallTypeLabel(call.fileTypeHint)}</Badge>
                {analysis && (
                  <Badge color="blue">
                    Detected: {formatCallTypeLabel(analysis.detectedCallType)}
                  </Badge>
                )}
              </Group>
              <Text size="sm" c="dimmed">
                Call sequence #{call.callSequence} (not a real-world timestamp)
              </Text>
            </Stack>
          </Paper>

          <Paper withBorder p="md">
            <Stack gap="sm">
              <Title order={5}>Audio</Title>
              <audio controls src={call.audioUrl} style={{ width: '100%' }} />
            </Stack>
          </Paper>

          <Paper withBorder p="md">
            <Stack gap="sm">
              <Group justify="space-between">
                <Title order={5}>Raw Transcript</Title>
                <Group gap="xs">
                  {transcriptStatus === 'success' ? (
                    <Button size="xs" variant="light" onClick={() => onTranscribe(call, true)}>
                      Retry
                    </Button>
                  ) : (
                    <Button
                      size="xs"
                      disabled={!isTranscriptionConfigured || transcriptStatus === 'transcribing'}
                      onClick={() => onTranscribe(call)}
                    >
                      {transcriptStatus === 'transcribing'
                        ? `Transcribing ${call.fileName}...`
                        : 'Transcribe'}
                    </Button>
                  )}
                </Group>
              </Group>

              {transcriptStatus === 'failed' && (
                <Text size="sm" c="red">
                  {transcript?.error}
                </Text>
              )}

              {transcript?.transcript ? (
                <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                  {transcript.transcript}
                </Text>
              ) : (
                <Text size="sm" c="dimmed">
                  {transcriptStatus === 'not_started' ? 'Not transcribed yet.' : 'No transcript.'}
                </Text>
              )}
            </Stack>
          </Paper>

          <Paper withBorder p="md">
            <Stack gap="sm">
              <Group justify="space-between">
                <Title order={5}>AI Extracted Information</Title>
                <Group gap="xs">
                  {analysis ? (
                    <Button size="xs" variant="light" onClick={() => onAnalyze(call, true)}>
                      Re-analyze
                    </Button>
                  ) : (
                    <Button
                      size="xs"
                      disabled={!isChatConfigured || transcriptStatus !== 'success'}
                      onClick={() => onAnalyze(call)}
                    >
                      Analyze
                    </Button>
                  )}
                </Group>
              </Group>

              {!analysis ? (
                <Text size="sm" c="dimmed">
                  Not analyzed yet.
                </Text>
              ) : (
                <Stack gap="xs">
                  <DetailRow label="Carrier" value={analysis.carrierName} />
                  <DetailRow label="MC #" value={analysis.mcNumber} />
                  <DetailRow label="DOT #" value={analysis.dotNumber} />
                  <DetailRow label="Load #" value={analysis.loadId} />
                  <DetailRow label="Equipment" value={analysis.equipment} />
                  <DetailRow label="Availability" value={formatOutcomeLabel(analysis.availability)} />
                  <DetailRow label="Availability date" value={analysis.availabilityDate} />
                  <Divider />
                  <DetailRow
                    label="Broker rate"
                    value={
                      analysis.brokerRateMentionedUsd != null
                        ? `$${analysis.brokerRateMentionedUsd}`
                        : null
                    }
                  />
                  <DetailRow
                    label="Carrier ask"
                    value={analysis.carrierAskUsd != null ? `$${analysis.carrierAskUsd}` : null}
                  />
                  <DetailRow
                    label="Agreed rate"
                    value={analysis.agreedRateUsd != null ? `$${analysis.agreedRateUsd}` : null}
                  />
                  <DetailRow label="Rate status" value={formatOutcomeLabel(analysis.rateStatus)} />
                  <Divider />
                  <DetailRow label="Outcome" value={formatOutcomeLabel(analysis.outcome)} />
                  <DetailRow label="Suggested next action" value={analysis.suggestedNextAction} />
                  <DetailRow label="Summary" value={analysis.summary} />
                  {carrierQuestions.length > 0 && (
                    <Stack gap={4}>
                      <Text size="sm" fw={600}>
                        Questions from carrier
                      </Text>
                      {carrierQuestions.map((question, index) => (
                        <Text key={`carrier-question-${index}`} size="sm">
                          • {question}
                        </Text>
                      ))}
                    </Stack>
                  )}
                  {brokerQuestions.length > 0 && (
                    <Stack gap={4}>
                      <Text size="sm" fw={600}>
                        Questions from broker
                      </Text>
                      {brokerQuestions.map((question, index) => (
                        <Text key={`broker-question-${index}`} size="sm">
                          • {question}
                        </Text>
                      ))}
                    </Stack>
                  )}
                  {complianceIssues.length > 0 && (
                    <Stack gap={4}>
                      <Text size="sm" fw={600}>
                        Compliance issues
                      </Text>
                      {complianceIssues.map((issue, index) => (
                        <Text key={`compliance-${index}`} size="sm">
                          • {issue}
                        </Text>
                      ))}
                    </Stack>
                  )}
                  {(warnings.length > 0 || analysis.needsHumanReview) && (
                    <Stack gap={4}>
                      <Text size="sm" fw={600}>
                        Warnings / Human Review
                      </Text>
                      {analysis.needsHumanReview && (
                        <Badge color="orange">Needs human review</Badge>
                      )}
                      {warnings.map((warning, index) => (
                        <Badge key={`warning-${index}`} color="orange" variant="light">
                          {warning}
                        </Badge>
                      ))}
                    </Stack>
                  )}
                </Stack>
              )}
            </Stack>
          </Paper>
        </Stack>
      </ScrollArea>
    </Drawer>
  )
}
