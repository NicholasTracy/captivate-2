import {
  fixtureBelongsToNamedGroup,
  isAllGroupName,
  normalizeFixtureGroupName,
} from './fixtureGroups'

export type SceneGroups = { [key: string]: boolean | undefined }

export function evaluateSceneGroups(
  sceneGroups: SceneGroups,
  matchesGroup: (group: string) => boolean
): boolean {
  const entries = Object.entries(sceneGroups)
  if (entries.length === 0) {
    return true
  }

  const includeGroups = entries
    .filter(([_, include]) => include === true)
    .map(([group]) => group)
  const excludeGroups = entries
    .filter(([_, include]) => include === false)
    .map(([group]) => group)

  const includePass =
    includeGroups.length === 0 || includeGroups.some((group) => matchesGroup(group))
  const excludePass = excludeGroups.every((group) => !matchesGroup(group))

  return includePass && excludePass
}

export function fixtureGroupsMatchSceneGroups(
  fixtureGroups: readonly string[],
  sceneGroups: SceneGroups,
  context?: { fixtureTypeName?: string | null }
): boolean {
  return evaluateSceneGroups(sceneGroups, (group) =>
    fixtureBelongsToNamedGroup(fixtureGroups, group, context)
  )
}

/**
 * Match a DMX fixture against one scene-group name.
 * Handles virtual All, auto type-label groups, Movers / Atmosphere, and stored groups.
 */
export function dmxFixtureMatchesSceneGroup(
  sceneGroup: string,
  opts: {
    fixtureGroups: readonly string[]
    fixtureTypeName?: string | null
    isMover?: boolean
    isAtmosphere?: boolean
  }
): boolean {
  const normalized = sceneGroup.trim()
  if (normalized.length <= 0) return false
  if (normalized === 'Visualizer') return false
  if (isAllGroupName(normalized)) return true
  if (normalized === 'Movers') return opts.isMover === true
  if (normalized === 'Atmosphere') return opts.isAtmosphere === true
  return fixtureBelongsToNamedGroup(opts.fixtureGroups, normalized, {
    fixtureTypeName: opts.fixtureTypeName,
  })
}

export function dmxFixtureMatchesSceneGroups(
  sceneGroups: SceneGroups,
  opts: {
    fixtureGroups: readonly string[]
    fixtureTypeName?: string | null
    isMover?: boolean
    isAtmosphere?: boolean
  }
): boolean {
  return evaluateSceneGroups(sceneGroups, (group) =>
    dmxFixtureMatchesSceneGroup(group, opts)
  )
}

/** Whether a scene group selector targets this LED fixture (LEDs/Pixels aliases). */
export function ledFixtureMatchesSceneGroup(
  fixtureGroups: readonly string[],
  sceneGroup: string
): boolean {
  const normalizedSceneGroup = sceneGroup.trim()
  if (normalizedSceneGroup.length <= 0) {
    return false
  }

  if (isAllGroupName(normalizedSceneGroup)) {
    return true
  }

  const normalizedFixtureGroups = new Set(
    fixtureGroups
      .map((group) => {
        const trimmed = group.trim()
        if (trimmed.length <= 0) {
          return ''
        }
        return trimmed.toLowerCase() === 'pixels' ? 'LEDs' : trimmed
      })
      .filter((group) => group.length > 0)
  )

  if (
    normalizedSceneGroup === 'LEDs' ||
    normalizedSceneGroup === 'Pixels'
  ) {
    return (
      normalizedFixtureGroups.has('LEDs') || normalizedFixtureGroups.has('Pixels')
    )
  }

  const exact = normalizeFixtureGroupName(normalizedSceneGroup)
  if (exact === null) return false
  return normalizedFixtureGroups.has(exact)
}

export function ledFixtureMatchesSceneGroups(
  fixtureGroups: readonly string[],
  sceneGroups: SceneGroups
): boolean {
  return evaluateSceneGroups(sceneGroups, (group) =>
    ledFixtureMatchesSceneGroup(fixtureGroups, group)
  )
}

export function sceneGroupsHasExplicitInclude(sceneGroups: SceneGroups): boolean {
  return Object.values(sceneGroups).some((include) => include === true)
}
