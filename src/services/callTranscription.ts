import type { RawCallRecording } from '../types/calls'
import { blobToBase64 } from '../utils/blobToBase64'
import { getTranscribeAudioUrl } from './transcriptionConfig'

const PAYLOAD_SIZE_PATTERNS = [
  /payload too large/i,
  /request entity too large/i,
  /exceeds.*size limit/i,
  /413/,
]

function isPayloadSizeError(status: number, body: string): boolean {
  if (status === 413) {
    return true
  }

  return PAYLOAD_SIZE_PATTERNS.some((pattern) => pattern.test(body))
}

function formatTranscriptionError(status: number, body: string): string {
  if (isPayloadSizeError(status, body)) {
    return 'Audio payload exceeds Lambda/API Gateway request size limit.'
  }

  return `Transcription Lambda failed (${status}): ${body}`
}

export async function transcribeCall(recording: RawCallRecording): Promise<string> {
  const audioResponse = await fetch(recording.audioUrl)

  if (!audioResponse.ok) {
    throw new Error(`Failed to load audio file ${recording.fileName}`)
  }

  const blob = await audioResponse.blob()
  const audioBase64 = await blobToBase64(blob)

  const response = await fetch(getTranscribeAudioUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      audioBase64,
      mimeType: blob.type || 'audio/wav',
      language: 'en',
    }),
  })

  const rawBody = await response.text()

  if (!response.ok) {
    throw new Error(formatTranscriptionError(response.status, rawBody))
  }

  let result: { text?: string }

  try {
    result = JSON.parse(rawBody) as { text?: string }
  } catch {
    throw new Error(`Invalid transcription response: ${rawBody}`)
  }

  if (!result.text) {
    throw new Error('Transcription succeeded but response did not contain text')
  }

  return result.text.trim()
}
