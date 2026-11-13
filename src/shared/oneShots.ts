import { nanoid } from 'nanoid'
import { initChaseOptions } from './chase'
import { ALL_GROUP_NAME } from './fixtureGroups'
import type { Modulator } from './modulation'
import { initModulator } from './modulation'
import { initRandomizerOptions } from './randomizer'
import {
  initSplitScene,
  type LightScene_t,
  type SplitScene_t,
} from './Scenes'

/** A scene-shaped program that plays once, for `beats`, when triggered. */
export interface OneShot_t extends LightScene_t {
  beats: number
}

export interface OneShotPlay {
  id: string
  startBeat: number
}

export interface OneShotsState {
  ids: string[]
  byId: { [id: string]: OneShot_t }
  editingId: string | null
  /** Runtime only. Cleared when a project is loaded. */
  playing: OneShotPlay[]
}

const MIN_BEATS = 0.25
const MAX_BEATS = 64
const MOD_AMOUNT_EPS = 0.0001

export function clampOneShotBeats(beats: number): number {
  if (!Number.isFinite(beats)) return 4
  return Math.min(MAX_BEATS, Math.max(MIN_BEATS, beats))
}

export function initOneShotSplit(): SplitScene_t {
  const split = initSplitScene()
  split.baseParams = {}
  return split
}

export function initOneShot(): OneShot_t {
  return {
    name: 'One-shot',
    epicness: 0,
    autoEnabled: false,
    modulators: [initModulator(1)],
    splitScenes: [initOneShotSplit()],
    performanceRoutes: {},
    beats: 4,
  }
}

export function initOneShotsState(): OneShotsState {
  return {
    ids: [],
    byId: {},
    editingId: null,
    playing: [],
  }
}

export function newOneShotId(): string {
  return nanoid()
}

/**
 * Parameters this split actually drives. A defined base value counts, and so
 * does a non-zero modulator amount. Output defaults do not.
 */
export function ownedParamKeys(shot: OneShot_t, splitIndex: number): string[] {
  const split = shot.splitScenes[splitIndex]
  if (!split) return []
  const keys = new Set<string>()
  for (const [key, value] of Object.entries(split.baseParams ?? {})) {
    if (typeof value === 'number' && Number.isFinite(value)) keys.add(key)
  }
  for (const modulator of shot.modulators ?? []) {
    const amounts = modulator.splitModulations?.[splitIndex]
    if (!amounts) continue
    for (const [key, value] of Object.entries(amounts)) {
      if (
        typeof value === 'number' &&
        Number.isFinite(value) &&
        Math.abs(value) > MOD_AMOUNT_EPS
      ) {
        keys.add(key)
      }
    }
  }
  return [...keys]
}

/** Plays whose window contains `beatsNow`, earliest start first. */
export function activeOneShotPlays(
  bank: OneShotsState | undefined,
  beatsNow: number
): OneShotPlay[] {
  if (!bank || !Number.isFinite(beatsNow)) return []
  return bank.playing
    .filter((play) => {
      const shot = bank.byId[play.id]
      if (!shot || !Number.isFinite(play.startBeat)) return false
      const end = play.startBeat + clampOneShotBeats(shot.beats)
      return beatsNow >= play.startBeat && beatsNow < end
    })
    .slice()
    .sort((a, b) => a.startBeat - b.startBeat)
}

function normalizeModulator(mod: Modulator, splitCount: number): Modulator {
  if (!mod || !mod.lfo) {
    return initModulator(splitCount)
  }
  if (!Array.isArray(mod.splitModulations)) {
    mod.splitModulations = []
  }
  while (mod.splitModulations.length < splitCount) {
    mod.splitModulations.push({})
  }
  if (mod.splitModulations.length > splitCount) {
    mod.splitModulations = mod.splitModulations.slice(0, splitCount)
  }
  for (let i = 0; i < mod.splitModulations.length; i++) {
    if (!mod.splitModulations[i]) mod.splitModulations[i] = {}
  }
  return mod
}

function normalizeOneShot(raw: OneShot_t): OneShot_t {
  const shot = raw ?? initOneShot()
  if (typeof shot.name !== 'string' || shot.name.trim() === '') {
    shot.name = 'One-shot'
  }
  shot.beats = clampOneShotBeats(Number(shot.beats))
  shot.epicness = 0
  shot.autoEnabled = false
  if (!shot.performanceRoutes || typeof shot.performanceRoutes !== 'object') {
    shot.performanceRoutes = {}
  }
  if (!Array.isArray(shot.splitScenes) || shot.splitScenes.length === 0) {
    shot.splitScenes = [initOneShotSplit()]
  }
  for (const split of shot.splitScenes) {
    if (!split.baseParams || typeof split.baseParams !== 'object') {
      split.baseParams = {}
    }
    if (!split.groups || typeof split.groups !== 'object') {
      split.groups = { [ALL_GROUP_NAME]: true }
    }
    if (!split.randomizer || typeof split.randomizer !== 'object') {
      split.randomizer = initRandomizerOptions()
    }
    if (!split.chase || typeof split.chase !== 'object') {
      split.chase = initChaseOptions()
    }
  }
  if (!Array.isArray(shot.modulators) || shot.modulators.length === 0) {
    shot.modulators = [initModulator(shot.splitScenes.length)]
  }
  shot.modulators = shot.modulators.map((mod) =>
    normalizeModulator(mod, shot.splitScenes.length)
  )
  return shot
}

/** Fill missing banks and drop in-progress plays so a reload does not resume them. */
export function normalizeOneShots(raw: unknown): OneShotsState {
  if (!raw || typeof raw !== 'object') return initOneShotsState()
  const src = raw as OneShotsState
  if (!src.byId || typeof src.byId !== 'object') return initOneShotsState()
  const ids = Array.isArray(src.ids) ? src.ids : []
  src.ids = ids.filter((id) => typeof id === 'string' && !!src.byId[id])
  for (const id of src.ids) {
    src.byId[id] = normalizeOneShot(src.byId[id])
  }
  if (typeof src.editingId !== 'string' || !src.byId[src.editingId]) {
    src.editingId = src.ids[0] ?? null
  }
  src.playing = []
  return src
}
