import type { Params } from './params'
import { getGroupIntensityLevel } from './groupIntensity'

export type ControlBusSource =
  | 'engine'
  | 'midi'
  | 'osc'
  | 'link'
  | 'audio'
  | 'ui'

export type LinkRole = 'full' | 'leader' | 'follow'

export function normalizeLinkRole(value: unknown): LinkRole {
  if (value === 'leader' || value === 'follow' || value === 'full') {
    return value
  }
  return 'full'
}

/** When false, Captivate must not push tempo into the Link session. */
export function linkRoleAllowsLocalTempoAuthorship(role: LinkRole): boolean {
  return role !== 'follow'
}

export function isLocalhostHost(host: string): boolean {
  const h = host.trim().toLowerCase()
  return (
    h === '127.0.0.1' ||
    h === 'localhost' ||
    h === '::1' ||
    h === '0.0.0.0' ||
    h === '[::1]'
  )
}

export interface ControlBusTimeSnapshot {
  bpm: number
  beats: number
  phase: number
  playing: boolean
}

export interface ControlBusAudioSnapshot {
  energy: number
  level: number
  beat: number
  bpm: number
}

export interface ControlBusSnapshot {
  time: ControlBusTimeSnapshot
  master: number
  blackout: boolean
  activeLightSceneIndex: number
  groupIntensities: { [groupName: string]: number }
  /** Post-modulation output params per split index. */
  splitOutputParams: Params[]
  /** Scene modulator LFO values (typically from split 0). */
  modulatorValues: number[]
  audio: ControlBusAudioSnapshot
}

export const CONTROL_BUS_EPSILON = 1e-4
export const CONTROL_BUS_PUBLISH_HZ = 30
export const CONTROL_BUS_HEARTBEAT_MS = 1000

export function controlBusValuesEqual(
  a: number,
  b: number,
  epsilon = CONTROL_BUS_EPSILON
): boolean {
  if (!Number.isFinite(a) && !Number.isFinite(b)) return true
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  return Math.abs(a - b) <= epsilon
}

export function sanitizeGroupNameForOsc(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_\-./]/g, '_')
    .replace(/\/+/g, '/')
    .replace(/^\/+|\/+$/g, '')
}

/** Minimal control + realtime shape for snapshot building (avoids renderer import cycles). */
export interface ControlBusControlInput {
  control: {
    master: number
    groupIntensity?: { [groupName: string]: number }
    light: {
      active: string
      ids: string[]
    }
  }
  gui: {
    blackout: boolean
  }
}

export interface ControlBusRealtimeInput {
  time: {
    bpm: number
    beats: number
    phase: number
    isPlaying: boolean
  }
  splitStates: Array<{
    outputParams: Params
    modulatorValues?: number[]
  }>
  audio: {
    energyLevel: number
    inputLevel: number
    beatDetected: boolean
    detectedBpm: number | null
  }
}

export function buildControlBusSnapshot(
  controlState: ControlBusControlInput,
  realtimeState: ControlBusRealtimeInput
): ControlBusSnapshot {
  const light = controlState.control.light
  const activeId = light.active
  const activeLightSceneIndex = Math.max(0, light.ids.indexOf(activeId))

  const groupIntensities: { [groupName: string]: number } = {}
  const map = controlState.control.groupIntensity ?? {}
  for (const groupName of Object.keys(map)) {
    groupIntensities[groupName] = getGroupIntensityLevel(map, groupName)
  }

  const splitOutputParams = realtimeState.splitStates.map(
    (split) => split.outputParams
  )

  const modulatorValues = realtimeState.splitStates[0]?.modulatorValues ?? []

  const audio = realtimeState.audio
  const time = realtimeState.time

  return {
    time: {
      bpm: Number.isFinite(time.bpm) ? time.bpm : 0,
      beats: Number.isFinite(time.beats) ? time.beats : 0,
      phase: Number.isFinite(time.phase) ? time.phase : 0,
      playing: time.isPlaying === true,
    },
    master: Number.isFinite(controlState.control.master)
      ? controlState.control.master
      : 1,
    blackout: controlState.gui.blackout === true,
    activeLightSceneIndex,
    groupIntensities,
    splitOutputParams,
    modulatorValues: modulatorValues.map((v) =>
      Number.isFinite(v) ? Number(v) : 0
    ),
    audio: {
      energy: Number.isFinite(audio.energyLevel) ? audio.energyLevel : 0,
      level: Number.isFinite(audio.inputLevel) ? audio.inputLevel : 0,
      beat: audio.beatDetected === true ? 1 : 0,
      bpm:
        audio.detectedBpm !== null && Number.isFinite(audio.detectedBpm)
          ? Number(audio.detectedBpm)
          : 0,
    },
  }
}

/** Flatten snapshot into address → numeric value for change detection. */
export function flattenControlBusAddresses(
  snapshot: ControlBusSnapshot
): { [address: string]: number } {
  const out: { [address: string]: number } = {
    '/captivate/time/bpm': snapshot.time.bpm,
    '/captivate/time/beats': snapshot.time.beats,
    '/captivate/time/phase': snapshot.time.phase,
    '/captivate/time/playing': snapshot.time.playing ? 1 : 0,
    '/captivate/master': snapshot.master,
    '/captivate/blackout': snapshot.blackout ? 1 : 0,
    '/captivate/scene/light': snapshot.activeLightSceneIndex,
    '/captivate/audio/energy': snapshot.audio.energy,
    '/captivate/audio/level': snapshot.audio.level,
    '/captivate/audio/beat': snapshot.audio.beat,
    '/captivate/audio/bpm': snapshot.audio.bpm,
  }

  for (const [name, intensity] of Object.entries(snapshot.groupIntensities)) {
    const safe = sanitizeGroupNameForOsc(name)
    if (!safe) continue
    out[`/captivate/group/${safe}/intensity`] = intensity
  }

  snapshot.splitOutputParams.forEach((params, splitIndex) => {
    for (const [key, value] of Object.entries(params)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue
      out[`/captivate/split/${splitIndex}/param/${key}`] = value
    }
  })

  snapshot.modulatorValues.forEach((value, index) => {
    out[`/captivate/modulator/${index}/value`] = value
  })

  return out
}

export const CONTROL_BUS_HEARTBEAT_ADDRESSES = [
  '/captivate/time/bpm',
  '/captivate/time/beats',
  '/captivate/time/phase',
  '/captivate/time/playing',
] as const
