import {
  Fixture,
  FixtureType,
  fixtureChannelLeafChannels,
  isMoverFixtureType,
} from '../dmxFixtures'
import { isMappedAtmosphericFixture } from '../atmosphericsMapping'

export interface FixtureAnchor {
  x: number
  y: number
  groups: string[]
  universe: number
  isMover: boolean
  isAtmos: boolean
}

export interface SpatialZone {
  x: number
  y: number
  width: number
  height: number
  groupName?: string
}

/** Cohesive set of usable groups (e.g. smart-grouping strips / quadrants). */
export interface GroupFamily {
  /** Shared name prefix, or empty for unprefixed stage groups. */
  id: string
  /** Human label for UI / scene titles. */
  label: string
  /** Groups ordered for chase / L→R or Front→Back motion. */
  groups: string[]
  /** Dominant layout axis from member centroids. */
  axis: 'x' | 'y' | 'mixed'
  kind: 'pair' | 'quadrant' | 'strip' | 'misc'
}

export interface RigProfile {
  fixtureCount: number
  hasMovers: boolean
  hasAtmos: boolean
  hasStrobe: boolean
  hasGobo: boolean
  hasPrism: boolean
  hasColorMap: boolean
  usableGroups: string[]
  /** Smart / related group sets preferred for multi-split recipes. */
  groupFamilies: GroupFamily[]
  fixtureAnchors: FixtureAnchor[]
  placementBounds: {
    minX: number
    maxX: number
    minY: number
    maxY: number
  }
  universes: number[]
}

export interface SceneGenerationRigInput {
  universe: Fixture[]
  fixtureTypesByID: Record<string, FixtureType>
}

const RESERVED_GROUPS = new Set([
  'Movers',
  'Atmosphere',
  'Visualizer',
  'All',
  'LEDs',
  'Pixels',
])

const QUADRANT_LABELS = [
  'Front Left',
  'Front Right',
  'Back Left',
  'Back Right',
] as const

const AXIS_PAIR_LABELS: Record<string, string[]> = {
  x: ['Left', 'Right'],
  y: ['Front', 'Back'],
  z: ['Near', 'Far'],
}

const AXIS_TRIPLE_LABELS: Record<string, string[]> = {
  x: ['Left', 'Center', 'Right'],
  y: ['Front', 'Mid', 'Back'],
  z: ['Near', 'Mid', 'Far'],
}

function axisPos(windowAxis: { pos?: number } | undefined, fallback: number) {
  const pos = windowAxis?.pos
  return Number.isFinite(pos) ? Math.min(1, Math.max(0, Number(pos))) : fallback
}

function fixtureHasChannelType(
  fixtureType: FixtureType,
  types: Set<string>
): boolean {
  return fixtureType.channels
    .flatMap((channel) => fixtureChannelLeafChannels(channel))
    .some((channel) => types.has(channel.type))
}

function anchorInGroup(anchor: FixtureAnchor, groupName: string): boolean {
  const key = groupName.trim()
  return anchor.groups.some((group) => group.trim() === key)
}

function membersForGroup(
  anchors: FixtureAnchor[],
  groupName: string
): FixtureAnchor[] {
  return anchors.filter((anchor) => anchorInGroup(anchor, groupName))
}

function groupCentroid(
  anchors: FixtureAnchor[],
  groupName: string
): { x: number; y: number } {
  const members = membersForGroup(anchors, groupName)
  if (members.length === 0) {
    return { x: 0.5, y: 0.5 }
  }
  let sumX = 0
  let sumY = 0
  for (const member of members) {
    sumX += member.x
    sumY += member.y
  }
  return { x: sumX / members.length, y: sumY / members.length }
}

function splitGroupPrefix(name: string): { prefix: string; label: string } {
  const sep = ' · '
  const index = name.lastIndexOf(sep)
  if (index <= 0) {
    return { prefix: '', label: name }
  }
  return {
    prefix: name.slice(0, index),
    label: name.slice(index + sep.length),
  }
}

function labelOrderIndex(label: string): number | null {
  const quadrant = QUADRANT_LABELS.indexOf(
    label as (typeof QUADRANT_LABELS)[number]
  )
  if (quadrant >= 0) {
    return quadrant
  }

  for (const labels of Object.values(AXIS_PAIR_LABELS)) {
    const index = labels.indexOf(label)
    if (index >= 0) {
      return index
    }
  }
  for (const labels of Object.values(AXIS_TRIPLE_LABELS)) {
    const index = labels.indexOf(label)
    if (index >= 0) {
      return index + 10
    }
  }

  if (label.startsWith('Even')) return 0
  if (label.startsWith('Odd')) return 1

  const stripMatch = /^[XYZ] Strip (\d+)\/(\d+)$/i.exec(label)
  if (stripMatch) {
    return Number(stripMatch[1]) - 1
  }

  return null
}

function detectFamilyKind(labels: string[]): GroupFamily['kind'] {
  const set = new Set(labels)
  if (QUADRANT_LABELS.every((label) => set.has(label))) {
    return 'quadrant'
  }
  if (
    labels.length === 2 &&
    labels.some((label) => label.startsWith('Even')) &&
    labels.some((label) => label.startsWith('Odd'))
  ) {
    return 'pair'
  }
  if (
    labels.length >= 2 &&
    labels.every(
      (label) =>
        labelOrderIndex(label) !== null ||
        /^[XYZ] Strip \d+\/\d+$/i.test(label)
    )
  ) {
    return labels.length === 2 ? 'pair' : 'strip'
  }
  return labels.length === 2 ? 'pair' : labels.length >= 3 ? 'strip' : 'misc'
}

function detectFamilyAxis(
  anchors: FixtureAnchor[],
  groups: string[]
): GroupFamily['axis'] {
  if (groups.length < 2) {
    return 'mixed'
  }
  const centroids = groups.map((group) => groupCentroid(anchors, group))
  const xs = centroids.map((c) => c.x)
  const ys = centroids.map((c) => c.y)
  const spanX = Math.max(...xs) - Math.min(...xs)
  const spanY = Math.max(...ys) - Math.min(...ys)
  if (spanX >= spanY * 1.15) return 'x'
  if (spanY >= spanX * 1.15) return 'y'
  return 'mixed'
}

function orderFamilyGroups(
  anchors: FixtureAnchor[],
  groups: string[],
  axis: GroupFamily['axis']
): string[] {
  return [...groups].sort((left, right) => {
    const leftLabel = splitGroupPrefix(left).label
    const rightLabel = splitGroupPrefix(right).label
    const leftOrder = labelOrderIndex(leftLabel)
    const rightOrder = labelOrderIndex(rightLabel)
    if (leftOrder !== null && rightOrder !== null && leftOrder !== rightOrder) {
      return leftOrder - rightOrder
    }
    const leftC = groupCentroid(anchors, left)
    const rightC = groupCentroid(anchors, right)
    if (axis === 'y') {
      if (leftC.y !== rightC.y) return leftC.y - rightC.y
      return leftC.x - rightC.x
    }
    if (leftC.x !== rightC.x) return leftC.x - rightC.x
    return leftC.y - rightC.y
  })
}

function analyzeGroupFamilies(
  anchors: FixtureAnchor[],
  usableGroups: string[]
): GroupFamily[] {
  if (usableGroups.length < 2) {
    return []
  }

  const byPrefix = new Map<string, string[]>()
  for (const group of usableGroups) {
    const { prefix } = splitGroupPrefix(group)
    const list = byPrefix.get(prefix) ?? []
    list.push(group)
    byPrefix.set(prefix, list)
  }

  const families: GroupFamily[] = []
  for (const [prefix, groups] of byPrefix.entries()) {
    if (groups.length < 2) {
      continue
    }
    const labels = groups.map((group) => splitGroupPrefix(group).label)
    const kind = detectFamilyKind(labels)
    const axis = detectFamilyAxis(anchors, groups)
    const ordered = orderFamilyGroups(anchors, groups, axis)
    families.push({
      id: prefix || 'stage',
      label: prefix || 'Stage groups',
      groups: ordered,
      axis,
      kind,
    })
  }

  // Prefer structured smart families, then larger sets.
  return families.sort((a, b) => {
    const kindScore = (kind: GroupFamily['kind']) =>
      kind === 'quadrant' ? 4 : kind === 'strip' ? 3 : kind === 'pair' ? 2 : 1
    const scoreDiff = kindScore(b.kind) - kindScore(a.kind)
    if (scoreDiff !== 0) return scoreDiff
    return b.groups.length - a.groups.length
  })
}

/** Spatial zone bound to a fixture group, centered on member placement. */
export function buildZoneForGroup(
  profile: RigProfile,
  groupName: string
): SpatialZone {
  const members = membersForGroup(profile.fixtureAnchors, groupName)
  if (members.length === 0) {
    return {
      x: 0.5,
      y: 0.5,
      width: 0.85,
      height: 0.85,
      groupName,
    }
  }

  let minX = 1
  let maxX = 0
  let minY = 1
  let maxY = 0
  for (const member of members) {
    minX = Math.min(minX, member.x)
    maxX = Math.max(maxX, member.x)
    minY = Math.min(minY, member.y)
    maxY = Math.max(maxY, member.y)
  }

  const width = Math.min(1, Math.max(0.22, maxX - minX + 0.18))
  const height = Math.min(1, Math.max(0.28, maxY - minY + 0.18))
  return {
    x: (minX + maxX) * 0.5,
    y: (minY + maxY) * 0.5,
    width,
    height,
    groupName,
  }
}

/**
 * Pick the best cohesive group family for multi-split recipes.
 * `preferredAxis` biases toward L→R (`x`) or Front→Back (`y`) families.
 */
export function pickGroupFamily(
  profile: RigProfile,
  options: {
    minGroups?: number
    maxGroups?: number
    preferredAxis?: 'x' | 'y'
  } = {}
): GroupFamily | null {
  const minGroups = options.minGroups ?? 2
  const maxGroups = options.maxGroups ?? 8
  const candidates = profile.groupFamilies.filter(
    (family) =>
      family.groups.length >= minGroups && family.groups.length <= maxGroups
  )
  if (candidates.length === 0) {
    return null
  }

  if (options.preferredAxis !== undefined) {
    const axisMatched = candidates.filter(
      (family) =>
        family.axis === options.preferredAxis || family.axis === 'mixed'
    )
    if (axisMatched.length > 0) {
      return axisMatched[0]!
    }
  }
  return candidates[0]!
}

/** Zones for an ordered list of groups (group filter + placement centroid). */
export function buildZonesForGroups(
  profile: RigProfile,
  groups: string[]
): SpatialZone[] {
  return groups.map((groupName) => buildZoneForGroup(profile, groupName))
}

/**
 * Prefer smart group families for chase strips; fall back to null when
 * placement-only zones should be used instead.
 */
export function resolveChaseGroupZones(
  profile: RigProfile,
  axis: 'columns' | 'rows',
  preferredCount: number
): { zones: SpatialZone[]; family: GroupFamily } | null {
  const preferredAxis = axis === 'columns' ? 'x' : 'y'
  const family = pickGroupFamily(profile, {
    minGroups: 2,
    maxGroups: Math.max(preferredCount + 2, 6),
    preferredAxis,
  })
  if (family === null) {
    return null
  }

  let groups = family.groups
  if (groups.length > preferredCount + 1 && preferredCount >= 2) {
    // Downsample evenly when the family is denser than the chase budget.
    const step = groups.length / preferredCount
    const sampled: string[] = []
    for (let i = 0; i < preferredCount; i += 1) {
      sampled.push(groups[Math.min(groups.length - 1, Math.floor(i * step))]!)
    }
    groups = [...new Set(sampled)]
  }

  if (groups.length < 2) {
    return null
  }

  return {
    zones: buildZonesForGroups(profile, groups),
    family,
  }
}

export function analyzeRigProfile(input: SceneGenerationRigInput): RigProfile {
  const anchors: FixtureAnchor[] = []
  const groupCounts = new Map<string, number>()
  const universes = new Set<number>()

  let hasMovers = false
  let hasAtmos = false
  let hasStrobe = false
  let hasGobo = false
  let hasPrism = false
  let hasColorMap = false

  for (const fixture of input.universe) {
    const fixtureType = input.fixtureTypesByID[fixture.type]
    if (fixtureType === undefined) {
      continue
    }

    const universe = fixture.universe ?? 1
    universes.add(universe)

    const mover = isMoverFixtureType(fixtureType)
    const atmos = isMappedAtmosphericFixture(fixture, fixtureType)
    hasMovers = hasMovers || mover
    hasAtmos = hasAtmos || atmos
    hasStrobe =
      hasStrobe ||
      fixtureHasChannelType(fixtureType, new Set(['strobe', 'strobeRgb']))
    hasGobo = hasGobo || fixtureHasChannelType(fixtureType, new Set(['goboMap']))
    hasPrism =
      hasPrism || fixtureHasChannelType(fixtureType, new Set(['prismMap']))
    hasColorMap =
      hasColorMap || fixtureHasChannelType(fixtureType, new Set(['colorMap']))

    const groups = Array.isArray(fixture.groups) ? fixture.groups : []
    for (const group of groups) {
      const normalized = group.trim()
      if (normalized.length <= 0 || RESERVED_GROUPS.has(normalized)) {
        continue
      }
      groupCounts.set(normalized, (groupCounts.get(normalized) ?? 0) + 1)
    }

    anchors.push({
      x: axisPos(fixture.window?.x, 0.5),
      y: axisPos(fixture.window?.y, 0.5),
      groups,
      universe,
      isMover: mover,
      isAtmos: atmos,
    })
  }

  const usableGroups = [...groupCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([group]) => group)

  const bounds = computePlacementBounds(anchors)
  const groupFamilies = analyzeGroupFamilies(anchors, usableGroups)

  return {
    fixtureCount: anchors.length,
    hasMovers,
    hasAtmos,
    hasStrobe,
    hasGobo,
    hasPrism,
    hasColorMap,
    usableGroups,
    groupFamilies,
    fixtureAnchors: anchors,
    placementBounds: bounds,
    universes: [...universes].sort((a, b) => a - b),
  }
}

function computePlacementBounds(anchors: FixtureAnchor[]) {
  if (anchors.length === 0) {
    return { minX: 0, maxX: 1, minY: 0, maxY: 1 }
  }
  let minX = 1
  let maxX = 0
  let minY = 1
  let maxY = 0
  for (const anchor of anchors) {
    minX = Math.min(minX, anchor.x)
    maxX = Math.max(maxX, anchor.x)
    minY = Math.min(minY, anchor.y)
    maxY = Math.max(maxY, anchor.y)
  }
  const padX = Math.max(0.08, (maxX - minX) * 0.12)
  const padY = Math.max(0.08, (maxY - minY) * 0.12)
  return {
    minX: Math.max(0, minX - padX),
    maxX: Math.min(1, maxX + padX),
    minY: Math.max(0, minY - padY),
    maxY: Math.min(1, maxY + padY),
  }
}

export function defaultStageZones(cols: number, rows: number): SpatialZone[] {
  const zones: SpatialZone[] = []
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      zones.push({
        x: (col + 0.5) / cols,
        y: 1 - (row + 0.5) / rows,
        width: 0.9 / cols,
        height: 0.9 / rows,
      })
    }
  }
  return zones
}

export function buildSpatialZonesFromRig(
  profile: RigProfile,
  cols: number,
  rows: number
): SpatialZone[] {
  if (profile.fixtureCount === 0) {
    return defaultStageZones(cols, rows)
  }

  const { minX, maxX, minY, maxY } = profile.placementBounds
  const spanX = Math.max(0.12, maxX - minX)
  const spanY = Math.max(0.12, maxY - minY)
  const cellW = spanX / cols
  const cellH = spanY / rows
  const zones: SpatialZone[] = []

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      zones.push({
        x: minX + (col + 0.5) * cellW,
        y: minY + (rows - row - 0.5) * cellH,
        width: Math.min(1, cellW * 0.92),
        height: Math.min(1, cellH * 0.92),
      })
    }
  }
  return zones
}

export function buildLeftRightZones(profile: RigProfile): [SpatialZone, SpatialZone] {
  const { minX, maxX, minY, maxY } = profile.placementBounds
  const midX = (minX + maxX) * 0.5
  const y = (minY + maxY) * 0.5
  const width = Math.max(0.28, (maxX - minX) * 0.42)
  const height = Math.max(0.55, maxY - minY)
  return [
    { x: midX - width * 0.55, y, width, height },
    { x: midX + width * 0.55, y, width, height },
  ]
}

export function buildGroupZones(profile: RigProfile, count: number): SpatialZone[] {
  const target = Math.max(2, count)
  const exactFamily =
    profile.groupFamilies.find((family) => family.groups.length === target) ??
    pickGroupFamily(profile, {
      minGroups: 2,
      maxGroups: Math.max(target, 8),
    })

  if (exactFamily !== null) {
    const groups =
      exactFamily.groups.length <= target
        ? exactFamily.groups
        : exactFamily.groups.slice(0, target)
    if (groups.length >= 2) {
      return buildZonesForGroups(profile, groups)
    }
  }

  const groups = profile.usableGroups.slice(0, target)
  if (groups.length >= 2) {
    return buildZonesForGroups(profile, groups)
  }
  return buildSpatialZonesFromRig(profile, target, 1)
}

/** Generic rig profile for shipping default-save light scenes (movers + strobe enabled). */
export function defaultSaveRigProfile(): RigProfile {
  return {
    fixtureCount: 16,
    hasMovers: true,
    hasAtmos: false,
    hasStrobe: true,
    hasGobo: false,
    hasPrism: false,
    hasColorMap: false,
    usableGroups: [],
    groupFamilies: [],
    fixtureAnchors: [],
    placementBounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
    universes: [1],
  }
}
