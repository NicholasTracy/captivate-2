import type { FlattenedFixture, Fixture } from './dmxFixtures'
import { getFixturesInGroups } from './dmxUtil'
import {
  type LedFixture,
  normalizeLedFixtureForRuntime,
} from './ledFixtures'
import { applyEnvelopeGates, type ChaseState } from './chase'
import type { RandomizerState } from './randomizer'
import type { BaseColors } from './baseColors'
import {
  ledFixtureMatchesSceneGroups,
  sceneGroupsHasExplicitInclude,
  type SceneGroups,
} from './sceneGroups'
import { getParam, type Params } from './params'
import {
  normalizeSlotAxis,
  sortFlattenedBySlotAxis,
  sortLedBySlotAxis,
  type SlotAxis,
} from './slotOrder'

export function getLedFixturesInSceneGroups(
  ledFixtures: LedFixture[],
  sceneGroups: SceneGroups,
  axis: SlotAxis = 'horizontal'
): LedFixture[] {
  const matched = ledFixtures
    .map((fixture) => normalizeLedFixtureForRuntime(fixture))
    .filter((fixture) =>
      ledFixtureMatchesSceneGroups(fixture.groups, sceneGroups)
    )
  return sortLedBySlotAxis(matched, normalizeSlotAxis(axis))
}

export function dmxFixtureWithinIntensityCeiling(
  fixture: FlattenedFixture,
  intensityCeiling: number
): boolean {
  const ceiling = Number.isFinite(intensityCeiling) ? intensityCeiling : 1
  return fixture.intensity <= ceiling
}

function hasSubFixtureIndex(fixture: FlattenedFixture): boolean {
  return (
    typeof fixture.subFixtureIndex === 'number' &&
    Number.isFinite(fixture.subFixtureIndex)
  )
}

function flattenedFixtureIdentityKey(fixture: FlattenedFixture): string {
  const fixtureId =
    typeof fixture.fixtureId === 'string' ? fixture.fixtureId.trim() : ''
  const subKey = hasSubFixtureIndex(fixture)
    ? `:sub:${Math.floor(fixture.subFixtureIndex!)}`
    : ''
  if (fixtureId.length > 0) {
    return `id:${fixtureId}${subKey}`
  }
  const firstCh = fixture.channels[0]?.[0]
  const typeId =
    typeof fixture.fixtureTypeId === 'string' ? fixture.fixtureTypeId : ''
  return `ch:${Number.isFinite(firstCh) ? firstCh : -1}:type:${typeId}${subKey}`
}

/**
 * Randomizer / Chase bank identity:
 * - one slot per physical fixture when there are no subfixtures
 * - one slot per subfixture (multi-cell bar cell) when present
 * Channel-family partitions of the same cell share one slot.
 */
function mappedSlotKey(fixture: FlattenedFixture): string {
  return flattenedFixtureIdentityKey(fixture)
}

/**
 * DMX fixtures mapped to this split — same group membership as DMX output
 * (`getFixturesInGroups` on flattened). One bar per physical fixture, or one
 * bar per subfixture for multi-cell fixtures, ordered by layout axis.
 * Shared by Randomizer and Chase bar banks.
 */
export function getSplitMappedDmxSlotFixtures(
  flattened: FlattenedFixture[],
  sceneGroups: SceneGroups,
  axis: SlotAxis = 'horizontal',
  _universe: Fixture[] = []
): FlattenedFixture[] {
  const slotAxis = normalizeSlotAxis(axis)
  const inSplit = getFixturesInGroups(flattened, sceneGroups)

  // Multi-cell fixtures also emit residual (non-sub) rows for shared masters.
  // Bars are per subfixture only — skip those residuals so they don't add a bar.
  const fixtureIdsWithSubs = new Set<string>()
  for (const fixture of inSplit) {
    if (!hasSubFixtureIndex(fixture)) continue
    const id =
      typeof fixture.fixtureId === 'string' ? fixture.fixtureId.trim() : ''
    if (id.length > 0) fixtureIdsWithSubs.add(id)
  }

  const seen = new Set<string>()
  const intensityByKey = new Map<string, number>()
  const representativeByKey = new Map<string, FlattenedFixture>()
  const order: string[] = []

  for (const fixture of inSplit) {
    const id =
      typeof fixture.fixtureId === 'string' ? fixture.fixtureId.trim() : ''
    if (
      id.length > 0 &&
      fixtureIdsWithSubs.has(id) &&
      !hasSubFixtureIndex(fixture)
    ) {
      continue
    }

    const key = mappedSlotKey(fixture)
    if (!seen.has(key)) {
      seen.add(key)
      order.push(key)
      representativeByKey.set(key, fixture)
    }
    const prev = intensityByKey.get(key)
    intensityByKey.set(
      key,
      Math.min(prev ?? Number.POSITIVE_INFINITY, fixture.intensity)
    )
  }

  const slots: FlattenedFixture[] = []
  for (const key of order) {
    const representative = representativeByKey.get(key)
    if (representative === undefined) continue
    slots.push({
      ...representative,
      intensity: intensityByKey.get(key) ?? representative.intensity,
    })
  }

  return sortFlattenedBySlotAxis(slots, slotAxis)
}

/** @deprecated Alias — use {@link getSplitMappedDmxSlotFixtures}. */
export function getDmxRandomizerSlotFixtures(
  fixtures: FlattenedFixture[],
  sceneGroups: SceneGroups,
  axis: SlotAxis = 'horizontal',
  universe: Fixture[] = []
): FlattenedFixture[] {
  return getSplitMappedDmxSlotFixtures(fixtures, sceneGroups, axis, universe)
}

/** @deprecated Alias — use {@link getSplitMappedDmxSlotFixtures}. */
export function getDmxChaseSlotFixtures(
  fixtures: FlattenedFixture[],
  sceneGroups: SceneGroups,
  axis: SlotAxis = 'horizontal',
  universe?: Fixture[]
): FlattenedFixture[] {
  return getSplitMappedDmxSlotFixtures(
    fixtures,
    sceneGroups,
    axis,
    universe ?? []
  )
}

/** @deprecated Prefer mapped slots + intensity gating at apply/trigger. */
export function getDmxRandomizerFixtures(
  fixtures: FlattenedFixture[],
  sceneGroups: SceneGroups,
  intensityCeiling: number
): FlattenedFixture[] {
  return getSplitMappedDmxSlotFixtures(fixtures, sceneGroups).filter((fixture) =>
    dmxFixtureWithinIntensityCeiling(fixture, intensityCeiling)
  )
}

export function countSplitMappedDmxSlots(
  flattened: FlattenedFixture[],
  sceneGroups: SceneGroups,
  axis: SlotAxis = 'horizontal',
  universe: Fixture[] = []
): number {
  return getSplitMappedDmxSlotFixtures(
    flattened,
    sceneGroups,
    axis,
    universe
  ).length
}

export function countSplitMappedLedSlots(
  ledFixtures: LedFixture[],
  sceneGroups: SceneGroups,
  axis: SlotAxis = 'horizontal'
): number {
  return getLedFixturesInSceneGroups(ledFixtures, sceneGroups, axis).length
}

/** Total Randomizer/Chase bars = mapped DMX fixtures + mapped LED fixtures. */
export function countSplitMappedSlots(
  flattened: FlattenedFixture[],
  ledFixtures: LedFixture[],
  sceneGroups: SceneGroups,
  axis: SlotAxis = 'horizontal',
  universe: Fixture[] = []
): number {
  return (
    countSplitMappedDmxSlots(flattened, sceneGroups, axis, universe) +
    countSplitMappedLedSlots(ledFixtures, sceneGroups, axis)
  )
}

export function countDmxRandomizerSlots(
  fixtures: FlattenedFixture[],
  sceneGroups: SceneGroups,
  _intensityCeiling?: number,
  axis: SlotAxis = 'horizontal',
  universe: Fixture[] = []
): number {
  return countSplitMappedDmxSlots(fixtures, sceneGroups, axis, universe)
}

export function countLedRandomizerSlots(
  ledFixtures: LedFixture[],
  sceneGroups: SceneGroups,
  axis: SlotAxis = 'horizontal'
): number {
  return countSplitMappedLedSlots(ledFixtures, sceneGroups, axis)
}

export function countSplitRandomizerSlots(
  fixtures: FlattenedFixture[],
  ledFixtures: LedFixture[],
  sceneGroups: SceneGroups,
  _intensityCeiling?: number,
  axis: SlotAxis = 'horizontal',
  universe: Fixture[] = []
): number {
  return countSplitMappedSlots(
    fixtures,
    ledFixtures,
    sceneGroups,
    axis,
    universe
  )
}

export function countDmxChaseSlots(
  fixtures: FlattenedFixture[],
  sceneGroups: SceneGroups,
  axis: SlotAxis = 'horizontal',
  universe?: Fixture[]
): number {
  return countSplitMappedDmxSlots(
    fixtures,
    sceneGroups,
    axis,
    universe ?? []
  )
}

export function countLedChaseSlots(
  ledFixtures: LedFixture[],
  sceneGroups: SceneGroups,
  axis: SlotAxis = 'horizontal'
): number {
  return countSplitMappedLedSlots(ledFixtures, sceneGroups, axis)
}

export function countSplitChaseSlots(
  fixtures: FlattenedFixture[],
  ledFixtures: LedFixture[],
  sceneGroups: SceneGroups,
  axis: SlotAxis = 'horizontal',
  universe?: Fixture[]
): number {
  return countSplitMappedSlots(
    fixtures,
    ledFixtures,
    sceneGroups,
    axis,
    universe ?? []
  )
}

/** Slot index for a live flattened fixture within the mapped DMX bank. */
export function dmxMappedSlotIndex(
  mappedFixtures: FlattenedFixture[],
  fixture: FlattenedFixture
): number {
  const key = mappedSlotKey(fixture)
  return mappedFixtures.findIndex((entry) => mappedSlotKey(entry) === key)
}

export function dmxRandomizerSlotIndex(
  randomizerFixtures: FlattenedFixture[],
  fixture: FlattenedFixture
): number {
  return dmxMappedSlotIndex(randomizerFixtures, fixture)
}

export function dmxChaseSlotIndex(
  chaseFixtures: FlattenedFixture[],
  fixture: FlattenedFixture
): number {
  return dmxMappedSlotIndex(chaseFixtures, fixture)
}

/** Absolute bank index for an LED fixture (after DMX mapped slots). */
export function getLedFixtureMappedSlotIndex(
  ledFixtures: LedFixture[],
  sceneGroups: SceneGroups,
  dmxMappedSlotCount: number,
  fixtureId: string,
  axis: SlotAxis = 'horizontal'
): number {
  const ledIndex = getLedFixturesInSceneGroups(
    ledFixtures,
    sceneGroups,
    axis
  ).findIndex((fixture) => fixture.id === fixtureId)
  if (ledIndex < 0) return -1
  return dmxMappedSlotCount + ledIndex
}

export function getLedFixtureChaseSlotIndex(
  ledFixtures: LedFixture[],
  sceneGroups: SceneGroups,
  dmxChaseSlotCount: number,
  fixtureId: string,
  axis: SlotAxis = 'horizontal'
): number {
  return getLedFixtureMappedSlotIndex(
    ledFixtures,
    sceneGroups,
    dmxChaseSlotCount,
    fixtureId,
    axis
  )
}

/**
 * @deprecated Prefer {@link getLedFixtureMappedSlotIndex} (absolute bank index).
 * Returns LED-local index among mapped LED fixtures (not a pixel span).
 */
export function getLedFixtureRandomizerBaseIndex(
  ledFixtures: LedFixture[],
  sceneGroups: SceneGroups,
  fixtureId: string,
  axis: SlotAxis = 'horizontal'
): number {
  return getLedFixturesInSceneGroups(ledFixtures, sceneGroups, axis).findIndex(
    (fixture) => fixture.id === fixtureId
  )
}

export function buildMappedTriggerIndexes(
  dmxMappedFixtures: FlattenedFixture[],
  ledMappedSlotCount: number,
  intensityCeiling: number
): number[] {
  const indexes: number[] = []
  dmxMappedFixtures.forEach((fixture, index) => {
    if (dmxFixtureWithinIntensityCeiling(fixture, intensityCeiling)) {
      indexes.push(index)
    }
  })
  const ledBase = dmxMappedFixtures.length
  for (let i = 0; i < ledMappedSlotCount; i += 1) {
    indexes.push(ledBase + i)
  }
  return indexes
}

export function buildChaseTriggerIndexes(
  dmxChaseFixtures: FlattenedFixture[],
  ledChaseSlotCount: number,
  intensityCeiling: number
): number[] {
  return buildMappedTriggerIndexes(
    dmxChaseFixtures,
    ledChaseSlotCount,
    intensityCeiling
  )
}

export function buildRandomizerTriggerIndexes(
  dmxSlotFixtures: FlattenedFixture[],
  ledSlotCount: number,
  intensityCeiling: number
): number[] {
  return buildMappedTriggerIndexes(
    dmxSlotFixtures,
    ledSlotCount,
    intensityCeiling
  )
}

export function pickPrimarySplitLayerForLed<T extends { splitIndex: number }>(
  layers: T[],
  splitScenes: Array<{ groups: SceneGroups }>
): T | null {
  if (layers.length === 0) {
    return null
  }

  const withExplicitInclude = layers.filter((layer) => {
    const groups = splitScenes[layer.splitIndex]?.groups
    return groups !== undefined && sceneGroupsHasExplicitInclude(groups)
  })

  return withExplicitInclude[0] ?? layers[0]
}

export function buildLedRandomizerContext(
  splitState:
    | {
        randomizer: RandomizerState
        chase?: ChaseState
        outputParams: Params
      }
    | undefined,
  splitScene:
    | {
        groups: SceneGroups
        chase?: { slotAxis?: SlotAxis }
      }
    | undefined,
  ledFixtures: LedFixture[],
  flattenedFixtures: FlattenedFixture[],
  fixtureId: string,
  universe: Fixture[] = []
): {
  state: RandomizerState
  /** Absolute mapped-bank index for this LED fixture (shared by all pixels). */
  slotIndex: number
  randomize: number
  chaseSlotIndex: number
  chaseState: RandomizerState
  chase: number
} | null {
  if (splitState === undefined || splitScene === undefined) {
    return null
  }

  const randomize = getParam(splitState.outputParams, 'randomize')
  const chase = getParam(splitState.outputParams, 'chase')
  if (randomize <= 0 && chase <= 0) {
    return null
  }

  const axis = normalizeSlotAxis(splitScene.chase?.slotAxis)
  const dmxCount = countSplitMappedDmxSlots(
    flattenedFixtures,
    splitScene.groups,
    axis,
    universe
  )
  const slotIndex = getLedFixtureMappedSlotIndex(
    ledFixtures,
    splitScene.groups,
    dmxCount,
    fixtureId,
    axis
  )
  if (slotIndex < 0) {
    return null
  }

  return {
    state: splitState.randomizer,
    slotIndex,
    randomize,
    chaseSlotIndex: slotIndex,
    chaseState: splitState.chase?.points ?? [],
    chase,
  }
}

export function applyLedRandomizerToColors(
  colors: BaseColors[],
  randomizer: RandomizerState | undefined,
  /** Absolute mapped slot for this LED fixture (all pixels share it). */
  slotIndex: number,
  randomizationAmount: number,
  chaseState?: RandomizerState,
  chaseAmount: number = 0,
  chaseSlotIndex: number = -1
): BaseColors[] {
  if (
    colors.length === 0 ||
    (randomizationAmount <= 0 && chaseAmount <= 0)
  ) {
    return colors
  }

  const randomizerLevel =
    slotIndex >= 0 ? randomizer?.[slotIndex]?.level ?? 1 : 1
  const chaseLevel =
    chaseSlotIndex >= 0
      ? chaseState?.[chaseSlotIndex]?.level ?? 1
      : 1

  return colors.map((color) => ({
    red: applyEnvelopeGates(
      color.red,
      randomizerLevel,
      randomizationAmount,
      chaseLevel,
      chaseAmount
    ),
    green: applyEnvelopeGates(
      color.green,
      randomizerLevel,
      randomizationAmount,
      chaseLevel,
      chaseAmount
    ),
    blue: applyEnvelopeGates(
      color.blue,
      randomizerLevel,
      randomizationAmount,
      chaseLevel,
      chaseAmount
    ),
  }))
}
