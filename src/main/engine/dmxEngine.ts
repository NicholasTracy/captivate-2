import {
  DMX_MAX_VALUE,
  DMX_MIN_VALUE,
  DMX_NUM_CHANNELS,
  FlattenedFixture,
  normalizeDmxUniverseChannels,
  universeHasMovers,
  zeroUnpatchedDmxChannels,
} from '../../shared/dmxFixtures'
import {
  fixtureChannelHasColorMap,
  fixtureChannelHasGoboMap,
  fixtureChannelHasPrismMap,
  getFixtureMapCalibrationOverrideValue,
} from '../../shared/fixtureMapCalibration'
import { FixtureChannel } from '../../shared/dmxFixtures'
import { CleanReduxState } from '../../renderer/redux/store'
import {
  getDmxValue,
  getFixturesInGroups,
  flatten_fixtures,
  forEachChannel,
  getDefaultDmxValue,
  getMovingWindow,
  mapNormalizedToAxisPhysicalDmx,
  type MoverAxisOverrides,
} from '../../shared/dmxUtil'
import { indexArray, zip } from '../../shared/util'
import { TimeState } from '../../shared/TimeState'
import { SplitState } from 'renderer/redux/realtimeStore'
import { getUniverseOverwrites } from '../../renderer/redux/mixerSlice'
import { clampNormalized } from '../../math/util'
import { getParam, getMoverPhaseParams, type Params } from '../../shared/params'
import {
  MOVER_MODE_MIRROR,
  MOVER_TANDEM_MAX_SPREAD,
  parseMoverModeFromParams,
  resolveMoverPadTargetsForGroup,
} from '../../shared/moverPadTargets'
import {
  baseMoverGroupName,
} from '../../shared/moverOrdering'
import {
  applySequentialJointPhaseDmx,
  emitRawAxisOverrides,
  mapRawPadToIdealDmx,
  solveMoverAimIdealDmx,
  stepMoverJointMotion,
} from '../../shared/moverKinematics'
import { initStageDimensions } from '../../shared/stage'
import {
  dmxRandomizerSlotIndex,
  getDmxRandomizerFixtures,
} from '../../shared/splitRandomizer'
import {
  getVisualizerDriverOutputParams,
  mergeParamsWithStageLightSample,
  stageLightMapMasterFromEffects,
} from '../../shared/stageLightMap'
import { getLatestStageLightMap } from './stageLightMapRuntime'

function readDmxChannel(channels: number[], channelIdx: number): number {
  if (channelIdx < 0 || channelIdx >= DMX_NUM_CHANNELS) return 0
  const v = channels[channelIdx]
  return Number.isFinite(v) ? v : 0
}

function writeDmxChannel(channels: number[], channelIdx: number, value: number): void {
  if (channelIdx < 0 || channelIdx >= DMX_NUM_CHANNELS) return
  channels[channelIdx] = value
}
const LIGHTING_CONTROL_PARAM_KEYS = [
  'hue',
  'saturation',
  'brightness',
  'white',
  'warmWhite',
  'amber',
  'uv',
  'x',
  'y',
  'width',
  'height',
  'z',
  'depth',
  'intensity',
  'strobe',
  'randomize',
  'visStageMapMix',
] as const

function splitHasLightingControlBundle(
  params: Record<string, number | undefined>
) {
  return LIGHTING_CONTROL_PARAM_KEYS.some((param) => params[param] !== undefined)
}

function isAtmosCustomChannelName(name: string) {
  if (name.length <= 0) return false
  const exclusions = ['pan', 'tilt', 'speed', 'gobo', 'prism', 'zoom', 'focus']
  if (exclusions.some((token) => name.includes(token))) {
    return false
  }
  return [
    'volume',
    'fan',
    'fog',
    'haze',
    'bubble',
    'confetti',
    'co2',
    'flame',
    'pyro',
    'output',
    'pump',
    'mist',
    'jet',
    'trigger',
    'on/off',
    'on off',
    'onoff',
    'fx',
  ].some((token) => name.includes(token))
}

function isAtmosControlChannel(
  channel: FlattenedFixture['channels'][number][1]
) {
  if (channel.type === 'fxtrTrigger' || channel.type === 'fxtrLevel') {
    return true
  }
  if (channel.type !== 'custom' || channel.isControllable !== true) {
    return false
  }
  return isAtmosCustomChannelName(channel.name.trim().toLowerCase())
}

function getUniverseCount(state: CleanReduxState): number {
  const configuredUniverseCount =
    state.control.device.connectionSettings.universeCount ?? 1

  const maxFixtureUniverse = state.dmx.universe.reduce((maxUniverse, fixture) => {
    const fixtureUniverse = fixture.universe ?? 1
    return Math.max(maxUniverse, fixtureUniverse)
  }, 1)

  return Math.max(1, configuredUniverseCount, maxFixtureUniverse)
}

import {
  getConfiguredDmxOutputRateHz as getConfiguredDmxOutputRateHzFromDevice,
} from '../../shared/dmxOutputRate'

export function getConfiguredDmxOutputRateHz(state: CleanReduxState): number {
  return getConfiguredDmxOutputRateHzFromDevice(state.control.device)
}

export function getDmxComputeIntervalMs(state: CleanReduxState): number {
  return 1000 / getConfiguredDmxOutputRateHz(state)
}

function getSyntheticStrobeFrameRateHz(state: CleanReduxState): number {
  return getConfiguredDmxOutputRateHz(state)
}

function clampDmxValue(value: number, fallback: number = 128): number {
  if (!Number.isFinite(value)) {
    return fallback
  }

  return Math.min(DMX_MAX_VALUE, Math.max(DMX_MIN_VALUE, Math.round(value)))
}

function clampDmxFloatValue(value: number, fallback: number = 128): number {
  if (!Number.isFinite(value)) {
    return fallback
  }

  return Math.min(DMX_MAX_VALUE, Math.max(DMX_MIN_VALUE, value))
}

function hasMoverAxisChannels(fixture: FlattenedFixture): boolean {
  return fixture.channels.some(([, channel]) => {
    return channel.type === 'axis' && !channel.isFine
  })
}

function fixtureCenterPosition(
  fixture: FlattenedFixture
): { x: number; y: number } {
  return {
    x: clampNormalized(fixture.window?.x?.pos ?? 0.5),
    y: clampNormalized(fixture.window?.y?.pos ?? 0.5),
  }
}

function getMoverMotionKey(
  fixture: FlattenedFixture,
  motionNamespace: string
): string {
  let panChannelNumber = -1
  let tiltChannelNumber = -1

  fixture.channels.forEach(([channelNumber, channel]) => {
    if (channel.type !== 'axis' || channel.isFine) return
    if (channel.dir === 'x' && panChannelNumber < 0) {
      panChannelNumber = channelNumber
      return
    }
    if (channel.dir === 'y' && tiltChannelNumber < 0) {
      tiltChannelNumber = channelNumber
    }
  })

  const fixtureIdPart =
    typeof fixture.fixtureId === 'string' && fixture.fixtureId.trim().length > 0
      ? fixture.fixtureId.trim()
      : `anon-${fixture.fixtureTypeId ?? 'fixture'}`

  return `${motionNamespace}:${fixtureIdPart}:x${panChannelNumber}:y${tiltChannelNumber}`
}

function clampAxisToCalibrationRange(
  value: number,
  calibration?: { min: number; max: number }
): number {
  const safe = clampDmxFloatValue(value)
  if (calibration === undefined) {
    return safe
  }
  const min = clampDmxValue(calibration.min, DMX_MIN_VALUE)
  const max = clampDmxValue(calibration.max, DMX_MAX_VALUE)
  const low = Math.min(min, max)
  const high = Math.max(min, max)
  return Math.min(high, Math.max(low, safe))
}

function groupHasKinematicsEnabled(
  groupName: string,
  moverGroupSettings: CleanReduxState['dmx']['moverGroupSettings'] | undefined
): boolean {
  const base = baseMoverGroupName(groupName)
  const settings = moverGroupSettings?.[base] ?? moverGroupSettings?.[groupName]
  return settings?.kinematicsEnabled === true
}

function mapMoverHomeIdealDmx(fixture: FlattenedFixture): {
  panDmx: number
  tiltDmx: number
} {
  const panHome = Number(fixture.moverCalibration?.pan?.home)
  const tiltHome = Number(fixture.moverCalibration?.tilt?.home)

  const targetPanDmx = Number.isFinite(panHome)
    ? clampAxisToCalibrationRange(panHome, fixture.moverCalibration?.pan)
    : mapNormalizedToAxisPhysicalDmx(0.5, fixture.moverCalibration?.pan)
  const targetTiltDmx = Number.isFinite(tiltHome)
    ? clampAxisToCalibrationRange(tiltHome, fixture.moverCalibration?.tilt)
    : mapNormalizedToAxisPhysicalDmx(0.5, fixture.moverCalibration?.tilt)

  return {
    panDmx: clampAxisToCalibrationRange(
      targetPanDmx,
      fixture.moverCalibration?.pan
    ),
    tiltDmx: clampAxisToCalibrationRange(
      targetTiltDmx,
      fixture.moverCalibration?.tilt
    ),
  }
}

function emitMoverIdeal(
  fixture: FlattenedFixture,
  idealPanDmx: number,
  idealTiltDmx: number,
  motionKey: string | undefined,
  timeState: TimeState,
  useKinematicsMotion: boolean
): MoverAxisOverrides {
  const pan = clampAxisToCalibrationRange(
    idealPanDmx,
    fixture.moverCalibration?.pan
  )
  const tilt = clampAxisToCalibrationRange(
    idealTiltDmx,
    fixture.moverCalibration?.tilt
  )

  if (useKinematicsMotion && motionKey) {
    return stepMoverJointMotion({
      motionKey,
      idealPanDmx: pan,
      idealTiltDmx: tilt,
      dtMs: Number(timeState.dt) || 1000 / 90,
      panCalibration: fixture.moverCalibration?.pan,
      tiltCalibration: fixture.moverCalibration?.tilt,
    })
  }

  return emitRawAxisOverrides(pan, tilt)
}

function buildMoverAxisOverridesForSplit(
  splitSceneFixtures: FlattenedFixture[],
  baseParams: SplitState['outputParams'],
  outputParams: SplitState['outputParams'],
  timeState: TimeState,
  motionNamespace: string,
  dmxState: CleanReduxState['dmx'],
  options?: {
    advancedControl?: boolean
  }
): { [fixtureIdx: number]: MoverAxisOverrides } {
  const axisOverridesByFixtureIdx: { [fixtureIdx: number]: MoverAxisOverrides } =
    {}
  const resolvedAxisParams = {
    ...baseParams,
    ...outputParams,
  }
  const advancedControl = options?.advancedControl === true
  const stage = dmxState.stage ?? initStageDimensions()
  const sequenceById = dmxState.moverSequenceByFixtureId ?? {}
  const groupSettings = dmxState.moverGroupSettings ?? {}

  // Basic (no Advanced): shared raw pad → DMX, no modes/motion.
  if (!advancedControl) {
    const baseX = clampNormalized(Number(resolvedAxisParams.xAxis ?? 0.5))
    const baseY = clampNormalized(Number(resolvedAxisParams.yAxis ?? 0.5))

    splitSceneFixtures.forEach((fixture, fixtureIdx) => {
      if (!hasMoverAxisChannels(fixture)) {
        return
      }

      const ideal = mapRawPadToIdealDmx(fixture, baseX, baseY)
      const motionKey = getMoverMotionKey(fixture, motionNamespace)
      axisOverridesByFixtureIdx[fixtureIdx] = emitMoverIdeal(
        fixture,
        ideal.panDmx,
        ideal.tiltDmx,
        motionKey,
        timeState,
        false
      )
    })

    return axisOverridesByFixtureIdx
  }

  const spread = Math.min(
    MOVER_TANDEM_MAX_SPREAD,
    clampNormalized(getParam(resolvedAxisParams, 'moverSpread'))
  )
  const { phasePan, phaseTilt } = getMoverPhaseParams(resolvedAxisParams)
  const mirrorLeftRight = getParam(resolvedAxisParams, 'moverMirrorX') > 0.5
  const mirrorTopBottom = getParam(resolvedAxisParams, 'moverMirrorY') > 0.5
  const baseMoverMode = parseMoverModeFromParams(resolvedAxisParams)

  const fixturesByGroup: {
    [groupName: string]: Array<{
      fixtureIdx: number
      fixture: FlattenedFixture
      x: number
      y: number
      key: string
    }>
  } = {}

  splitSceneFixtures.forEach((fixture, fixtureIdx) => {
    const groupName = fixture.moverGroup?.trim()
    if (!groupName || !hasMoverAxisChannels(fixture)) {
      return
    }

    const center = fixtureCenterPosition(fixture)
    const fixtureKey =
      typeof fixture.fixtureId === 'string' && fixture.fixtureId.trim().length > 0
        ? fixture.fixtureId.trim()
        : `idx-${fixtureIdx}`
    const groupItems = fixturesByGroup[groupName] ?? []
    groupItems.push({
      fixtureIdx,
      fixture,
      x: center.x,
      y: center.y,
      key: fixtureKey,
    })
    fixturesByGroup[groupName] = groupItems
  })

  for (const [groupName, fixturesInGroup] of Object.entries(fixturesByGroup)) {
    const normalizedGroupName = groupName.trim()
    const kinematicsEnabled = groupHasKinematicsEnabled(
      normalizedGroupName,
      groupSettings
    )
    const hasPanTarget = Number.isFinite(resolvedAxisParams.xAxis)
    const hasTiltTarget = Number.isFinite(resolvedAxisParams.yAxis)
    const baseX = hasPanTarget
      ? clampNormalized(Number(resolvedAxisParams.xAxis))
      : 0.5
    const baseY = hasTiltTarget
      ? clampNormalized(Number(resolvedAxisParams.yAxis))
      : 0.5

    let moverMode = baseMoverMode
    if (!kinematicsEnabled && moverMode !== MOVER_MODE_MIRROR) {
      moverMode = 0
    }

    const useMirrorLeftRight =
      mirrorLeftRight && moverMode === MOVER_MODE_MIRROR
    const useMirrorTopBottom =
      mirrorTopBottom && moverMode === MOVER_MODE_MIRROR

    const padTargets = resolveMoverPadTargetsForGroup(
      fixturesInGroup.map((entry) => {
        const sequenceOverride = sequenceById[entry.key]
        return {
          key: String(entry.fixtureIdx),
          x: entry.x,
          y: entry.y,
          sortOrder: entry.fixtureIdx,
          sequenceOverride:
            sequenceOverride !== undefined && Number.isFinite(sequenceOverride)
              ? Number(sequenceOverride)
              : undefined,
        }
      }),
      {
        baseX,
        baseY,
        moverMode,
        spread: kinematicsEnabled ? spread : 0,
        mirrorLeftRight: useMirrorLeftRight,
        mirrorTopBottom: useMirrorTopBottom,
        hasPanTarget,
        hasTiltTarget,
        kinematicsEnabled,
      }
    )

    const targetByFixtureIdx = new Map(
      padTargets.map((target) => [Number(target.key), target] as const)
    )
    const groupFixtureCount = fixturesInGroup.length

    for (const entry of fixturesInGroup) {
      const motionKey = getMoverMotionKey(entry.fixture, motionNamespace)
      const padTarget = targetByFixtureIdx.get(entry.fixtureIdx)

      if (!hasPanTarget && !hasTiltTarget) {
        const home = mapMoverHomeIdealDmx(entry.fixture)
        axisOverridesByFixtureIdx[entry.fixtureIdx] = emitMoverIdeal(
          entry.fixture,
          home.panDmx,
          home.tiltDmx,
          motionKey,
          timeState,
          kinematicsEnabled
        )
        continue
      }

      const padX = padTarget?.x ?? baseX
      const padY = padTarget?.y ?? baseY

      let ideal: { panDmx: number; tiltDmx: number }
      if (kinematicsEnabled) {
        ideal = solveMoverAimIdealDmx({
          fixture: entry.fixture,
          padX,
          padY,
          stage,
        })
        ideal = applySequentialJointPhaseDmx({
          panDmx: ideal.panDmx,
          tiltDmx: ideal.tiltDmx,
          sequenceIndex: padTarget?.sequenceIndex ?? 0,
          fixtureCount: groupFixtureCount,
          phasePan01: phasePan,
          phaseTilt01: phaseTilt,
          calibration: entry.fixture.moverCalibration,
          mountOrientation: entry.fixture.moverMountOrientation,
        })
      } else {
        ideal = mapRawPadToIdealDmx(entry.fixture, padX, padY)
      }

      axisOverridesByFixtureIdx[entry.fixtureIdx] = emitMoverIdeal(
        entry.fixture,
        ideal.panDmx,
        ideal.tiltDmx,
        motionKey,
        timeState,
        kinematicsEnabled
      )
    }
  }

  return axisOverridesByFixtureIdx
}

function getMoverCalibrationOverrideTarget(
  state: CleanReduxState,
  fixtureId: string | undefined
): { panDmx: number; tiltDmx: number } | undefined {
  if (fixtureId === undefined) {
    return undefined
  }

  const override = state.gui.moverCalibrationOverride
  if (override === null || override.fixtureId !== fixtureId) {
    return undefined
  }

  return {
    panDmx: override.panDmx,
    tiltDmx: override.tiltDmx,
  }
}

function getMapCalibrationOverrideForChannel(
  state: CleanReduxState,
  fixture: FlattenedFixture,
  channel: FixtureChannel
): number | undefined {
  const fixtureType = state.dmx.fixtureTypesByID[fixture.fixtureTypeId ?? '']
  return getFixtureMapCalibrationOverrideValue(
    fixture.fixtureTypeId,
    fixtureType?.channels,
    channel,
    [
      {
        override: state.gui.colorMapCalibrationOverride,
        predicate: fixtureChannelHasColorMap,
      },
      {
        override: state.gui.goboMapCalibrationOverride,
        predicate: fixtureChannelHasGoboMap,
      },
      {
        override: state.gui.prismMapCalibrationOverride,
        predicate: fixtureChannelHasPrismMap,
      },
    ]
  )
}

function calculateDmxForUniverse(
  state: CleanReduxState,
  splitStates: SplitState[],
  timeState: TimeState,
  universeIndex: number
): number[] {
  const universeFixtures = state.dmx.universe.filter(
    (fixture) => (fixture.universe ?? 1) === universeIndex
  )
  const all_fixtures = flatten_fixtures(
    universeFixtures,
    state.dmx.fixtureTypesByID,
    state.dmx.moverGroupByFixtureId
  )
  // Same universe-agnostic flatten used when sizing randomizer slots in engine.ts.
  const allUniverseFixtures = flatten_fixtures(
    state.dmx.universe,
    state.dmx.fixtureTypesByID,
    state.dmx.moverGroupByFixtureId
  )
  const universeHasMoverFixtureType = universeHasMovers(
    universeFixtures,
    state.dmx.fixtureTypesByID
  )

  // All channels start at 0
  const channels = Array(DMX_NUM_CHANNELS).fill(0)

  const moverCalibrationOverride = state.gui.moverCalibrationOverride
  const colorMapCalibrationOverride = state.gui.colorMapCalibrationOverride
  const goboMapCalibrationOverride = state.gui.goboMapCalibrationOverride
  const prismMapCalibrationOverride = state.gui.prismMapCalibrationOverride
  const fixtureMapCalibrationActive =
    colorMapCalibrationOverride !== null ||
    goboMapCalibrationOverride !== null ||
    prismMapCalibrationOverride !== null
  const axisOnlyOverrideMode =
    !timeState.isPlaying &&
    state.gui.moverAdvancedControlEnabled === true &&
    moverCalibrationOverride !== null &&
    !fixtureMapCalibrationActive
  const fixtureMapOnlyOverrideMode = fixtureMapCalibrationActive

  const syntheticStrobeFrameRateHz = getSyntheticStrobeFrameRateHz(state)
  const placementDepth2DOnly = state.gui.fxtrDepthOn !== true

  // Set each channel to its default value first.
  forEachChannel(all_fixtures, (_fixtureIdx, _fixture, channelIdx, channel) => {
    writeDmxChannel(channels, channelIdx, getDefaultDmxValue(channel))
  })

  if (axisOnlyOverrideMode && moverCalibrationOverride !== null) {
    forEachChannel(all_fixtures, (_fixtureIdx, fixture, channelIdx, channel) => {
      if (channel.type !== 'axis') return
      if (fixture.fixtureId !== moverCalibrationOverride.fixtureId) return

      const overrideDmx =
        channel.dir === 'x'
          ? moverCalibrationOverride.panDmx
          : moverCalibrationOverride.tiltDmx

      if (channel.isFine) {
        writeDmxChannel(channels, channelIdx, channel.min)
        return
      }

      writeDmxChannel(channels, channelIdx, clampDmxValue(overrideDmx, channel.min))
    })
  } else if (fixtureMapOnlyOverrideMode) {
    // Fixture-manager wheel tuning overrides scene output on matching fixtures.
    const activeOverride =
      colorMapCalibrationOverride ??
      goboMapCalibrationOverride ??
      prismMapCalibrationOverride
    const matchingFixtureTypeId = activeOverride?.fixtureTypeId

    forEachChannel(all_fixtures, (_fixtureIdx, fixture, channelIdx, channel) => {
      if (
        matchingFixtureTypeId !== undefined &&
        fixture.fixtureTypeId === matchingFixtureTypeId &&
        channel.type === 'master'
      ) {
        writeDmxChannel(channels, channelIdx, channel.max)
      }

      const mapOverrideValue = getMapCalibrationOverrideForChannel(
        state,
        fixture,
        channel
      )
      if (mapOverrideValue !== undefined) {
        writeDmxChannel(channels, channelIdx, mapOverrideValue)
      }
    })
  } else {
    const scenes = state.control.light
    const activeScene = scenes.byId[scenes.active]
    const plannerNamespace = `u${universeIndex}`

    if (activeScene?.splitScenes) {
      for (const [{ outputParams, randomizer }, splitScene] of zip(
        splitStates,
        activeScene.splitScenes
      )) {
      const splitGroups = splitScene.groups
      const splitHasAxisBundle =
        splitScene.baseParams.xAxis !== undefined ||
        splitScene.baseParams.yAxis !== undefined ||
        splitScene.baseParams.moverSpread !== undefined ||
        splitScene.baseParams.moverPhase !== undefined ||
        splitScene.baseParams.moverPhasePan !== undefined ||
        splitScene.baseParams.moverPhaseTilt !== undefined ||
        splitScene.baseParams.moverMirrorX !== undefined ||
        splitScene.baseParams.moverMirrorY !== undefined ||
        splitScene.baseParams.moverMode !== undefined ||
        outputParams.moverPhase !== undefined ||
        outputParams.moverPhasePan !== undefined ||
        outputParams.moverPhaseTilt !== undefined ||
        outputParams.xAxis !== undefined ||
        outputParams.yAxis !== undefined
      const splitHasAtmosControlBundle =
        splitScene.baseParams.atmosFxtrOnOff !== undefined ||
        splitScene.baseParams.atmosFxtrLevel !== undefined ||
        outputParams.atmosFxtrOnOff !== undefined ||
        outputParams.atmosFxtrLevel !== undefined
      const splitHasLightingControls = splitHasLightingControlBundle(
        splitScene.baseParams
      )

      const splitSceneFixtures = getFixturesInGroups(all_fixtures, splitGroups)
      const intensityCeiling = outputParams.intensity ?? 1
      const randomizerFixtures = getDmxRandomizerFixtures(
        allUniverseFixtures,
        splitGroups,
        intensityCeiling
      )
      const splitMoverAxisOverrides =
        splitHasAxisBundle && universeHasMoverFixtureType
          ? buildMoverAxisOverridesForSplit(
              splitSceneFixtures,
              splitScene.baseParams,
              outputParams,
              timeState,
              plannerNamespace,
              state.dmx,
              {
                advancedControl: state.gui.moverAdvancedControlEnabled === true,
              }
            )
          : {}

      const stageLightGrid = getLatestStageLightMap()
      const visualScenes = state.control.visual
      const activeVisualScene = visualScenes.byId[visualScenes.active]
      const vizDriverParams = getVisualizerDriverOutputParams(
        activeScene,
        splitStates
      )
      const stageMapMaster =
        activeVisualScene !== undefined
          ? stageLightMapMasterFromEffects(
              activeVisualScene.config.builtin.effects,
              vizDriverParams
            )
          : 0
      const stageMapMix = getParam(outputParams, 'visStageMapMix') * stageMapMaster
      const stageCrop2d = getMovingWindow(outputParams, placementDepth2DOnly)
      const stageLightFixtureParams =
        stageLightGrid !== null && stageMapMix > 0.001
          ? new Map<number, Params>()
          : null

      // Set each channel based on active scene fixtures.
      forEachChannel(
        splitSceneFixtures,
        (fixtureIdx, fixture, channelIdx, channel) => {
          if (channel.type === 'axis' && !splitHasAxisBundle) {
            return
          }
          if (channel.type !== 'axis' && !splitHasLightingControls) {
            const allowAtmosChannel =
              splitHasAtmosControlBundle && isAtmosControlChannel(channel)
            if (!allowAtmosChannel) {
              return
            }
          }

          const randomizerSlot = dmxRandomizerSlotIndex(
            randomizerFixtures,
            fixture
          )
          const randomizerLevel =
            randomizerSlot >= 0
              ? randomizer[randomizerSlot]?.level ?? 1
              : 1
          const moverAxisOverride =
            channel.type === 'axis'
              ? splitMoverAxisOverrides[fixtureIdx]
              : undefined

          const calibrationOverride =
            channel.type === 'axis'
              ? getMoverCalibrationOverrideTarget(state, fixture.fixtureId)
              : undefined
          const mapOverrideValue = getMapCalibrationOverrideForChannel(
            state,
            fixture,
            channel
          )

          let dmxParams = outputParams
          if (stageLightFixtureParams !== null && stageLightGrid !== null) {
            let merged = stageLightFixtureParams.get(fixtureIdx)
            if (merged === undefined) {
              merged = mergeParamsWithStageLightSample(
                outputParams,
                fixture,
                stageLightGrid,
                stageMapMix,
                stageCrop2d
              )
              stageLightFixtureParams.set(fixtureIdx, merged)
            }
            dmxParams = merged
          }

          let axisOverrides: MoverAxisOverrides | undefined = moverAxisOverride

          if (calibrationOverride !== undefined) {
            axisOverrides = {
              panDmx: calibrationOverride.panDmx,
              tiltDmx: calibrationOverride.tiltDmx,
              panFineEnabled: true,
              tiltFineEnabled: true,
            }
          }

          const nextValue =
            channel.type === 'axis' && calibrationOverride !== undefined
              ? channel.isFine
                ? channel.min
                : clampDmxValue(
                    channel.dir === 'x'
                      ? calibrationOverride.panDmx
                      : calibrationOverride.tiltDmx,
                    channel.min
                  )
              : mapOverrideValue !== undefined
                ? mapOverrideValue
                : getDmxValue(
                    channel,
                    dmxParams,
                    fixture,
                    state.control.master,
                    randomizerLevel,
                    timeState,
                    syntheticStrobeFrameRateHz,
                    axisOverrides,
                    placementDepth2DOnly
                  )

          if (channel.type === 'axis') {
            // Axis channels should use the exact computed DMX value.
            writeDmxChannel(channels, channelIdx, nextValue)
          } else {
            writeDmxChannel(
              channels,
              channelIdx,
              Math.max(readDmxChannel(channels, channelIdx), nextValue)
            )
          }
        }
      )
    }
    }
  }

  // Apply any overwrites last.
  const overwrites = getUniverseOverwrites(state.mixer, universeIndex)
  indexArray(DMX_NUM_CHANNELS).forEach((i) => {
    const overwrite = overwrites[i]
    if (overwrite !== undefined) {
      channels[i] = overwrite * DMX_MAX_VALUE
    }
  })

  zeroUnpatchedDmxChannels(
    universeFixtures,
    state.dmx.fixtureTypesByID,
    channels
  )

  return normalizeDmxUniverseChannels(channels)
}

function zeroAllDmxUniverseBuffers(
  state: CleanReduxState,
  dmxOutByUniverse: number[][]
): void {
  for (let index = 0; index < dmxOutByUniverse.length; index++) {
    dmxOutByUniverse[index] = Array(DMX_NUM_CHANNELS).fill(0)
  }

  const universeCount = getUniverseCount(state)
  for (let universeIndex = 1; universeIndex <= universeCount; universeIndex++) {
    const idx = universeIndex - 1
    while (dmxOutByUniverse.length <= idx) {
      dmxOutByUniverse.push(Array(DMX_NUM_CHANNELS).fill(0))
    }
    dmxOutByUniverse[idx] = Array(DMX_NUM_CHANNELS).fill(0)
  }
}

/** Keep unpatched addresses at 0 after any post-process (e.g. atmospherics) mutates universe buffers. */
export function finalizeDmxUniverses(
  state: CleanReduxState,
  dmxOutByUniverse: number[][]
): void {
  if (state.gui.blackout === true) {
    zeroAllDmxUniverseBuffers(state, dmxOutByUniverse)
    return
  }

  const universeCount = getUniverseCount(state)
  const types = state.dmx.fixtureTypesByID

  for (let universeIndex = 1; universeIndex <= universeCount; universeIndex++) {
    const idx = universeIndex - 1
    while (dmxOutByUniverse.length <= idx) {
      dmxOutByUniverse.push(Array(DMX_NUM_CHANNELS).fill(0))
    }

    const universeFixtures = state.dmx.universe.filter(
      (fixture) => (fixture.universe ?? 1) === universeIndex
    )
    const normalized = normalizeDmxUniverseChannels(
      dmxOutByUniverse[idx] ?? Array(DMX_NUM_CHANNELS).fill(0)
    )
    zeroUnpatchedDmxChannels(universeFixtures, types, normalized)
    dmxOutByUniverse[idx] = normalized
  }
}

export function calculateDmx(
  state: CleanReduxState,
  splitStates: SplitState[],
  timeState: TimeState
): number[][] {
  const universeCount = getUniverseCount(state)
  const outputByUniverse: number[][] = []

  for (let universeIndex = 1; universeIndex <= universeCount; universeIndex++) {
    outputByUniverse.push(
      calculateDmxForUniverse(state, splitStates, timeState, universeIndex)
    )
  }

  return outputByUniverse
}

