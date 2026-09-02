function parseCsvRow(line: string): string[] {
  const values: string[] = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index++) {
    const char = line[index]

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"'
        index += 1
        continue
      }
      inQuotes = !inQuotes
      continue
    }

    if (char === ',' && !inQuotes) {
      values.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  values.push(current.trim())
  return values
}

export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n').filter((line) => line.trim().length > 0)
  if (lines.length === 0) return []

  const headers = parseCsvRow(lines[0])

  return lines.slice(1).map((line) => {
    const values = parseCsvRow(line)
    const row: Record<string, string> = {}

    for (let index = 0; index < headers.length; index++) {
      row[headers[index]] = values[index]?.trim() ?? ''
    }

    return row
  })
}

export function toCsvNumber(value: string | undefined): number {
  if (!value?.trim()) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
