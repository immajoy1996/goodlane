import type {
  CallFilterType,
  CallThread,
  CallViewMode,
  EnrichedCall,
} from '../types/calls'

export type CallFilters = {
  search: string
  type: CallFilterType
}

export const defaultCallFilters: CallFilters = {
  search: '',
  type: 'all',
}

function callSearchHaystack(call: EnrichedCall): string {
  const parts = [
    call.fileName,
    call.fileTypeHint,
    call.analysis?.detectedCallType,
    call.analysis?.carrierName,
    call.analysis?.mcNumber,
    call.analysis?.loadId,
    call.analysis?.summary,
    call.transcript?.transcript,
  ]

  return parts
    .filter((value): value is string => value !== null && value !== undefined)
    .join(' ')
    .toLowerCase()
}

function threadSearchHaystack(thread: CallThread): string {
  return thread.calls.map(callSearchHaystack).join(' ').toLowerCase()
}

function matchesTypeFilter(call: EnrichedCall, filterType: CallFilterType): boolean {
  switch (filterType) {
    case 'all':
      return true
    case 'single':
    case 'conversation':
    case 'needs_review':
      return true
    case 'rate_negotiation':
    case 'availability_check':
    case 'compliance_check':
    case 'load_details':
    case 'voicemail':
      return (
        call.analysis?.detectedCallType === filterType ||
        (filterType === 'rate_negotiation' && call.fileTypeHint === 'rate_negotiation')
      )
    default:
      return true
  }
}

export function filterCalls(calls: EnrichedCall[], filters: CallFilters): EnrichedCall[] {
  const searchTerm = (filters.search ?? '').trim().toLowerCase()

  return calls.filter((call) => {
    if (filters.type === 'needs_review' && !call.analysis?.needsHumanReview) {
      return false
    }

    if (
      filters.type !== 'all' &&
      filters.type !== 'single' &&
      filters.type !== 'conversation' &&
      filters.type !== 'needs_review' &&
      !matchesTypeFilter(call, filters.type)
    ) {
      return false
    }

    if (searchTerm && !callSearchHaystack(call).includes(searchTerm)) {
      return false
    }

    return true
  })
}

export function filterCallThreads(
  threads: CallThread[],
  filters: CallFilters,
  viewMode: CallViewMode,
): CallThread[] {
  const searchTerm = (filters.search ?? '').trim().toLowerCase()

  return threads.filter((thread) => {
    if (viewMode === 'conversations') {
      if (filters.type === 'single' && thread.threadType !== 'single') return false
      if (filters.type === 'conversation' && thread.threadType !== 'conversation') return false
      if (filters.type === 'needs_review') {
        const needsReview = thread.calls.some((call) => call.analysis?.needsHumanReview)
        if (!needsReview) return false
      }
    }

    if (
      filters.type !== 'all' &&
      filters.type !== 'single' &&
      filters.type !== 'conversation' &&
      filters.type !== 'needs_review'
    ) {
      const hasType = thread.calls.some((call) => matchesTypeFilter(call, filters.type))
      if (!hasType) return false
    }

    if (searchTerm && !threadSearchHaystack(thread).includes(searchTerm)) {
      return false
    }

    return true
  })
}

export function formatCallTypeLabel(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function formatOutcomeLabel(value: string | null | undefined): string {
  if (!value) return '—'
  return formatCallTypeLabel(value)
}
