import { useMemo } from 'react'
import { isMoverFixtureType, type FixtureType } from '../../shared/dmxFixtures'
import {
  parseMoverModeFromParams,
  resolveMoverPadTargetsFromParams,
  type MoverPadPlacementEntry,
  type MoverPadTarget,
} from '../../shared/moverPadTargets'
import { dmxFixtureMatchesSceneGroups } from '../../shared/sceneGroups'
import { defaultOutputParams, type Params } from '../../shared/params'
import { useActiveLightScene, useDmxSelector, useTypedSelector } from '../redux/store'
import { useOutputParams } from '../redux/realtimeStore'

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function fixtureMatchesSplitGroups(
  fixtureGroups: string[],
  isMoverFixture: boolean,
  splitGroups: Record<string, boolean | undefined>,
  fixtureTypeName?: string | null
): boolean {
  return dmxFixtureMatchesSceneGroups(splitGroups, {
    fixtureGroups,
    fixtureTypeName,
    isMover: isMoverFixture,
  })
}

function buildMoverPlacementsForSplit(
  splitGroups: Record<string, boolean | undefined>,
  moverGroupByFixtureId: Record<string, string>,
  sequenceByFixtureId: Record<string, number>,
  universe: Array<{
    id?: string
    type: string
    groups: string[]
    window?: { x?: { pos?: number }; y?: { pos?: number } }
  }>,
  fixtureTypesByID: Record<string, FixtureType>
): Record<string, MoverPadPlacementEntry[]> {
  const fixturesByGroup: Record<string, MoverPadPlacementEntry[]> = {}

  universe.forEach((fixture, fixtureIndex) => {
    const fixtureType = fixtureTypesByID[fixture.type]
    if (fixtureType === undefined || !isMoverFixtureType(fixtureType)) {
      return
    }

    if (
      !fixtureMatchesSplitGroups(
        fixture.groups,
        true,
        splitGroups,
        fixtureType.name
      )
    ) {
      return
    }

    const fixtureId =
      typeof fixture.id === 'string' && fixture.id.trim().length > 0
        ? fixture.id.trim()
        : `legacy-${fixtureIndex}-${fixture.type}`

    const groupName =
      moverGroupByFixtureId[fixtureId]?.trim() ||
      fixtureType.name.trim() ||
      'Fixture Group'

    const sequenceOverride = sequenceByFixtureId[fixtureId]
    const placement: MoverPadPlacementEntry = {
      key: fixtureId,
      x: clamp01(fixture.window?.x?.pos ?? 0.5),
      y: clamp01(fixture.window?.y?.pos ?? 0.5),
      sortOrder: fixtureIndex,
      sequenceOverride:
        sequenceOverride !== undefined && Number.isFinite(sequenceOverride)
          ? Number(sequenceOverride)
          : undefined,
    }

    const groupItems = fixturesByGroup[groupName] ?? []
    groupItems.push(placement)
    fixturesByGroup[groupName] = groupItems
  })

  return fixturesByGroup
}

export function useMoverPadFixtureTargets(
  splitIndex: number,
  params: Params
): MoverPadTarget[] | null {
  const moverAdvancedControlEnabled = useTypedSelector(
    (state) => state.gui.moverAdvancedControlEnabled
  )
  const splitGroups = useActiveLightScene(
    (scene) => scene.splitScenes[splitIndex]?.groups ?? {}
  )
  const dmx = useDmxSelector((state) => state)

  return useMemo(() => {
    if (!moverAdvancedControlEnabled) {
      return null
    }

    const moverMode = parseMoverModeFromParams(params)
    const kinematicsByGroup: Record<string, boolean> = {}
    for (const [groupName, settings] of Object.entries(
      dmx.moverGroupSettings ?? {}
    )) {
      kinematicsByGroup[groupName] = settings?.kinematicsEnabled === true
    }
    const anyKinematics = Object.values(kinematicsByGroup).some(Boolean)

    // Ghost cursors only when multi-target modes are active for kinematics groups
    // or when mirror is active for raw groups.
    if (moverMode === 0 && !anyKinematics) {
      return null
    }
    if (moverMode === 0 && anyKinematics) {
      // Follow spot: all same target; no multi-cursor needed
      return null
    }

    const fixturesByGroup = buildMoverPlacementsForSplit(
      splitGroups,
      dmx.moverGroupByFixtureId,
      dmx.moverSequenceByFixtureId ?? {},
      dmx.universe,
      dmx.fixtureTypesByID
    )

    const targets = resolveMoverPadTargetsFromParams(fixturesByGroup, params, {
      kinematicsByGroup,
    })
    return targets.length > 0 ? targets : null
  }, [
    dmx.fixtureTypesByID,
    dmx.moverGroupByFixtureId,
    dmx.moverGroupSettings,
    dmx.moverSequenceByFixtureId,
    dmx.universe,
    moverAdvancedControlEnabled,
    params,
    splitGroups,
  ])
}

export function useMergedSplitAxisParams(splitIndex: number): Params {
  const baseParams = useActiveLightScene(
    (scene) => scene.splitScenes[splitIndex]?.baseParams ?? defaultOutputParams()
  )
  const outputParams = useOutputParams(splitIndex)

  return useMemo(
    () => ({
      ...baseParams,
      ...outputParams,
    }),
    [baseParams, outputParams]
  )
}
