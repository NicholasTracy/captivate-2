import { FixtureType, Universe } from './dmxFixtures'
import type { SceneGroups } from './sceneGroups'

/** Virtual group: every physical fixture / LED (not Visualizer). */
export const ALL_GROUP_NAME = 'All'

/** Names reserved for virtual / system groups (not user smart-group targets). */
export const RESERVED_FIXTURE_GROUP_NAMES = new Set([
  ALL_GROUP_NAME,
  'Movers',
  'Atmosphere',
  'Visualizer',
  'LEDs',
  'Pixels',
])

/** Normalize a user-entered fixture group name; returns null if empty after trim. */
export function normalizeFixtureGroupName(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return null
  }
  return trimmed
}

export function isAllGroupName(raw: string): boolean {
  return raw.trim().toLowerCase() === ALL_GROUP_NAME.toLowerCase()
}

export function isReservedFixtureGroupName(raw: string): boolean {
  const name = normalizeFixtureGroupName(raw)
  if (name === null) return false
  return RESERVED_FIXTURE_GROUP_NAMES.has(name)
}

/** Unique, non-empty group names in stable order (first occurrence wins). */
export function normalizeFixtureGroupList(groups: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of groups) {
    const name = normalizeFixtureGroupName(raw)
    if (name === null) {
      continue
    }
    const key = name.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    out.push(name)
  }
  return out
}

function compareFixtureGroupNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' })
}

/** Default scene/split group names — one per fixture type currently on the universe. */
export function fixtureTypeDefaultGroupNames(
  universe: Universe,
  fixtureTypesById: { [id: string]: FixtureType }
): string[] {
  const names: string[] = []
  const seen = new Set<string>()
  for (const fixture of universe) {
    const fixtureType = fixtureTypesById[fixture.type]
    if (fixtureType === undefined) {
      continue
    }
    const name = normalizeFixtureGroupName(fixtureType.name)
    if (name === null) {
      continue
    }
    const key = name.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    names.push(name)
  }
  return names.sort(compareFixtureGroupNames)
}

/** True when `groupName` is an auto type-label group for the current rig. */
export function isAutoFixtureTypeGroupName(
  groupName: string,
  universe: Universe,
  fixtureTypesById: { [id: string]: FixtureType }
): boolean {
  const needle = normalizeFixtureGroupName(groupName)?.toLowerCase()
  if (needle === undefined) return false
  if (RESERVED_FIXTURE_GROUP_NAMES.has(groupName.trim())) return false
  return fixtureTypeDefaultGroupNames(universe, fixtureTypesById).some(
    (name) => name.toLowerCase() === needle
  )
}

function countAssignedFixtureGroups(universe: Universe) {
  const counts = new Map<string, { name: string; count: number }>()
  for (const fixture of universe) {
    for (const raw of fixture.groups) {
      const name = normalizeFixtureGroupName(raw)
      if (name === null) {
        continue
      }
      const key = name.toLowerCase()
      const existing = counts.get(key)
      if (existing !== undefined) {
        existing.count += 1
      } else {
        counts.set(key, { name, count: 1 })
      }
    }
  }
  return counts
}

/**
 * Groups offered in full catalogs / fixture group tables:
 * All + fixture-type auto labels + custom names assigned to ≥1 fixture.
 */
export function getFixtureGroupPickerOptions(
  universe: Universe,
  fixtureTypesById: { [id: string]: FixtureType }
): string[] {
  const defaults = fixtureTypeDefaultGroupNames(universe, fixtureTypesById)
  const defaultKeys = new Set(defaults.map((name) => name.toLowerCase()))
  const assigned = countAssignedFixtureGroups(universe)
  const options = [ALL_GROUP_NAME, ...defaults]

  for (const { name, count } of assigned.values()) {
    if (count <= 0) {
      continue
    }
    const key = name.toLowerCase()
    if (key === ALL_GROUP_NAME.toLowerCase()) {
      continue
    }
    if (defaultKeys.has(key)) {
      continue
    }
    defaultKeys.add(key)
    options.push(name)
  }

  return options.sort(compareFixtureGroupNames)
}

/** Collect group names referenced by split SceneGroups maps. */
export function collectReferencedSceneGroupNames(
  splitScenes: ReadonlyArray<{ groups?: SceneGroups } | undefined>
): Set<string> {
  const out = new Set<string>()
  for (const split of splitScenes) {
    if (split?.groups === undefined) continue
    for (const [name, flag] of Object.entries(split.groups)) {
      if (flag === undefined) continue
      const normalized = normalizeFixtureGroupName(name)
      if (normalized !== null) out.add(normalized)
    }
  }
  return out
}

/**
 * Split / intensity list filter:
 * - Always keep All and non-auto (user/smart/virtual) groups
 * - Keep auto fixture-type groups when referenced (split/intensity) or
 *   explicitly pinned on ≥1 fixture in the group table
 */
export function filterGroupsForActiveUseLists(
  candidates: readonly string[],
  opts: {
    universe: Universe
    fixtureTypesById: { [id: string]: FixtureType }
    referencedNames: ReadonlySet<string>
  }
): string[] {
  const autoTypeKeys = new Set(
    fixtureTypeDefaultGroupNames(opts.universe, opts.fixtureTypesById).map(
      (name) => name.toLowerCase()
    )
  )
  const referencedKeys = new Set(
    Array.from(opts.referencedNames).map((name) => name.toLowerCase())
  )
  const pinnedTypeKeys = new Set<string>()
  for (const fixture of opts.universe) {
    for (const raw of fixture.groups) {
      const name = normalizeFixtureGroupName(raw)
      if (name === null) continue
      const key = name.toLowerCase()
      if (autoTypeKeys.has(key)) {
        pinnedTypeKeys.add(key)
      }
    }
  }

  return candidates.filter((raw) => {
    const name = normalizeFixtureGroupName(raw)
    if (name === null) return false
    if (isAllGroupName(name)) return true
    const key = name.toLowerCase()
    if (!autoTypeKeys.has(key)) return true
    return referencedKeys.has(key) || pinnedTypeKeys.has(key)
  })
}

/** Remove group names from patched fixtures when they are no longer valid. */
export function pruneFixtureGroupsInUniverse(
  universe: Universe,
  fixtureTypesById: { [id: string]: FixtureType }
): void {
  const validKeys = new Set(
    getFixtureGroupPickerOptions(universe, fixtureTypesById).map((name) =>
      name.toLowerCase()
    )
  )
  // Never store virtual All on fixtures.
  validKeys.delete(ALL_GROUP_NAME.toLowerCase())

  for (const fixture of universe) {
    fixture.groups = normalizeFixtureGroupList(
      fixture.groups.filter((group) => {
        const key = group.toLowerCase()
        if (key === ALL_GROUP_NAME.toLowerCase()) return false
        return validKeys.has(key)
      })
    )
  }
}

/** Keep patched fixture `groups` aligned with the current rig (call after add/remove). */
export function syncFixtureGroupCatalog(
  universe: Universe,
  fixtureTypesById: { [id: string]: FixtureType }
): void {
  pruneFixtureGroupsInUniverse(universe, fixtureTypesById)
}

/**
 * Whether a fixture belongs to a named scene/split group.
 * Handles virtual All, auto type-label groups, and stored Fixture.groups.
 */
export function fixtureBelongsToNamedGroup(
  fixtureGroups: readonly string[],
  sceneGroup: string,
  context?: { fixtureTypeName?: string | null }
): boolean {
  const group = sceneGroup.trim()
  if (group.length === 0) return false
  if (isAllGroupName(group)) return true

  const typeName = normalizeFixtureGroupName(context?.fixtureTypeName ?? '')
  if (typeName !== null && typeName.toLowerCase() === group.toLowerCase()) {
    return true
  }

  return fixtureGroups.some((raw) => {
    const name = normalizeFixtureGroupName(raw)
    return name !== null && name === group
  })
}
