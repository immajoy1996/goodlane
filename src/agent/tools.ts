import {
  findCarrier,
  getCarrierHistory,
  getLoadDetails,
  getLoadInteractions,
  getRateContext,
  isKnowledgeDbReady,
} from '../services/retrieval'

export const AGENT_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'get_load_interactions',
      description:
        'Get current carrier offers, availability, negotiation status, and source interaction IDs for a specific load.',
      parameters: {
        type: 'object',
        properties: {
          loadId: { type: 'string', description: 'Numeric load ID, e.g. 29372289' },
        },
        required: ['loadId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_load_details',
      description:
        'Get load route, pickup, delivery, equipment, weight, offered rate, status, and shipper details.',
      parameters: {
        type: 'object',
        properties: {
          loadId: { type: 'string', description: 'Numeric load ID' },
        },
        required: ['loadId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_carrier_history',
      description:
        'Get carrier reliability, prior loads with Goodlane, authority, insurance, safety rating, and onboarding status.',
      parameters: {
        type: 'object',
        properties: {
          mcNumber: { type: 'string', description: 'Carrier MC number' },
        },
        required: ['mcNumber'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'find_carrier',
      description:
        'Find a carrier by company name, contact name, email, MC number, or DOT number. Use this when the user refers to a carrier without providing an exact MC number.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Carrier name, contact name, email, MC number, or DOT number',
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_rate_context',
      description:
        'Get recent market rate context for a lane and equipment type using origin/destination state codes.',
      parameters: {
        type: 'object',
        properties: {
          originState: { type: 'string', description: 'Two-letter origin state, e.g. PA' },
          destinationState: { type: 'string', description: 'Two-letter destination state, e.g. DE' },
          equipmentType: { type: 'string', description: 'Equipment type, e.g. Box Truck' },
        },
        required: ['originState', 'destinationState', 'equipmentType'],
        additionalProperties: false,
      },
    },
  },
]

export type ToolActivity = {
  name: string
  args: unknown
  resultSummary: string
}

export function executeTool(name: string, args: Record<string, unknown>): unknown {
  if (!isKnowledgeDbReady()) {
    throw new Error('Knowledge base is not ready')
  }

  switch (name) {
    case 'get_load_interactions':
      return getLoadInteractions(String(args.loadId ?? ''))

    case 'get_load_details':
      return getLoadDetails(String(args.loadId ?? ''))

    case 'get_carrier_history':
      return getCarrierHistory(String(args.mcNumber ?? ''))

    case 'find_carrier':
      return findCarrier(String(args.query ?? ''))

    case 'get_rate_context':
      return getRateContext(
        String(args.originState ?? ''),
        String(args.destinationState ?? ''),
        String(args.equipmentType ?? ''),
      )

    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

export function summarizeToolResult(name: string, result: unknown): string {
  if (result == null) {
    return 'not found'
  }

  if (name === 'get_load_interactions') {
    const data = result as { carriers?: unknown[] }
    return `${data.carriers?.length ?? 0} carriers`
  }

  if (name === 'get_load_details') {
    const data = result as { loadId?: string; origin?: string; destination?: string }
    return `load ${data.loadId}: ${data.origin} → ${data.destination}`
  }

  if (name === 'get_carrier_history') {
    const data = result as { companyName?: string; reliabilityScore?: number }
    return `${data.companyName ?? 'carrier'} (reliability ${data.reliabilityScore ?? '—'})`
  }

  if (name === 'find_carrier') {
    const matches = result as Array<{ companyName?: string | null; mcNumber?: string | null }>
    if (!Array.isArray(matches) || matches.length === 0) {
      return 'no matching carriers'
    }
    if (matches.length === 1) {
      const match = matches[0]
      const label = match.companyName ?? 'carrier'
      const mc = match.mcNumber ? ` (MC ${match.mcNumber})` : ''
      return `${label}${mc}`
    }
    return `${matches.length} matching carriers`
  }

  if (name === 'get_rate_context') {
    const data = result as { latest?: { avgRatePerMile?: number } | null }
    if (!data.latest) return 'no matching lane data'
    return `latest avg $${data.latest.avgRatePerMile}/mi`
  }

  return 'ok'
}
