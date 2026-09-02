import type { CarrierInteraction } from '../types/interactions'
import { applyManualAssignment } from './entityResolution'

const OVERRIDES_KEY = 'goodlane_interaction_overrides_v1'

export type InteractionOverride = {
  loadId: string | null
  mcNumber: string | null
  updatedAt: string
}

type OverrideMap = Record<string, InteractionOverride>

let overrideCache: OverrideMap | null = null

function readOverrides(): OverrideMap {
  if (overrideCache) return overrideCache

  try {
    const raw = localStorage.getItem(OVERRIDES_KEY)
    overrideCache = raw ? (JSON.parse(raw) as OverrideMap) : {}
  } catch {
    overrideCache = {}
  }

  return overrideCache
}

function persistOverrides(): void {
  localStorage.setItem(OVERRIDES_KEY, JSON.stringify(readOverrides()))
}

export function loadInteractionOverrides(): OverrideMap {
  return { ...readOverrides() }
}

export function getInteractionOverride(interactionId: string): InteractionOverride | null {
  return readOverrides()[interactionId] ?? null
}

export function saveInteractionOverride(
  interactionId: string,
  override: Pick<InteractionOverride, 'loadId' | 'mcNumber'>,
): InteractionOverride {
  const entry: InteractionOverride = {
    loadId: override.loadId,
    mcNumber: override.mcNumber,
    updatedAt: new Date().toISOString(),
  }

  readOverrides()[interactionId] = entry
  persistOverrides()
  return entry
}

export function clearInteractionOverride(interactionId: string): void {
  delete readOverrides()[interactionId]
  persistOverrides()
}

export function assignAndPersistInteraction(
  interaction: CarrierInteraction,
  assignment: { loadId: string | null; mcNumber: string | null },
): CarrierInteraction {
  const updated = applyManualAssignment({
    ...interaction,
    loadId: assignment.loadId?.trim() || null,
    mcNumber: assignment.mcNumber?.replace(/\D/g, '') || null,
  })

  saveInteractionOverride(interaction.id, {
    loadId: updated.loadId,
    mcNumber: updated.mcNumber,
  })

  return updated
}

export function applyOverridesToInteractions(
  interactions: CarrierInteraction[],
): CarrierInteraction[] {
  const overrides = readOverrides()

  return interactions.map((interaction) => {
    const override = overrides[interaction.id]
    if (!override) return interaction

    return applyManualAssignment({
      ...interaction,
      loadId: override.loadId,
      mcNumber: override.mcNumber,
    })
  })
}
