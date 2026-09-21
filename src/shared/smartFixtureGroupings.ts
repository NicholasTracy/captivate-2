import { Fixture, FixtureType, Universe } from './dmxFixtures'
import {
  fixtureBelongsToNamedGroup,
  normalizeFixtureGroupList,
  normalizeFixtureGroupName,
} from './fixtureGroups'
import type { Window2D_t } from './window'

export type SmartGroupingAxis = 'x' | 'y' | 'z'

export type SmartGroupingMode =
  | { type: 'quadrants' }
  | { type: 'evenOdd'; axis: SmartGroupingAxis }
  | { type: 'axisBins'; axis: SmartGroupingAxis; binCount: number }

export type SmartGroupingScope =
  | { type: 'all' }
  | { type: 'group'; groupName: string }

export type SmartGroupingParentMode = 'keep' | 'replace'

export type SmartGroupingOptions = {
  mode: SmartGroupingMode
  scope: SmartGroupingScope
  /** When scoping to an existing group, keep it or replace with the new subgroups. */
  parentMode: SmartGroupingParentMode
  /** Optional label prefix for created groups (defaults to parent group name when scoped). */
  namePrefix?: string
}

export type SmartGroupingAssignment = {
  index: number
  groups: string[]
  bucketName: string
}

export type SmartGroupingPlan = {
  assignments: SmartGroupingAssignment[]
  createdGroups: string[]
  buckets: Array<{ name: string; count: number }>
  skippedCount: number
}

const RESERVED_SMART_GROUP_NAMES = new Set([
  'movers',
  'atmosphere',
  'visualizer',
  'all',
  'leds',
  'pixels',
])

function axisPos(window: Window2D_t | undefined, axis: SmartGroupingAxis): number {
  const value = window?.[axis]?.pos
  if (Number.isFinite(value)) {
    return value as number
  }
  // Match FixturePlacement defaults: Z starts at 1 when unset.
  return axis === 'z' ? 1 : 0.5
}

function fixtureInGroup(
  fixture: Fixture,
  groupName: string,
  fixtureTypesById?: { [id: string]: FixtureType }
): boolean {
  const typeName = fixtureTypesById?.[fixture.type]?.name
  return fixtureBelongsToNamedGroup(fixture.groups, groupName, {
    fixtureTypeName: typeName,
  })
}

function compareByAxisThenIndex(
  left: { index: number; fixture: Fixture; pos: number },
  right: { index: number; fixture: Fixture; pos: number }
): number {
  if (left.pos !== right.pos) {
    return left.pos - right.pos
  }
  return left.index - right.index
}

function sanitizePrefix(raw: string | undefined): string | null {
  if (raw === undefined) {
    return null
  }
  return normalizeFixtureGroupName(raw)
}

function withPrefix(prefix: string | null, label: string): string {
  const cleaned = normalizeFixtureGroupName(label) ?? label
  if (prefix === null) {
    return cleaned
  }
  return `${prefix} · ${cleaned}`
}

function ensureNonReserved(name: string): string {
  const key = name.toLowerCase()
  if (!RESERVED_SMART_GROUP_NAMES.has(key)) {
    return name
  }
  return `${name} Zone`
}

function resolvePrefix(options: SmartGroupingOptions): string | null {
  const explicit = sanitizePrefix(options.namePrefix)
  if (explicit !== null) {
    return explicit
  }
  if (options.scope.type === 'group') {
    return sanitizePrefix(options.scope.groupName)
  }
  return null
}

function selectFixtureRows(
  universe: Universe,
  scope: SmartGroupingScope,
  fixtureTypesById?: { [id: string]: FixtureType }
): Array<{ index: number; fixture: Fixture }> {
  const rows: Array<{ index: number; fixture: Fixture }> = []
  universe.forEach((fixture, index) => {
    if (
      scope.type === 'group' &&
      !fixtureInGroup(fixture, scope.groupName, fixtureTypesById)
    ) {
      return
    }
    rows.push({ index, fixture })
  })
  return rows
}

function applyBucketMembership(
  existing: string[],
  bucketName: string,
  options: SmartGroupingOptions
): string[] {
  let next = [...existing]
  if (options.scope.type === 'group' && options.parentMode === 'replace') {
    const parentKey = options.scope.groupName.toLowerCase()
    next = next.filter(
      (raw) => normalizeFixtureGroupName(raw)?.toLowerCase() !== parentKey
    )
  }
  next.push(bucketName)
  return normalizeFixtureGroupList(next)
}

function buildQuadrantBuckets(
  rows: Array<{ index: number; fixture: Fixture }>,
  prefix: string | null
): Map<number, string> {
  const out = new Map<number, string>()
  for (const row of rows) {
    const x = axisPos(row.fixture.window, 'x')
    const y = axisPos(row.fixture.window, 'y')
    // FOH map: high Y is toward the top of the pad (upstage / back).
    const side = x < 0.5 ? 'Left' : 'Right'
    const depth = y < 0.5 ? 'Front' : 'Back'
    out.set(row.index, ensureNonReserved(withPrefix(prefix, `${depth} ${side}`)))
  }
  return out
}

function axisDirectionLabel(axis: SmartGroupingAxis): string {
  if (axis === 'x') return 'L→R'
  if (axis === 'y') return 'Front→Back'
  return 'Low→High'
}

function buildEvenOddBuckets(
  rows: Array<{ index: number; fixture: Fixture }>,
  axis: SmartGroupingAxis,
  prefix: string | null
): Map<number, string> {
  const sorted = rows
    .map((row) => ({
      ...row,
      pos: axisPos(row.fixture.window, axis),
    }))
    .sort(compareByAxisThenIndex)

  const direction = axisDirectionLabel(axis)
  const evenName = ensureNonReserved(withPrefix(prefix, `Even (${direction})`))
  const oddName = ensureNonReserved(withPrefix(prefix, `Odd (${direction})`))
  const out = new Map<number, string>()
  sorted.forEach((row, orderIndex) => {
    out.set(row.index, orderIndex % 2 === 0 ? evenName : oddName)
  })
  return out
}

function stripLabel(binIndex: number, binCount: number, axis: SmartGroupingAxis): string {
  if (binCount === 2) {
    if (axis === 'x') return binIndex === 0 ? 'Left' : 'Right'
    if (axis === 'y') return binIndex === 0 ? 'Front' : 'Back'
    return binIndex === 0 ? 'Near' : 'Far'
  }
  if (binCount === 3) {
    if (axis === 'x') {
      return ['Left', 'Center', 'Right'][binIndex] ?? `Strip ${binIndex + 1}`
    }
    if (axis === 'y') {
      return ['Front', 'Mid', 'Back'][binIndex] ?? `Strip ${binIndex + 1}`
    }
    return ['Near', 'Mid', 'Far'][binIndex] ?? `Strip ${binIndex + 1}`
  }
  const axisTag = axis.toUpperCase()
  return `${axisTag} Strip ${binIndex + 1}/${binCount}`
}

function buildAxisBinBuckets(
  rows: Array<{ index: number; fixture: Fixture }>,
  axis: SmartGroupingAxis,
  binCountRaw: number,
  prefix: string | null
): Map<number, string> {
  const binCount = Math.max(2, Math.min(8, Math.round(binCountRaw)))
  const out = new Map<number, string>()
  for (const row of rows) {
    const pos = axisPos(row.fixture.window, axis)
    const clamped = Math.min(0.999999, Math.max(0, pos))
    const binIndex = Math.min(binCount - 1, Math.floor(clamped * binCount))
    out.set(
      row.index,
      ensureNonReserved(withPrefix(prefix, stripLabel(binIndex, binCount, axis)))
    )
  }
  return out
}

/** Preview / apply plan for smart fixture groupings from placement. */
export function planSmartFixtureGroupings(
  universe: Universe,
  options: SmartGroupingOptions,
  fixtureTypesById?: { [id: string]: FixtureType }
): SmartGroupingPlan {
  const rows = selectFixtureRows(universe, options.scope, fixtureTypesById)
  if (rows.length === 0) {
    return {
      assignments: [],
      createdGroups: [],
      buckets: [],
      skippedCount: 0,
    }
  }

  const prefix = resolvePrefix(options)
  let bucketsByIndex: Map<number, string>
  if (options.mode.type === 'quadrants') {
    bucketsByIndex = buildQuadrantBuckets(rows, prefix)
  } else if (options.mode.type === 'evenOdd') {
    bucketsByIndex = buildEvenOddBuckets(rows, options.mode.axis, prefix)
  } else {
    bucketsByIndex = buildAxisBinBuckets(
      rows,
      options.mode.axis,
      options.mode.binCount,
      prefix
    )
  }

  const countByName = new Map<string, number>()
  const assignments: SmartGroupingAssignment[] = []
  for (const row of rows) {
    const bucketName = bucketsByIndex.get(row.index)
    if (bucketName === undefined) {
      continue
    }
    countByName.set(bucketName, (countByName.get(bucketName) ?? 0) + 1)
    assignments.push({
      index: row.index,
      bucketName,
      groups: applyBucketMembership(row.fixture.groups, bucketName, options),
    })
  }

  const buckets = Array.from(countByName.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

  return {
    assignments,
    createdGroups: buckets.map((bucket) => bucket.name),
    buckets,
    skippedCount: Math.max(0, universe.length - rows.length),
  }
}

/** Groups currently assigned on the universe (custom + type defaults already applied). */
export function listAssignedFixtureGroupNames(universe: Universe): string[] {
  const names: string[] = []
  const seen = new Set<string>()
  for (const fixture of universe) {
    for (const raw of fixture.groups) {
      const name = normalizeFixtureGroupName(raw)
      if (name === null) {
        continue
      }
      const key = name.toLowerCase()
      if (seen.has(key) || RESERVED_SMART_GROUP_NAMES.has(key)) {
        continue
      }
      seen.add(key)
      names.push(name)
    }
  }
  return names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}
