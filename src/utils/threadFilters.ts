import type { EmailThread, ThreadFilterType } from '../types/email'

export type ThreadFilters = {
  type: ThreadFilterType
  search: string
  loadId: string
  carrier: string
}

export const defaultThreadFilters: ThreadFilters = {
  type: 'all',
  search: '',
  loadId: '',
  carrier: '',
}

function threadSearchHaystack(thread: EmailThread): string {
  const parts = [
    thread.carrier.displayName,
    thread.carrier.email,
    thread.carrier.mcNumber,
    thread.loadId,
    thread.subject,
    ...thread.messages.flatMap((message) => [
      message.from_name,
      message.from_email,
      message.mc_number,
      message.load_reference,
      message.subject,
      message.body,
    ]),
  ]

  return parts
    .filter((value): value is string => value !== null && value !== undefined)
    .join(' ')
    .toLowerCase()
}

export function filterThreads(threads: EmailThread[], filters: ThreadFilters): EmailThread[] {
  const searchTerm = (filters.search ?? '').trim().toLowerCase()
  const loadFilter = (filters.loadId ?? '').trim().toLowerCase()
  const carrierFilter = (filters.carrier ?? '').trim().toLowerCase()

  return threads.filter((thread) => {
    if (filters.type === 'conversations' && thread.threadType !== 'conversation') {
      return false
    }

    if (filters.type === 'single' && thread.threadType !== 'single') {
      return false
    }

    if (loadFilter) {
      const loadId = thread.loadId?.toLowerCase() ?? ''
      if (!loadId.includes(loadFilter)) {
        return false
      }
    }

    if (carrierFilter) {
      const carrierHaystack = [
        thread.carrier.displayName,
        thread.carrier.email,
        thread.carrier.mcNumber,
      ]
        .filter((value): value is string => value !== null && value !== undefined)
        .join(' ')
        .toLowerCase()

      if (!carrierHaystack.includes(carrierFilter)) {
        return false
      }
    }

    if (searchTerm && !threadSearchHaystack(thread).includes(searchTerm)) {
      return false
    }

    return true
  })
}

export function formatThreadDate(timestamp: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(timestamp))
}

export function formatMessageDateTime(timestamp: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
    .format(new Date(timestamp))
    .toUpperCase()
}
