import type { AudioEngineMetrics } from '../../shared/audioEngine'
import { initAudioEngineMetrics } from '../../shared/audioEngine'
import type { FlattenedFixture } from '../../shared/dmxFixtures'
import { DMX_NUM_CHANNELS } from '../../shared/dmxFixtures'
import {
  forEachChannel,
  getDmxValue,
  getFixturesInGroups,
} from '../../shared/dmxUtil'
import { effectiveMasterForFixture } from '../../shared/groupIntensity'
import { getOutputParams } from '../../shared/modulation'
import {
  activeOneShotPlays,
  ownedParamKeys,
  type OneShot_t,
} from '../../shared/oneShots'
import {
  defaultOutputParams,
  type Params,
} from '../../shared/params'
import type { LightScene_t } from '../../shared/Scenes'
import type { TimeState } from '../../shared/TimeState'
import type { CleanReduxState } from '../../renderer/redux/store'
import type { SplitState } from '../../renderer/redux/realtimeStore'

const DMX_DIFF_EPS = 0.05

let oneShotAudio: AudioEngineMetrics = initAudioEngineMetrics()

/** Latest analysis frame so one-shot audio LFOs follow the input. */
export function setOneShotAudioMetrics(audio: AudioEngineMetrics) {
  oneShotAudio = audio
}

function sceneParamsForFixture(
  fixture: FlattenedFixture,
  scene: LightScene_t | undefined,
  splitStates: SplitState[]
): Params {
  if (!scene) return defaultOutputParams()
  let found: Params | null = null
  scene.splitScenes.forEach((split, index) => {
    if (getFixturesInGroups([fixture], split.groups).length === 0) return
    found = splitStates[index]?.outputParams ?? found
  })
  return found ?? defaultOutputParams()
}

function fixtureIsMover(fixture: FlattenedFixture): boolean {
  return (
    fixture.moverCalibration !== undefined ||
    fixture.moverBounds !== undefined ||
    fixture.channels.some(
      ([, channel]) =>
        channel.type === 'axis' && (channel.dir === 'x' || channel.dir === 'y')
    )
  )
}

function paramKeysForShot(shot: OneShot_t): string[] {
  const keys = new Set<string>(Object.keys(defaultOutputParams()))
  shot.splitScenes.forEach((_, index) => {
    for (const key of ownedParamKeys(shot, index)) keys.add(key)
  })
  return [...keys]
}

/**
 * Replace scene DMX only on channels whose value changes when the one-shot's
 * owned parameters are merged in. Later triggers win. Unowned parameters stay
 * with the scene, including color that a strobe one-shot did not set.
 */
export function applyOneShotOverrides(args: {
  channels: number[]
  state: CleanReduxState
  splitStates: SplitState[]
  timeState: TimeState
  fixtures: FlattenedFixture[]
  syntheticStrobeFrameRateHz: number
  placementDepth2DOnly: boolean
}): void {
  const plays = activeOneShotPlays(
    args.state.control.oneShots,
    args.timeState.beats
  )
  if (plays.length === 0) return

  const scene =
    args.state.control.light.byId[args.state.control.light.active]
  const sceneParamsByFixture = new Map<FlattenedFixture, Params>()
  const layeredParams = new Map<FlattenedFixture, Params>()

  const sceneFor = (fixture: FlattenedFixture): Params => {
    const cached = sceneParamsByFixture.get(fixture)
    if (cached) return cached
    const params = sceneParamsForFixture(fixture, scene, args.splitStates)
    sceneParamsByFixture.set(fixture, params)
    return params
  }

  const baseFor = (fixture: FlattenedFixture): Params =>
    layeredParams.get(fixture) ?? sceneFor(fixture)

  for (const play of plays) {
    const shot = args.state.control.oneShots.byId[play.id]
    if (!shot) continue
    const localBeats = args.timeState.beats - play.startBeat
    const keys = paramKeysForShot(shot)
    const scope = `oneshot:${play.id}`

    shot.splitScenes.forEach((split, splitIndex) => {
      const owned = ownedParamKeys(shot, splitIndex)
      if (owned.length === 0) return
      const output = getOutputParams(
        localBeats,
        shot,
        splitIndex,
        keys,
        oneShotAudio,
        scope
      )
      const targets = getFixturesInGroups(args.fixtures, split.groups)
      for (const fixture of targets) {
        const sceneParams = baseFor(fixture)
        const merged: Params = { ...sceneParams }
        for (const key of owned) {
          const value = output[key]
          if (typeof value === 'number' && Number.isFinite(value)) {
            merged[key] = value
          }
        }
        const master = effectiveMasterForFixture(
          args.state.control.master,
          fixture.groups,
          args.state.control.groupIntensity,
          {
            includeVirtualMovers: fixtureIsMover(fixture),
            fixtureTypeName: fixture.fixtureTypeName,
          }
        )
        forEachChannel([fixture], (_fixtureIndex, fx, channelIdx, channel) => {
          if (channelIdx < 0 || channelIdx >= DMX_NUM_CHANNELS) return
          const before = getDmxValue(
            channel,
            sceneParams,
            fx,
            master,
            1,
            args.timeState,
            args.syntheticStrobeFrameRateHz,
            undefined,
            args.placementDepth2DOnly,
            1
          )
          const after = getDmxValue(
            channel,
            merged,
            fx,
            master,
            1,
            args.timeState,
            args.syntheticStrobeFrameRateHz,
            undefined,
            args.placementDepth2DOnly,
            1
          )
          if (Math.abs(before - after) <= DMX_DIFF_EPS) return
          args.channels[channelIdx] = after
        })
        layeredParams.set(fixture, merged)
      }
    })
  }
}
