import { useMemo, useState } from 'react'
import {
  Badge,
  Box,
  Button,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import type { CarrierInteraction } from '../../types/interactions'
import {
  assignInteractionEntities,
  getInteractionsNeedingReview,
} from '../../services/retrieval'
import {
  suggestCarrierMatches,
  suggestLoadMatches,
  type CarrierMatch,
  type LoadMatch,
} from '../../services/entityResolution'

type Props = {
  refreshKey: number
  onAssigned: () => void
}

function confidenceColor(level: string): string {
  if (level === 'high') return 'green'
  if (level === 'medium') return 'yellow'
  return 'red'
}

function ConfidenceBadge({ label, level }: { label: string; level: string }) {
  return (
    <Badge color={confidenceColor(level)} variant="light">
      {label}: {level}
    </Badge>
  )
}

function MatchTable({
  title,
  rows,
  onUse,
}: {
  title: string
  rows: Array<{ key: string; primary: string; secondary: string; score: number; reason: string }>
  onUse: (key: string) => void
}) {
  if (rows.length === 0) {
    return (
      <Paper withBorder p="sm">
        <Text size="sm" c="dimmed">
          No close {title.toLowerCase()} matches found.
        </Text>
      </Paper>
    )
  }

  return (
    <Paper withBorder p="sm">
      <Text size="sm" fw={600} mb="xs">
        Suggested {title}
      </Text>
      <Table horizontalSpacing="sm" verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Match</Table.Th>
            <Table.Th>Score</Table.Th>
            <Table.Th>Reason</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((row) => (
            <Table.Tr key={row.key}>
              <Table.Td>
                <Text size="sm" fw={500}>
                  {row.primary}
                </Text>
                <Text size="xs" c="dimmed">
                  {row.secondary}
                </Text>
              </Table.Td>
              <Table.Td>{Math.round(row.score * 100)}%</Table.Td>
              <Table.Td>
                <Text size="xs">{row.reason}</Text>
              </Table.Td>
              <Table.Td>
                <Button size="xs" variant="light" onClick={() => onUse(row.key)}>
                  Use
                </Button>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Paper>
  )
}

function ReviewEditor({
  interaction,
  onAssigned,
}: {
  interaction: CarrierInteraction
  onAssigned: () => void
}) {
  const [loadId, setLoadId] = useState(interaction.loadId ?? '')
  const [mcNumber, setMcNumber] = useState(interaction.mcNumber ?? '')
  const [saving, setSaving] = useState(false)

  const loadMatches = useMemo(
    () => suggestLoadMatches(interaction.loadId, interaction.rawText),
    [interaction],
  )

  const carrierMatches = useMemo(
    () =>
      suggestCarrierMatches(
        interaction.carrierName,
        interaction.mcNumber,
        null,
        interaction.rawText,
      ),
    [interaction],
  )

  async function handleSave() {
    setSaving(true)
    try {
      assignInteractionEntities(interaction, {
        loadId: loadId.trim() || null,
        mcNumber: mcNumber.trim() || null,
      })
      onAssigned()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Stack gap="md">
      <Group gap="xs">
        <ConfidenceBadge label="Load" level={interaction.loadIdConfidence} />
        <ConfidenceBadge label="MC" level={interaction.mcNumberConfidence} />
        {interaction.manuallyAssigned && <Badge color="blue">Manually assigned</Badge>}
      </Group>

      {interaction.resolutionWarnings.length > 0 && (
        <Paper withBorder p="sm" bg="yellow.0">
          <Stack gap={4}>
            {interaction.resolutionWarnings.map((warning) => (
              <Text key={warning} size="sm">
                {warning}
              </Text>
            ))}
          </Stack>
        </Paper>
      )}

      <Paper withBorder p="sm">
        <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
          {interaction.rawText.slice(0, 1200)}
          {interaction.rawText.length > 1200 ? '…' : ''}
        </Text>
      </Paper>

      <Group grow align="flex-end">
        <TextInput
          label="Load ID"
          value={loadId}
          onChange={(event) => setLoadId(event.currentTarget.value)}
          placeholder="e.g. 29372289"
        />
        <TextInput
          label="MC Number"
          value={mcNumber}
          onChange={(event) => setMcNumber(event.currentTarget.value)}
          placeholder="e.g. 107654"
        />
      </Group>

      <MatchTable
        title="Loads"
        rows={loadMatches.map((match: LoadMatch) => ({
          key: match.loadId,
          primary: match.loadId,
          secondary: `${match.origin} → ${match.destination} · ${match.equipmentType}`,
          score: match.score,
          reason: match.reason,
        }))}
        onUse={(key) => setLoadId(key)}
      />

      <MatchTable
        title="Carriers"
        rows={carrierMatches.map((match: CarrierMatch) => ({
          key: match.mcNumber,
          primary: match.companyName,
          secondary: `MC ${match.mcNumber} · ${match.primaryContact}`,
          score: match.score,
          reason: match.reason,
        }))}
        onUse={(key) => setMcNumber(key)}
      />

      <Button onClick={() => void handleSave()} loading={saving}>
        Save assignment
      </Button>
    </Stack>
  )
}

export function InteractionReviewPanel({ refreshKey, onAssigned }: Props) {
  const needingReview = useMemo(
    () => getInteractionsNeedingReview(),
    [refreshKey],
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = useMemo(
    () => needingReview.find((interaction) => interaction.id === selectedId) ?? null,
    [needingReview, selectedId],
  )

  if (needingReview.length === 0) {
    return (
      <Paper withBorder p="md">
        <Text size="sm" c="green">
          No interactions need manual review.
        </Text>
      </Paper>
    )
  }

  return (
    <Paper withBorder p="md">
      <Stack gap="md">
        <div>
          <Title order={5}>Needs Review ({needingReview.length})</Title>
          <Text size="sm" c="dimmed">
            Low-confidence load IDs or MC numbers. Pick the closest match or assign manually.
          </Text>
        </div>

        <ScrollArea h={220}>
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Source</Table.Th>
                <Table.Th>Carrier</Table.Th>
                <Table.Th>Load</Table.Th>
                <Table.Th>MC</Table.Th>
                <Table.Th>Confidence</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {needingReview.map((interaction) => (
                <Table.Tr key={interaction.id}>
                  <Table.Td>{interaction.source}</Table.Td>
                  <Table.Td>{interaction.carrierName ?? '—'}</Table.Td>
                  <Table.Td>{interaction.loadId ?? '—'}</Table.Td>
                  <Table.Td>{interaction.mcNumber ?? '—'}</Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      <Badge size="xs" color={confidenceColor(interaction.loadIdConfidence)}>
                        L
                      </Badge>
                      <Badge size="xs" color={confidenceColor(interaction.mcNumberConfidence)}>
                        MC
                      </Badge>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Button
                      size="xs"
                      variant={selectedId === interaction.id ? 'filled' : 'light'}
                      onClick={() => setSelectedId(interaction.id)}
                    >
                      Review
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>

        {selected && (
          <Box>
            <Text fw={600} mb="sm">
              Reviewing {selected.id}
            </Text>
            <ReviewEditor
              key={selected.id}
              interaction={selected}
              onAssigned={() => {
                setSelectedId(null)
                onAssigned()
              }}
            />
          </Box>
        )}
      </Stack>
    </Paper>
  )
}
