export function normalizeStringList(items: unknown): string[] {
  if (!Array.isArray(items)) {
    return []
  }

  return items
    .map((item) => normalizeStringItem(item))
    .filter((item) => item.length > 0)
}

function normalizeStringItem(item: unknown): string {
  if (typeof item === 'string') {
    return item.trim()
  }

  if (item && typeof item === 'object') {
    const record = item as Record<string, unknown>
    const candidateKeys = ['question', 'text', 'issue', 'warning', 'value', 'message', 'content']

    for (const key of candidateKeys) {
      const value = record[key]
      if (typeof value === 'string' && value.trim()) {
        return value.trim()
      }
    }
  }

  if (item == null) {
    return ''
  }

  return String(item).trim()
}
