import { clampNormalized } from '../math/util'
import { getParam, Params } from './params'
import { orderMoverFixtures, type MoverOrderEntry } from './moverOrdering'

export const MOVER_TANDEM_MAX_SPREAD = 0.65

export const MOVER_MODE_FOLLOW_SPOT = 0
export const MOVER_MODE_TANDEM = 1
export const MOVER_MODE_MIRROR = 2

export type MoverPadPlacementEntry = MoverOrderEntry

export type MoverPadTarget = {
  key: string
  x: number
  y: number
  mirrored: boolean
  sequenceIndex: number
}

export function mirrorAroundCenter(value: number, center: number): number {
  return center * 2 - value
}

export function parseMoverModeFromParams(params: Params): number {
  const raw = Number(params.moverMode ?? 0)
  if (!Number.isFinite(raw)) return 0
  return Math.max(0, Math.min(2, Math.round(raw)))
}

/**
 * Resolve pad targets for a group.
 * Kinematics on: follow-spot / tandem / mirror.
 * Kinematics off: shared pad ± mirror only (tandem ignored).
 * Phase is applied later in joint degrees (see applySequentialJointPhaseDmx).
 */
export function resolveMoverPadTargetsForGroup(
  fixtures: ReadonlyArray<MoverPadPlacementEntry>,
  options: {
    baseX: number
    baseY: number
    moverMode: number
    spread: number
    mirrorLeftRight: boolean
    mirrorTopBottom: boolean
    hasPanTarget?: boolean
    hasTiltTarget?: boolean
    kinematicsEnabled?: boolean
  }
): MoverPadTarget[] {
  if (fixtures.length === 0) {
    return []
  }

  const hasPanTarget = options.hasPanTarget !== false
  const hasTiltTarget = options.hasTiltTarget !== false
  const baseX = clampNormalized(options.baseX)
  const baseY = clampNormalized(options.baseY)
  const kinematicsEnabled = options.kinematicsEnabled === true
  const requestedMode = Math.max(0, Math.min(2, Math.round(options.moverMode)))
  // Without kinematics: only mirror is a non-raw mode.
  const moverMode = kinematicsEnabled
    ? requestedMode
    : requestedMode === MOVER_MODE_MIRROR
      ? MOVER_MODE_MIRROR
      : MOVER_MODE_FOLLOW_SPOT
  const spread = kinematicsEnabled
    ? Math.min(MOVER_TANDEM_MAX_SPREAD, clampNormalized(options.spread))
    : 0
  const mirrorLeftRight = options.mirrorLeftRight
  const mirrorTopBottom = options.mirrorTopBottom

  const orderedFixtures = orderMoverFixtures(fixtures)

  let minX = 1
  let maxX = 0
  let minY = 1
  let maxY = 0

  for (const entry of orderedFixtures) {
    minX = Math.min(minX, entry.x)
    maxX = Math.max(maxX, entry.x)
    minY = Math.min(minY, entry.y)
    maxY = Math.max(maxY, entry.y)
  }

  const spanX = maxX - minX
  const spanY = maxY - minY
  const hasHorizontalSpread = spanX > 0.0001
  const hasVerticalSpread = spanY > 0.0001
  const sideEpsilon = 0.0001
  const centerX = (minX + maxX) * 0.5
  const centerY = (minY + maxY) * 0.5

  const isRightFlags = orderedFixtures.map((entry, entryIndex) =>
    hasHorizontalSpread
      ? entry.x > centerX + sideEpsilon
      : entryIndex >= Math.ceil(orderedFixtures.length / 2)
  )
  const isBottomFlags = orderedFixtures.map((entry, entryIndex) =>
    hasVerticalSpread
      ? entry.y < centerY - sideEpsilon
      : entryIndex >= Math.ceil(orderedFixtures.length / 2)
  )

  const n = orderedFixtures.length
  const denom = Math.max(1, n - 1)

  return orderedFixtures.map((entry, entryIndex) => {
    const relX = hasHorizontalSpread
      ? clampNormalized((entry.x - minX) / spanX)
      : n <= 1
        ? 0.5
        : entryIndex / denom

    const isRight = isRightFlags[entryIndex] === true
    const isBottom = isBottomFlags[entryIndex] === true
    const sequenceIndex = entry.sequenceIndex

    let fixtureX = hasPanTarget ? baseX : 0.5
    let fixtureY = hasTiltTarget ? baseY : 0.5
    let mirrored = false

    if (kinematicsEnabled && moverMode === MOVER_MODE_TANDEM && hasPanTarget) {
      fixtureX = fixtureX + (relX - 0.5) * spread
    }

    const applyMirrorX =
      hasPanTarget && moverMode === MOVER_MODE_MIRROR && mirrorLeftRight
    const applyMirrorY =
      hasTiltTarget && moverMode === MOVER_MODE_MIRROR && mirrorTopBottom

    if (applyMirrorX && isRight) {
      fixtureX = mirrorAroundCenter(fixtureX, 0.5)
      mirrored = true
    }
    if (applyMirrorY && isBottom) {
      fixtureY = mirrorAroundCenter(fixtureY, 0.5)
      mirrored = true
    }

    return {
      key: entry.key,
      x: clampNormalized(hasPanTarget ? fixtureX : baseX),
      y: clampNormalized(hasTiltTarget ? fixtureY : baseY),
      mirrored,
      sequenceIndex,
    }
  })
}

export function resolveMoverPadTargetsFromParams(
  fixturesByGroup: Readonly<
    Record<string, ReadonlyArray<MoverPadPlacementEntry>>
  >,
  params: Params,
  options?: {
    kinematicsByGroup?: Readonly<Record<string, boolean>>
    defaultKinematics?: boolean
  }
): MoverPadTarget[] {
  const baseX = clampNormalized(Number(params.xAxis ?? 0.5))
  const baseY = clampNormalized(Number(params.yAxis ?? 0.5))
  const moverMode = parseMoverModeFromParams(params)
  const spread = clampNormalized(getParam(params, 'moverSpread'))
  const mirrorLeftRight = getParam(params, 'moverMirrorX') > 0.5
  const mirrorTopBottom = getParam(params, 'moverMirrorY') > 0.5
  const defaultKinematics = options?.defaultKinematics === true

  const targets: MoverPadTarget[] = []
  for (const [groupName, fixtures] of Object.entries(fixturesByGroup)) {
    const kinematicsEnabled =
      options?.kinematicsByGroup?.[groupName] ?? defaultKinematics
    targets.push(
      ...resolveMoverPadTargetsForGroup(fixtures, {
        baseX,
        baseY,
        moverMode,
        spread,
        mirrorLeftRight,
        mirrorTopBottom,
        kinematicsEnabled,
      })
    )
  }
  return targets
}
