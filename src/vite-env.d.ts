/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENAI_CHAT_URL?: string
  readonly VITE_TRANSCRIBE_AUDIO_URL?: string
  readonly VITE_ANALYSIS_MODEL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.csv?raw' {
  const content: string
  export default content
}

declare module '*.wasm?url' {
  const url: string
  export default url
}
