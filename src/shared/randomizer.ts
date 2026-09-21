import { TimeState, isNewPeriod } from './TimeState'
import { clampNormalized, lerp } from '../math/util'

type Normalized = number

export interface Point {
  level: Normalized
  rising: boolean
}

export type RandomizerState = Point[]

export function initRandomizerOptions() {
  return {
    triggerPeriod: 1, // beats
    triggerDensity: 0.3,
    envelopeRatio: 0.1,
    envelopeDuration: 1, // beats
  }
}

export type RandomizerOptions = ReturnType<typeof initRandomizerOptions>

const MIN_TRIGGER_PERIOD = 0.05
const MIN_ENVELOPE_DURATION = 0.05
const MIN_ENVELOPE_SEGMENT = 1e-4

/** Clamp / sanitize options so runtime math never hits NaN or divide-by-zero. */
export function normalizeRandomizerOptions(
  options: Partial<RandomizerOptions> | RandomizerOptions
): RandomizerOptions {
  const defaults = initRandomizerOptions()
  const triggerPeriod = Number(options.triggerPeriod)
  const triggerDensity = Number(options.triggerDensity)
  const envelopeRatio = Number(options.envelopeRatio)
  const envelopeDuration = Number(options.envelopeDuration)

  return {
    triggerPeriod: Number.isFinite(triggerPeriod)
      ? Math.max(MIN_TRIGGER_PERIOD, triggerPeriod)
      : defaults.triggerPeriod,
    triggerDensity: Number.isFinite(triggerDensity)
      ? clampNormalized(triggerDensity)
      : defaults.triggerDensity,
    envelopeRatio: Number.isFinite(envelopeRatio)
      ? clampNormalized(envelopeRatio)
      : defaults.envelopeRatio,
    envelopeDuration: Number.isFinite(envelopeDuration)
      ? Math.max(MIN_ENVELOPE_DURATION, envelopeDuration)
      : defaults.envelopeDuration,
  }
}

function initPoint(): Point {
  return {
    level: 0,
    rising: false,
  }
}

export function initRandomizerState(): RandomizerState {
  return []
}

export function applyRandomization(
  value: number,
  randomizerLevel: number,
  randomizationAmount: number
) {
  return lerp(value, value * randomizerLevel, randomizationAmount)
}

// returns a new randomizerState with the desired size. Growing or shrinking as necessary
export function resizeRandomizer(state: RandomizerState, size: number) {
  const syncedState: Point[] = []
  const safeSize = Number.isFinite(size) ? Math.max(0, Math.floor(size)) : 0
  Array(safeSize)
    .fill(0)
    .forEach((_, i) => {
      let oldState = state[i]
      syncedState[i] = oldState ?? initPoint()
    })
  return syncedState
}

// returns the desired amount of random indexes
// Each chosen index in unique, which is why this function is so specialized
function pickRandomIndexes(randCount: number, size: number) {
  const randomIndexes: number[] = []
  const availableIndexes = Array.from(Array(size).keys())
  const count = Math.max(0, Math.min(size, Math.floor(randCount)))
  for (let i = 0; i < count; i++) {
    const index = Math.floor(Math.random() * availableIndexes.length)
    const randomIndex = availableIndexes[index]
    availableIndexes.splice(index, 1)
    randomIndexes.push(randomIndex)
  }
  return randomIndexes
}

/** How many slots should re-trigger for this density. Density 0 → none. */
export function randomizerTriggerCount(
  slotCount: number,
  triggerDensity: number
): number {
  if (slotCount <= 0) {
    return 0
  }
  const density = clampNormalized(triggerDensity)
  if (density <= 0) {
    return 0
  }
  if (density >= 1) {
    return slotCount
  }
  // Density > 0 always arms at least one slot when any exist.
  return Math.min(slotCount, Math.max(1, Math.ceil(slotCount * density)))
}

export function updateIndexes(
  beatsLast: number,
  state: RandomizerState,
  ts: TimeState,
  indexes: number[],
  options: RandomizerOptions
) {
  const {
    triggerPeriod,
    triggerDensity,
    envelopeRatio,
    envelopeDuration,
  } = normalizeRandomizerOptions(options)

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
  const nextState = state.map<Point>(({ level, rising }, index) => {
    if (indexesSet.has(index)) {
      if (rising) {
        const newLevel = level + safeBeatDelta / riseBeats
        if (newLevel > 1) {
          return {
            level: 1,
            rising: false,
          }
        } else {
          return {
            level: newLevel,
            rising: true,
          }
        }
      } else {
        const newLevel = level - safeBeatDelta / fallBeats
        return {
          level: newLevel < 0 ? 0 : newLevel,
          rising: false,
        }
      }
    } else {
      return {
        level,
        rising,
      }
    }
  })

  if (isNewPeriod(beatsLast, ts.beats, triggerPeriod)) {
    const eligible = indexes.filter(
      (index) => Number.isInteger(index) && index >= 0 && index < nextState.length
    )
    const randCount = randomizerTriggerCount(eligible.length, triggerDensity)
    if (randCount > 0) {
      pickRandomIndexes(randCount, eligible.length).forEach((pick) => {
        const index = eligible[pick]
        if (index === undefined) {
          return
        }
        const point = nextState[index]
        if (point !== undefined) {
          point.rising = true
        }
      })
    }
  }

  return nextState
}
