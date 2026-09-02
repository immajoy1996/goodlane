import type { CallTypeHint, RawCallRecording } from '../types/calls'

const CALL_FILE_PATTERN = /^call_(\d+)_(.+)\.wav$/i

const KNOWN_TYPE_HINTS = new Set<CallTypeHint>([
  'rate_negotiation',
  'availability_check',
  'compliance_check',
  'load_details',
  'voicemail',
])

const recordingModules = import.meta.glob('../../data/call_recordings/*.wav', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

function parseFileTypeHint(rawHint: string): CallTypeHint {
  const normalized = rawHint.toLowerCase().replace(/-/g, '_')
  if (KNOWN_TYPE_HINTS.has(normalized as CallTypeHint)) {
    return normalized as CallTypeHint
  }
  return 'unknown'
}

function parseRecordingPath(filePath: string, audioUrl: string): RawCallRecording | null {
  const fileName = filePath.split('/').pop() ?? filePath
  const match = fileName.match(CALL_FILE_PATTERN)

  if (!match) {
    return null
  }

  const sequenceNumber = match[1]
  const rawHint = match[2]

  return {
    callId: `call_${sequenceNumber}`,
    fileName,
    audioUrl,
    fileTypeHint: parseFileTypeHint(rawHint),
    callSequence: Number.parseInt(sequenceNumber, 10),
  }
}

export function discoverCallRecordings(): RawCallRecording[] {
  return Object.entries(recordingModules)
    .map(([path, audioUrl]) => parseRecordingPath(path, audioUrl))
    .filter((recording): recording is RawCallRecording => recording !== null)
    .sort((a, b) => a.callSequence - b.callSequence)
}
