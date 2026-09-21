import { clampNormalized } from '../math/util'

/** Per named fixture-group max brightness (0–1). Missing key = full (1). */
export type GroupIntensityMap = { [groupName: string]: number }

export function normalizeGroupIntensityMap(
  raw: unknown
): GroupIntensityMap {
  if (raw === null || typeof raw !== 'object') {
    return {}
  }
  const out: GroupIntensityMap = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const name = typeof key === 'string' ? key.trim() : ''
    if (name.length === 0) continue
    const n = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(n)) continue
    const clamped = clampNormalized(n)
    // Skip full intensity to keep the map sparse (default is 1).
    if (clamped >= 0.999) continue
    out[name] = clamped
  }
  return out
}

function lookupGroupIntensity(
  intensities: GroupIntensityMap,
  groupName: string
): number | undefined {
  const direct = intensities[groupName]
  if (typeof direct === 'number' && Number.isFinite(direct)) {
    return clampNormalized(direct)
  }
  const needle = groupName.toLowerCase()
  for (const [key, value] of Object.entries(intensities)) {
    if (key.toLowerCase() === needle) {
      return clampNormalized(value)
    }
  }
  return undefined
}

/** Resolved group intensity level; missing key = full (1). */
export function getGroupIntensityLevel(
  intensities: GroupIntensityMap | undefined,
  groupName: string
): number {
  if (intensities === undefined) return 1
  return lookupGroupIntensity(intensities, groupName) ?? 1
}

/**
 * Strictest (minimum) group ceiling for a fixture.
 * Fixtures in multiple groups use the lowest assigned intensity.
 * Returns 1 when no configured group intensities apply.
 */
export function resolveGroupIntensityMultiplier(
  fixtureGroups: readonly string[] | undefined,
  intensities: GroupIntensityMap | undefined,
  options?: {
    includeVirtualMovers?: boolean
    fixtureTypeName?: string | null
  }
): number {
  if (intensities === undefined || Object.keys(intensities).length === 0) {
    return 1
  }

  let min = 1
  let found = false

  const consider = (groupName: string) => {
    const trimmed = groupName.trim()
    if (trimmed.length === 0) return
    const level = lookupGroupIntensity(intensities, trimmed)
    if (level === undefined) return
    found = true
    min = Math.min(min, level)
  }

  if (fixtureGroups !== undefined) {
    for (const group of fixtureGroups) {
      consider(group)
    }
  }

  const typeName =
    typeof options?.fixtureTypeName === 'string'
      ? options.fixtureTypeName.trim()
      : ''
  if (typeName.length > 0) {
    consider(typeName)
  }

  if (options?.includeVirtualMovers === true) {
    consider('Movers')
  }

  return found ? min : 1
}

/** Global master × group ceiling. */
export function effectiveMasterForFixture(
  master: number,
  fixtureGroups: readonly string[] | undefined,
  intensities: GroupIntensityMap | undefined,
  options?: {
    includeVirtualMovers?: boolean
    fixtureTypeName?: string | null
  }
): number {
  const m = Number.isFinite(master) ? clampNormalized(master) : 1
  return (
    m *
    resolveGroupIntensityMultiplier(fixtureGroups, intensities, options)
  )
}
