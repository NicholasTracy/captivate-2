import { TimeState, isNewPeriod } from './TimeState'
import { clampNormalized } from '../math/util'
import {
  Point,
  applyRandomization,
  resizeRandomizer,
} from './randomizer'
import { normalizeSlotAxis, type SlotAxis } from './slotOrder'

export type ChaseDirection = 'forward' | 'reverse' | 'bounce'

export type ChaseOptions = {
  /** Beats between advancing the chase head. */
  stepPeriod: number
  /** How many consecutive eligible slots stay armed each step. */
  stepsOn: number
  direction: ChaseDirection
  /**
   * Primary layout axis for slot order (and randomizer bar order on this split).
   * `horizontal` = left→right (top row first on ties);
   * `vertical` = top→bottom (left column first on ties).
   */
  slotAxis: SlotAxis
  envelopeRatio: number
  envelopeDuration: number
}

/** Ephemeral per-split chase bank (not saved). */
export type ChaseState = {
  points: Point[]
  head: number
  bounceDir: 1 | -1
}

const MIN_STEP_PERIOD = 0.05
const MIN_ENVELOPE_DURATION = 0.05
const MIN_ENVELOPE_SEGMENT = 1e-4
const CHASE_DIRECTIONS: readonly ChaseDirection[] = [
  'forward',
  'reverse',
  'bounce',
]

export function initChaseOptions(): ChaseOptions {
  return {
    stepPeriod: 1,
    stepsOn: 1,
    direction: 'forward',
    slotAxis: 'horizontal',
    envelopeRatio: 0.1,
    envelopeDuration: 1,
  }
}

export function normalizeChaseDirection(
  value: unknown
): ChaseDirection {
  if (value === 'forward' || value === 'reverse' || value === 'bounce') {
    return value
  }
  return 'forward'
}

/** Clamp / sanitize options so runtime math never hits NaN or divide-by-zero. */
export function normalizeChaseOptions(
  options: Partial<ChaseOptions> | ChaseOptions
): ChaseOptions {
  const defaults = initChaseOptions()
  const stepPeriod = Number(options.stepPeriod)
  const stepsOn = Number(options.stepsOn)
  const envelopeRatio = Number(options.envelopeRatio)
  const envelopeDuration = Number(options.envelopeDuration)

  return {
    stepPeriod: Number.isFinite(stepPeriod)
      ? Math.max(MIN_STEP_PERIOD, stepPeriod)
      : defaults.stepPeriod,
    stepsOn: Number.isFinite(stepsOn)
      ? Math.max(1, Math.min(64, Math.floor(stepsOn)))
      : defaults.stepsOn,
    direction: normalizeChaseDirection(options.direction),
    slotAxis: normalizeSlotAxis(options.slotAxis),
    envelopeRatio: Number.isFinite(envelopeRatio)
      ? clampNormalized(envelopeRatio)
      : defaults.envelopeRatio,
    envelopeDuration: Number.isFinite(envelopeDuration)
      ? Math.max(MIN_ENVELOPE_DURATION, envelopeDuration)
      : defaults.envelopeDuration,
  }
}

export function initChaseState(): ChaseState {
  return {
    points: [],
    head: 0,
    bounceDir: 1,
  }
}

export function resizeChase(state: ChaseState, size: number): ChaseState {
  const points = resizeRandomizer(state.points, size)
  const safeSize = points.length
  const head =
    safeSize <= 0
      ? 0
      : Math.max(0, Math.min(safeSize - 1, Math.floor(state.head)))
  return {
    points,
    head,
    bounceDir: state.bounceDir === -1 ? -1 : 1,
  }
}

/**
 * Apply randomize then chase mixes (each amount 0 = passthrough).
 * Same lerp used by the Randomizer module.
 */
export function applyEnvelopeGates(
  value: number,
  randomizerLevel: number,
  randomizeAmount: number,
  chaseLevel: number,
  chaseAmount: number
): number {
  return applyRandomization(
    applyRandomization(value, randomizerLevel, randomizeAmount),
    chaseLevel,
    chaseAmount
  )
}

function advanceHead(
  head: number,
  eligibleCount: number,
  direction: ChaseDirection,
  bounceDir: 1 | -1
): { head: number; bounceDir: 1 | -1 } {
  if (eligibleCount <= 0) {
    return { head: 0, bounceDir: 1 }
  }
  if (eligibleCount === 1) {
    return { head: 0, bounceDir: 1 }
  }

  if (direction === 'forward') {
    return { head: (head + 1) % eligibleCount, bounceDir: 1 }
  }
  if (direction === 'reverse') {
    return {
      head: (head - 1 + eligibleCount) % eligibleCount,
      bounceDir: -1,
    }
  }

  // bounce
  let nextDir: 1 | -1 = bounceDir
  let next = head + nextDir
  if (next >= eligibleCount) {
    nextDir = -1
    next = eligibleCount - 2
  } else if (next < 0) {
    nextDir = 1
    next = 1
  }
  return {
    head: Math.max(0, Math.min(eligibleCount - 1, next)),
    bounceDir: nextDir,
  }
}

/**
 * Sequential chase over the same slot bank as the Randomizer.
 * On each `stepPeriod`, advances a head through eligible indexes and arms
 * `stepsOn` consecutive slots (with wrap).
 */
export function updateChaseIndexes(
  beatsLast: number,
  state: ChaseState,
  ts: TimeState,
  indexes: number[],
  options: ChaseOptions
): ChaseState {
  const {
    stepPeriod,
    stepsOn,
    direction,
    envelopeRatio,
    envelopeDuration,
  } = normalizeChaseOptions(options)

  const riseBeats = Math.max(
    MIN_ENVELOPE_SEGMENT,
    envelopeDuration * envelopeRatio
  )
  const fallBeats = Math.max(
    MIN_ENVELOPE_SEGMENT,
    envelopeDuration - envelopeDuration * envelopeRatio
  )
  const beatDelta = ts.beats - beatsLast
  const safeBeatDelta = Number.isFinite(beatDelta) ? Math.max(0, beatDelta) : 0
  const indexesSet = new Set(indexes)

  const nextPoints = state.points.map<Point>(({ level, rising }, index) => {
    if (!indexesSet.has(index)) {
      return { level, rising }
    }
    if (rising) {
      const newLevel = level + safeBeatDelta / riseBeats
      if (newLevel > 1) {
        return { level: 1, rising: false }
      }
      return { level: newLevel, rising: true }
    }
    const newLevel = level - safeBeatDelta / fallBeats
    return {
      level: newLevel < 0 ? 0 : newLevel,
      rising: false,
    }
  })

  let head = state.head
  let bounceDir: 1 | -1 = state.bounceDir === -1 ? -1 : 1

  const eligible = indexes.filter(
    (index) =>
      Number.isInteger(index) && index >= 0 && index < nextPoints.length
  )

  if (isNewPeriod(beatsLast, ts.beats, stepPeriod) && eligible.length > 0) {
    // Map stored head (slot index) onto eligible list position.
    let eligiblePos = eligible.indexOf(head)
    if (eligiblePos < 0) {
      eligiblePos = 0
    }

    const onCount = Math.min(stepsOn, eligible.length)
    for (let i = 0; i < onCount; i++) {
      const slot = eligible[(eligiblePos + i) % eligible.length]
      if (slot === undefined) continue
      const point = nextPoints[slot]
      if (point !== undefined) {
        point.rising = true
      }
    }

    const advanced = advanceHead(
      eligiblePos,
      eligible.length,
      direction,
      bounceDir
    )
    head = eligible[advanced.head] ?? 0
    bounceDir = advanced.bounceDir
  }

  return {
    points: nextPoints,
    head,
    bounceDir,
  }
}

export { CHASE_DIRECTIONS }
