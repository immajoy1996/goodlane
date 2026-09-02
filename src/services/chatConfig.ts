export function isChatConfigured(): boolean {
  return Boolean(import.meta.env.VITE_OPENAI_CHAT_URL?.trim())
}

export function getChatUrl(): string {
  const url = import.meta.env.VITE_OPENAI_CHAT_URL?.trim()

  if (!url) {
    throw new Error(
      'Missing VITE_OPENAI_CHAT_URL. Add it to a .env file in the project root and restart the dev server.',
    )
  }

  return url
}
