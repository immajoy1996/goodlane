export function isTranscriptionConfigured(): boolean {
  return Boolean(import.meta.env.VITE_TRANSCRIBE_AUDIO_URL?.trim())
}

export function getTranscribeAudioUrl(): string {
  const url = import.meta.env.VITE_TRANSCRIBE_AUDIO_URL?.trim()

  if (!url) {
    throw new Error(
      'Missing VITE_TRANSCRIBE_AUDIO_URL. Add it to a .env file in the project root and restart the dev server.',
    )
  }

  return url
}
