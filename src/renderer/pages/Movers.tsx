import type { ChangeEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import styled from 'styled-components'
import { useDispatch } from 'react-redux'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from '@mui/material'
import StatusBar from '../menu/StatusBar'
import Input from '../base/Input'
import NumberField from '../base/NumberField'
import Checkbox from '../base/LabelledCheckbox'
import {
  DMX_MAX_VALUE,
  DMX_MIN_VALUE,
  MOVER_MIN_PAN_RANGE_DEG,
  MOVER_MAX_PAN_RANGE_DEG,
  MOVER_MIN_TILT_RANGE_DEG,
  MOVER_MAX_TILT_RANGE_DEG,
  FixtureType,
  MoverBounds,
  MoverCalibration,
  initMoverBounds,
  initMoverCalibration,
  MoverMountOrientation,
} from '../../shared/dmxFixtures'
import { useDmxSelector, useTypedSelector } from '../redux/store'
import { useRealtimeSelector } from '../redux/realtimeStore'
import {
  setFixtureMoverBounds,
  setMoverGroupForFixture,
  setFixtureMoverMountOrientation,
  setMoverGroupKinematicsEnabled,
  setMoverSequenceForFixture,
  clearMoverSequencesForGroup,
  updateFixtureType,
} from '../redux/dmxSlice'
import {
  clearMoverCalibrationOverride,
  setMoverCalibrationOverride,
  toggleMoverAdvancedControl,
} from '../redux/guiSlice'
import {
  buildMoverPreviewRows,
  type LightingPreviewFixtureRow,
} from './lightingPreviewFixtures'
import {
  buildMoverAxisChannelPlans,
  moverAxisSnapshotsEqual,
  selectMoverAxisSnapshots,
  type LiveAxisReadout,
  type MoverAxisChannelPlan,
  type MoverAxisSnapshot,
} from './moverAxisChannels'
import { PopupTitleRow } from '../base/SectionHelpPopover'
import {
  BoundCornersHelpButton,
  DanceFloorMapHelpButton,
  MountOrientationHelpButton,
  MoverCalibrationDialogHelpButton,
  MoverGroupsHelpButton,
  PanCalibrationHelpButton,
  TiltCalibrationHelpButton,
} from './moverHelpButtons'
import {
  estimateSpotFromBounds,
} from '../../shared/moverBoundsMath'
import { orderMoverFixtures } from '../../shared/moverOrdering'

type MoverFixtureRow = LightingPreviewFixtureRow

interface CalibrationPreview {
  axis: 'pan' | 'tilt'
  dmx: number
}

interface BoundsPreview {
  panDmx: number
  tiltDmx: number
}

function useMoverAxisSnapshots(
  plans: Array<MoverAxisChannelPlan | null>
): MoverAxisSnapshot[] {
  return useRealtimeSelector<MoverAxisSnapshot[]>(
    (state) => selectMoverAxisSnapshots(plans, state.dmxOutByUniverse),
    moverAxisSnapshotsEqual
  )
}

interface MoverMapView {
  row: MoverFixtureRow
  /** 0–1 left→right (stage width / window X) */
  mapNormX: number
  /** 0–1 audience→stage-back for floor map vertical */
  mapNormDepth: number
  axis: LiveAxisReadout | null
  spotNormX: number | null
  spotNormY: number | null
  spotConfidence: number
  hasCustomBounds: boolean
  color: string
}

function clampDmxValue(value: number): number {
  if (!Number.isFinite(value)) return DMX_MIN_VALUE
  return Math.min(DMX_MAX_VALUE, Math.max(DMX_MIN_VALUE, Math.round(value)))
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function fixtureColor(fixtureId: string): string {
  let hash = 0
  for (let i = 0; i < fixtureId.length; i++) {
    hash = (hash * 31 + fixtureId.charCodeAt(i)) >>> 0
  }
  const hue = hash % 360
  return `hsl(${hue}, 78%, 64%)`
}

/**
 * Stage plan position for the floor map.
 * 2D (depth off): placement XY. Depth on: top-down XZ (same as fixture placement).
 */
function fixtureMapNorms(
  row: MoverFixtureRow,
  fxtrDepthOn: boolean
): { mapNormX: number; mapNormDepth: number } {
  const mapNormX = clamp01(row.fixture.window?.x?.pos ?? 0.5)
  const mapNormDepth = fxtrDepthOn
    ? clamp01(row.fixture.window?.z?.pos ?? 0.5)
    : clamp01(row.fixture.window?.y?.pos ?? 0.5)
  return { mapNormX, mapNormDepth }
}

export default function MoversPage() {
  const dispatch = useDispatch()

  const moverFixtures = useDmxSelector(buildMoverPreviewRows)
  const stage = useDmxSelector((state) => state.stage)
  const moverAxisChannelPlans = useMemo(
    () => buildMoverAxisChannelPlans(moverFixtures),
    [moverFixtures]
  )
  const moverAxisSnapshots = useMoverAxisSnapshots(moverAxisChannelPlans)
  const moverAdvancedControlEnabled = useTypedSelector(
    (state) => state.gui.moverAdvancedControlEnabled
  )
  const fxtrDepthOn = useTypedSelector((state) => state.gui.fxtrDepthOn === true)
  const moverGroupSettings = useDmxSelector(
    (state) => state.moverGroupSettings ?? {}
  )
  const moverSequenceByFixtureId = useDmxSelector(
    (state) => state.moverSequenceByFixtureId ?? {}
  )

  const moverGroupNames = useMemo(() => {
    const names = moverFixtures
      .map((row) => row.groupName.trim())
      .filter((name) => name.length > 0)
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b))
  }, [moverFixtures])

  const [calibrationFixtureId, setCalibrationFixtureId] = useState<string | null>(
    null
  )
  const [calibrationFixtureLabel, setCalibrationFixtureLabel] = useState('')
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardGroupName, setWizardGroupName] = useState<string>('')
  const [wizardStepIndex, setWizardStepIndex] = useState(0)
  const [wizardAimPan, setWizardAimPan] = useState(DMX_MIN_VALUE)
  const [wizardAimTilt, setWizardAimTilt] = useState(DMX_MIN_VALUE)

  const CORNER_ORDER: Array<keyof MoverBounds> = [
    'topLeft',
    'topRight',
    'bottomLeft',
    'bottomRight',
  ]
  const CORNER_LABELS: Record<keyof MoverBounds, string> = {
    topLeft: 'Top Left',
    topRight: 'Top Right',
    bottomLeft: 'Bottom Left',
    bottomRight: 'Bottom Right',
  }

  useEffect(() => {
    if (
      calibrationFixtureId !== null &&
      !moverFixtures.some((fixture) => fixture.fixtureId === calibrationFixtureId)
    ) {
      setCalibrationFixtureId(null)
      setCalibrationFixtureLabel('')
      dispatch(clearMoverCalibrationOverride())
    }
  }, [calibrationFixtureId, dispatch, moverFixtures])

  useEffect(() => {
    return () => {
      dispatch(clearMoverCalibrationOverride())
    }
  }, [dispatch])

  useEffect(() => {
    if (!moverAdvancedControlEnabled && calibrationFixtureId !== null) {
      setCalibrationFixtureId(null)
      setCalibrationFixtureLabel('')
      dispatch(clearMoverCalibrationOverride())
    }
  }, [calibrationFixtureId, dispatch, moverAdvancedControlEnabled])

  useEffect(() => {
    if (!wizardOpen) {
      return
    }
    if (!moverGroupNames.includes(wizardGroupName) && moverGroupNames.length > 0) {
      setWizardGroupName(moverGroupNames[0] ?? '')
      setWizardStepIndex(0)
    }
  }, [moverGroupNames, wizardGroupName, wizardOpen])

  const wizardFixtures = useMemo(() => {
    if (!wizardGroupName) return []
    const inGroup = moverFixtures.filter(
      (row) => row.groupName.trim() === wizardGroupName
    )
    return orderMoverFixtures(
      inGroup.map((row, index) => ({
        key: row.fixtureId,
        x: clamp01(row.fixture.window?.x?.pos ?? 0.5),
        y: clamp01(row.fixture.window?.y?.pos ?? 0.5),
        sortOrder: index,
        sequenceOverride: moverSequenceByFixtureId[row.fixtureId],
        row,
      }))
    ).map((entry) => entry.row)
  }, [moverFixtures, moverSequenceByFixtureId, wizardGroupName])

  const wizardTotalSteps = wizardFixtures.length * CORNER_ORDER.length
  const wizardFixtureIndex =
    wizardTotalSteps > 0 ? Math.floor(wizardStepIndex / CORNER_ORDER.length) : 0
  const wizardCornerIndex =
    wizardTotalSteps > 0 ? wizardStepIndex % CORNER_ORDER.length : 0
  const wizardFixture = wizardFixtures[wizardFixtureIndex] ?? null
  const wizardCorner = CORNER_ORDER[wizardCornerIndex] ?? 'topLeft'

  useEffect(() => {
    if (!wizardOpen || wizardFixture === null) {
      return
    }
    const bounds = wizardFixture.fixture.moverBounds ?? initMoverBounds()
    const corner = bounds[wizardCorner]
    const panDmx = clampDmxValue(corner.pan)
    const tiltDmx = clampDmxValue(corner.tilt)
    setWizardAimPan(panDmx)
    setWizardAimTilt(tiltDmx)
    setCalibrationOverridePreview(
      wizardFixture.fixtureId,
      panDmx,
      tiltDmx
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- preview only when step/fixture changes
  }, [wizardCorner, wizardFixture?.fixtureId, wizardOpen, wizardStepIndex])

  function setWizardAim(panDmx: number, tiltDmx: number) {
    if (wizardFixture === null) {
      return
    }
    const pan = clampDmxValue(panDmx)
    const tilt = clampDmxValue(tiltDmx)
    setWizardAimPan(pan)
    setWizardAimTilt(tilt)
    setCalibrationOverridePreview(wizardFixture.fixtureId, pan, tilt)
  }

  const calibrationFixtureRow = useMemo(() => {
    if (calibrationFixtureId === null) {
      return null
    }

    return (
      moverFixtures.find((fixture) => fixture.fixtureId === calibrationFixtureId) ??
      null
    )
  }, [calibrationFixtureId, moverFixtures])

  const calibrationFixtureType = calibrationFixtureRow?.fixtureType ?? null
  const mapMovers = useMemo<MoverMapView[]>(() => {
    return moverFixtures.map((row, index) => {
      const axis = moverAxisSnapshots[index] ?? null
      const hasCustomBounds = row.fixture.moverBounds !== undefined
      const bounds = row.fixture.moverBounds ?? initMoverBounds()
      const { mapNormX, mapNormDepth } = fixtureMapNorms(row, fxtrDepthOn)
      const color = fixtureColor(row.fixtureId)

      if (axis === null) {
        return {
          row,
          mapNormX,
          mapNormDepth,
          axis,
          spotNormX: null,
          spotNormY: null,
          spotConfidence: 0,
          hasCustomBounds,
          color,
        }
      }

      const estimate = hasCustomBounds
        ? estimateSpotFromBounds(bounds, axis.panRaw, axis.tiltRaw)
        : {
            // Without bounds, use placement on the floor plane as a soft guide
            x: mapNormX,
            y: mapNormDepth,
            confidence: 0.25,
          }
      return {
        row,
        mapNormX,
        mapNormDepth,
        axis,
        spotNormX: estimate.x,
        spotNormY: estimate.y,
        spotConfidence: estimate.confidence,
        hasCustomBounds,
        color,
      }
    })
  }, [fxtrDepthOn, moverAxisSnapshots, moverFixtures])

  const colorByFixtureId = useMemo(() => {
    const map = new Map<string, string>()
    for (const entry of mapMovers) {
      map.set(entry.row.fixtureId, entry.color)
    }
    return map
  }, [mapMovers])

  function setMoverGroup(fixtureId: string, groupName: string) {
    dispatch(
      setMoverGroupForFixture({
        fixtureId,
        groupName,
      })
    )
  }

  function setMoverMountOrientation(
    fixtureId: string,
    orientation: MoverMountOrientation
  ) {
    dispatch(
      setFixtureMoverMountOrientation({
        fixtureId,
        orientation,
      })
    )
  }

  function setCalibrationOverridePreview(
    fixtureId: string,
    panDmx: number,
    tiltDmx: number
  ) {
    dispatch(
      setMoverCalibrationOverride({
        fixtureId,
        panDmx: clampDmxValue(panDmx),
        tiltDmx: clampDmxValue(tiltDmx),
      })
    )
  }

  function updateCalibration(
    fixtureType: FixtureType,
    updater: (current: MoverCalibration) => MoverCalibration,
    preview?: CalibrationPreview
  ) {
    const current = fixtureType.moverCalibration ?? initMoverCalibration()
    const nextCalibration = updater(current)

    dispatch(
      updateFixtureType({
        ...fixtureType,
        moverCalibration: nextCalibration,
      })
    )

    if (calibrationFixtureRow?.fixtureType.id === fixtureType.id) {
      const panDmx =
        preview?.axis === 'pan' ? preview.dmx : nextCalibration.pan.home
      const tiltDmx =
        preview?.axis === 'tilt' ? preview.dmx : nextCalibration.tilt.home

      if (calibrationFixtureRow !== null) {
        setCalibrationOverridePreview(calibrationFixtureRow.fixtureId, panDmx, tiltDmx)
      }
    }
  }

  function updateMoverBounds(
    row: MoverFixtureRow,
    updater: (current: MoverBounds) => MoverBounds,
    preview?: BoundsPreview
  ) {
    const currentBounds = row.fixture.moverBounds ?? initMoverBounds()
    const nextBounds = updater(currentBounds)

    dispatch(
      setFixtureMoverBounds({
        fixtureId: row.fixtureId,
        moverBounds: nextBounds,
      })
    )

    if (preview !== undefined) {
      setCalibrationOverridePreview(row.fixtureId, preview.panDmx, preview.tiltDmx)
    }
  }

  function openCalibration(row: MoverFixtureRow) {
    const calibration = row.fixtureType.moverCalibration ?? initMoverCalibration()
    setCalibrationFixtureId(row.fixtureId)
    setCalibrationFixtureLabel(row.fixtureLabel)
    setCalibrationOverridePreview(
      row.fixtureId,
      calibration.pan.home,
      calibration.tilt.home
    )
  }

  function closeCalibration() {
    setCalibrationFixtureId(null)
    setCalibrationFixtureLabel('')
    dispatch(clearMoverCalibrationOverride())
  }

  function openFollowSpotWizard(groupName?: string) {
    const name = groupName?.trim() || moverGroupNames[0] || ''
    setWizardGroupName(name)
    setWizardStepIndex(0)
    setWizardOpen(true)
    closeCalibration()
  }

  function closeFollowSpotWizard() {
    setWizardOpen(false)
    dispatch(clearMoverCalibrationOverride())
  }

  function storeWizardCorner() {
    if (wizardFixture === null) {
      return
    }
    const fixtureId = wizardFixture.fixtureId
    const panDmx = clampDmxValue(wizardAimPan)
    const tiltDmx = clampDmxValue(wizardAimTilt)

    const currentBounds = wizardFixture.fixture.moverBounds ?? initMoverBounds()
    dispatch(
      setFixtureMoverBounds({
        fixtureId,
        moverBounds: {
          ...currentBounds,
          [wizardCorner]: { pan: panDmx, tilt: tiltDmx },
        },
      })
    )
    setCalibrationOverridePreview(fixtureId, panDmx, tiltDmx)

    if (wizardStepIndex + 1 >= wizardTotalSteps) {
      if (wizardGroupName) {
        dispatch(
          setMoverGroupKinematicsEnabled({
            groupName: wizardGroupName,
            kinematicsEnabled: true,
          })
        )
      }
      closeFollowSpotWizard()
      return
    }
    setWizardStepIndex((step) => step + 1)
  }

  const sequenceIndexByFixtureId = useMemo(() => {
    const result: Record<string, number> = {}
    for (const groupName of moverGroupNames) {
      const inGroup = moverFixtures.filter(
        (row) => row.groupName.trim() === groupName
      )
      const ordered = orderMoverFixtures(
        inGroup.map((row, index) => ({
          key: row.fixtureId,
          x: clamp01(row.fixture.window?.x?.pos ?? 0.5),
          y: clamp01(row.fixture.window?.y?.pos ?? 0.5),
          sortOrder: index,
          sequenceOverride: moverSequenceByFixtureId[row.fixtureId],
        }))
      )
      for (const entry of ordered) {
        result[entry.key] = entry.sequenceIndex + 1
      }
    }
    return result
  }, [moverFixtures, moverGroupNames, moverSequenceByFixtureId])

  const floorAspectRatio = useMemo(() => {
    const width = Math.max(2, Number(stage.widthFt))
    const depth = Math.max(2, Number(stage.depthFt))
    return width / depth
  }, [stage.depthFt, stage.widthFt])

  return (
    <Root>
      <StatusBar />
      <Content>
        <Panel>
          <PanelTitleRow>
            <PanelTitle>Movers</PanelTitle>
            <TitleSp />
            <Button
              size="small"
              variant={moverAdvancedControlEnabled ? 'contained' : 'outlined'}
              onClick={() => dispatch(toggleMoverAdvancedControl())}
              title="Show group kinematics, calibration, and floor map"
            >
              Advanced
            </Button>
            {moverAdvancedControlEnabled ? <MoverGroupsHelpButton /> : null}
          </PanelTitleRow>
          <PanelHint>
            {moverAdvancedControlEnabled
              ? 'Rename groups to split or merge. Click a row to calibrate pan/tilt and floor bounds. Enable kinematics per group for Follow Spot / Tandem. Colors match the floor map.'
              : 'Pan/tilt pads aim each mover directly. Set Upright or Hung to match how fixtures are rigged.'}
          </PanelHint>

          {moverAdvancedControlEnabled && moverGroupNames.length > 0 ? (
            <GroupSettingsBlock>
              <PanelHint>Per-group kinematics & sequence</PanelHint>
              {moverGroupNames.map((groupName) => {
                const kinematicsOn =
                  moverGroupSettings[groupName]?.kinematicsEnabled === true
                return (
                  <GroupSettingsRow key={groupName}>
                    <GroupSettingsName title={groupName}>{groupName}</GroupSettingsName>
                    <Button
                      size="small"
                      variant={kinematicsOn ? 'contained' : 'outlined'}
                      onClick={() =>
                        dispatch(
                          setMoverGroupKinematicsEnabled({
                            groupName,
                            kinematicsEnabled: !kinematicsOn,
                          })
                        )
                      }
                      title="Enable pose/corner aim with joint motion limits"
                    >
                      Kinematics
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => openFollowSpotWizard(groupName)}
                      title="Walk each fixture through floor corner calibration"
                    >
                      Spot Wizard
                    </Button>
                    <Button
                      size="small"
                      variant="text"
                      onClick={() =>
                        dispatch(clearMoverSequencesForGroup({ groupName }))
                      }
                      title="Clear manual sequence overrides for this group"
                    >
                      Reset order
                    </Button>
                  </GroupSettingsRow>
                )
              })}
            </GroupSettingsBlock>
          ) : null}

          <PanelScroll>
            {moverFixtures.length === 0 && (
              <Empty>No mover fixtures found. Add fixtures with Pan + Tilt axis channels.</Empty>
            )}

            {moverFixtures.map((row) => {
              const color = colorByFixtureId.get(row.fixtureId) ?? fixtureColor(row.fixtureId)
              return (
              <FixtureRow
                key={row.fixtureId}
                onClick={
                  moverAdvancedControlEnabled
                    ? () => openCalibration(row)
                    : undefined
                }
                $clickable={moverAdvancedControlEnabled}
                title={
                  moverAdvancedControlEnabled
                    ? 'Open calibration for this fixture'
                    : undefined
                }
              >
                <FixtureMeta>
                  <FixtureName>
                    <FixtureColorSwatch
                      style={{ background: color }}
                      title={color}
                      aria-hidden
                    />
                    {sequenceIndexByFixtureId[row.fixtureId] !== undefined ? (
                      <SequenceBadge>
                        {sequenceIndexByFixtureId[row.fixtureId]}
                      </SequenceBadge>
                    ) : null}
                    {row.fixtureLabel}
                  </FixtureName>
                  <FixtureTypeText>
                    {row.fixtureType.manufacturer || 'Custom fixture'}
                    {row.groupName.trim().length > 0
                      ? ` · ${row.groupName.trim()}`
                      : ''}
                  </FixtureTypeText>
                </FixtureMeta>

                <GroupEditor
                  onClick={(event) => event.stopPropagation()}
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  {moverAdvancedControlEnabled ? (
                    <>
                      <Input
                        value={row.groupName}
                        onChange={(newName) => setMoverGroup(row.fixtureId, newName)}
                        placeholder="Mover group"
                      />
                      <SequenceField
                        type="number"
                        title="Sequence override (lower first). Leave empty for auto layout order."
                        placeholder="Auto"
                        value={
                          moverSequenceByFixtureId[row.fixtureId] !== undefined
                            ? String(moverSequenceByFixtureId[row.fixtureId])
                            : ''
                        }
                        onChange={(event: ChangeEvent<HTMLInputElement>) => {
                          const raw = event.target.value.trim()
                          if (raw.length === 0) {
                            dispatch(
                              setMoverSequenceForFixture({
                                fixtureId: row.fixtureId,
                                sequence: null,
                              })
                            )
                            return
                          }
                          const parsed = Number(raw)
                          if (!Number.isFinite(parsed)) {
                            return
                          }
                          dispatch(
                            setMoverSequenceForFixture({
                              fixtureId: row.fixtureId,
                              sequence: Math.round(parsed),
                            })
                          )
                        }}
                      />
                    </>
                  ) : null}
                  <Button
                    size="small"
                    variant={
                      row.moverMountOrientation === 'inverted'
                        ? 'contained'
                        : 'outlined'
                    }
                    onClick={() =>
                      setMoverMountOrientation(
                        row.fixtureId,
                        row.moverMountOrientation === 'inverted'
                          ? 'upright'
                          : 'inverted'
                      )
                    }
                    title="Toggle upright vs hung/inverted mount"
                  >
                    {row.moverMountOrientation === 'inverted' ? 'Hung' : 'Upright'}
                  </Button>
                </GroupEditor>
              </FixtureRow>
              )
            })}
          </PanelScroll>
        </Panel>

        {moverAdvancedControlEnabled ? (
        <RightColumn>
          <Panel $fill>
            <PanelTitleRow>
              <PanelTitle>Dance Floor Target Map</PanelTitle>
              <DanceFloorMapHelpButton />
            </PanelTitleRow>
            <PanelHint>
              {fxtrDepthOn
                ? 'Top-down plan (X width × Z depth). Dots are fixture placement; larger glow is estimated floor aim when bounds are set.'
                : 'Stage plan (X × Y). Dots are fixture placement; larger glow is estimated floor aim when bounds are set. Turn on fixture depth in placement for a true top-down XZ view.'}
            </PanelHint>
            <FloorMapShell>
              <FloorMap
                style={{
                  aspectRatio: `${Math.max(0.2, floorAspectRatio)} / 1`,
                }}
              >
                <OrientationLabel style={{ top: '0.45rem', left: '50%' }}>
                  Stage / Back
                </OrientationLabel>
                <OrientationLabel style={{ bottom: '0.45rem', left: '50%' }}>
                  Audience / Front
                </OrientationLabel>
                <AxisHint style={{ left: '0.45rem', bottom: '1.35rem' }}>
                  {fxtrDepthOn ? '← X →' : '← X →'}
                </AxisHint>
                <AxisHint style={{ right: '0.45rem', top: '50%', transform: 'translateY(-50%) rotate(90deg)' }}>
                  {fxtrDepthOn ? 'Z depth' : 'Y'}
                </AxisHint>
                <CornerLabel style={{ left: '0.45rem', top: '0.45rem' }}>TL</CornerLabel>
                <CornerLabel style={{ right: '0.45rem', top: '0.45rem' }}>TR</CornerLabel>
                <CornerLabel style={{ left: '0.45rem', bottom: '0.45rem' }}>BL</CornerLabel>
                <CornerLabel style={{ right: '0.45rem', bottom: '0.45rem' }}>BR</CornerLabel>
                <ViewModeBadge>
                  {fxtrDepthOn ? 'Top-down XZ' : 'Plan XY'}
                </ViewModeBadge>
                {mapMovers.map((entry) => {
                  // CSS: left = X, top = flipped depth so stage-back is top
                  const fixtureX = entry.mapNormX * 100
                  const fixtureY = (1 - entry.mapNormDepth) * 100
                  const hasSpot =
                    entry.spotNormX !== null && entry.spotNormY !== null
                  const spotX = (entry.spotNormX ?? entry.mapNormX) * 100
                  const spotY =
                    (1 - (entry.spotNormY ?? entry.mapNormDepth)) * 100
                  const selected =
                    calibrationFixtureId === entry.row.fixtureId

                  return (
                    <MapLayer key={`map-${entry.row.fixtureId}`}>
                      {hasSpot && entry.hasCustomBounds ? (
                        <MapLineSvg
                          viewBox="0 0 100 100"
                          preserveAspectRatio="none"
                        >
                          <MapLineElement
                            x1={fixtureX}
                            y1={fixtureY}
                            x2={spotX}
                            y2={spotY}
                            stroke={entry.color}
                            strokeOpacity={
                              0.35 + entry.spotConfidence * 0.5
                            }
                          />
                        </MapLineSvg>
                      ) : null}
                      {hasSpot && entry.hasCustomBounds ? (
                        <SpotPoint
                          style={{
                            left: `${spotX}%`,
                            top: `${spotY}%`,
                            background: entry.color,
                            boxShadow: `0 0 10px ${entry.color}99`,
                          }}
                          title={`${entry.row.fixtureLabel} floor spot`}
                        />
                      ) : null}
                      <MoverPoint
                        type="button"
                        $selected={selected}
                        style={{
                          left: `${fixtureX}%`,
                          top: `${fixtureY}%`,
                          background: entry.color,
                          boxShadow: selected
                            ? `0 0 0 2px #fff, 0 0 12px ${entry.color}`
                            : `0 0 8px ${entry.color}aa`,
                        }}
                        title={`${entry.row.fixtureLabel} placement`}
                        onClick={() => openCalibration(entry.row)}
                      />
                    </MapLayer>
                  )
                })}
                {mapMovers.length === 0 && (
                  <FloorMapEmpty>
                    No mover fixtures found. Patch heads with pan + tilt, then
                    place them on the stage map.
                  </FloorMapEmpty>
                )}
              </FloorMap>
              <MapLegend>
                {mapMovers.map((entry) => (
                  <LegendItem
                    key={`legend-${entry.row.fixtureId}`}
                    type="button"
                    $selected={calibrationFixtureId === entry.row.fixtureId}
                    onClick={() => openCalibration(entry.row)}
                    title={`Calibrate ${entry.row.fixtureLabel}`}
                  >
                    <LegendSwatch style={{ background: entry.color }} />
                    {entry.row.fixtureLabel}
                  </LegendItem>
                ))}
              </MapLegend>
            </FloorMapShell>
          </Panel>
        </RightColumn>
        ) : null}
      </Content>

      {moverAdvancedControlEnabled ? (
      <Dialog
        open={calibrationFixtureType !== null}
        onClose={closeCalibration}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          <PopupTitleRow>
            <span>
              Mover Calibration: {calibrationFixtureType?.name ?? ''}
            </span>
            <MoverCalibrationDialogHelpButton />
          </PopupTitleRow>
        </DialogTitle>
        <DialogContent dividers>
          <DialogHint>
            Fixture: {calibrationFixtureLabel || 'Selected mover fixture'}. Focus a
            field to preview that DMX value on the selected head.
          </DialogHint>

          {calibrationFixtureRow !== null && (
            <MountRow>
              <MountLabelRow>
                <MountLabel>Mount Orientation</MountLabel>
                <MountOrientationHelpButton />
              </MountLabelRow>
              <Button
                size="small"
                variant={
                  calibrationFixtureRow.moverMountOrientation === 'inverted'
                    ? 'contained'
                    : 'outlined'
                }
                onClick={() =>
                  setMoverMountOrientation(
                    calibrationFixtureRow.fixtureId,
                    calibrationFixtureRow.moverMountOrientation === 'inverted'
                      ? 'upright'
                      : 'inverted'
                  )
                }
                title="Upright vs hung/inverted — affects tilt anchors"
              >
                {calibrationFixtureRow.moverMountOrientation === 'inverted'
                  ? 'Hung / Inverted'
                  : 'Upright'}
              </Button>
            </MountRow>
          )}

          {calibrationFixtureType !== null && (
            <CalibrationEditor
              fixtureType={calibrationFixtureType}
              isFixtureInverted={calibrationFixtureRow?.moverMountOrientation === 'inverted'}
              onUpdate={(updater, preview) =>
                updateCalibration(calibrationFixtureType, updater, preview)
              }
              onPreview={(preview) => {
                if (calibrationFixtureRow === null) {
                  return
                }

                const calibration =
                  calibrationFixtureType.moverCalibration ?? initMoverCalibration()
                const panDmx =
                  preview.axis === 'pan' ? preview.dmx : calibration.pan.home
                const tiltDmx =
                  preview.axis === 'tilt' ? preview.dmx : calibration.tilt.home

                setCalibrationOverridePreview(
                  calibrationFixtureRow.fixtureId,
                  panDmx,
                  tiltDmx
                )
              }}
            />
          )}

          {calibrationFixtureRow !== null && (
            <BoundsEditor
              bounds={calibrationFixtureRow.fixture.moverBounds ?? initMoverBounds()}
              onUpdate={(updater, preview) =>
                updateMoverBounds(calibrationFixtureRow, updater, preview)
              }
              onPreview={(preview) =>
                setCalibrationOverridePreview(
                  calibrationFixtureRow.fixtureId,
                  preview.panDmx,
                  preview.tiltDmx
                )
              }
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeCalibration} variant="outlined">
            Close
          </Button>
        </DialogActions>
      </Dialog>
      ) : null}

      <Dialog
        open={wizardOpen}
        onClose={closeFollowSpotWizard}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Follow Spot Floor Calibration</DialogTitle>
        <DialogContent dividers>
          <DialogHint>
            For each fixture and floor corner, aim with the pan/tilt controls so the
            beam hits that corner, then Store. Values are written into that
            fixture&apos;s floor bounds for kinematic Follow Spot.
          </DialogHint>
          <WizardGroupRow>
            <span>Group</span>
            <select
              value={wizardGroupName}
              onChange={(event) => {
                setWizardGroupName(event.target.value)
                setWizardStepIndex(0)
              }}
            >
              {moverGroupNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </WizardGroupRow>
          {wizardFixture === null ? (
            <DialogHint>No fixtures in this group.</DialogHint>
          ) : (
            <>
              <WizardStepText>
                Step {wizardStepIndex + 1} / {Math.max(1, wizardTotalSteps)} —{' '}
                <strong>{wizardFixture.fixtureLabel}</strong> →{' '}
                {CORNER_LABELS[wizardCorner]}
              </WizardStepText>
              <WizardAimBlock>
                <WizardAimHeader>Aim (DMX)</WizardAimHeader>
                <WizardAimRow>
                  <WizardAimLabel>Pan</WizardAimLabel>
                  <WizardAimSlider
                    type="range"
                    min={DMX_MIN_VALUE}
                    max={DMX_MAX_VALUE}
                    step={1}
                    value={wizardAimPan}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setWizardAim(Number(event.target.value), wizardAimTilt)
                    }
                    title="Pan DMX for this corner"
                  />
                  <NumberField
                    val={wizardAimPan}
                    label=" "
                    min={DMX_MIN_VALUE}
                    max={DMX_MAX_VALUE}
                    variant="outlined"
                    highlightOnFocus
                    title="Pan DMX value"
                    onChange={(value) => setWizardAim(value, wizardAimTilt)}
                  />
                </WizardAimRow>
                <WizardAimRow>
                  <WizardAimLabel>Tilt</WizardAimLabel>
                  <WizardAimSlider
                    type="range"
                    min={DMX_MIN_VALUE}
                    max={DMX_MAX_VALUE}
                    step={1}
                    value={wizardAimTilt}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setWizardAim(wizardAimPan, Number(event.target.value))
                    }
                    title="Tilt DMX for this corner"
                  />
                  <NumberField
                    val={wizardAimTilt}
                    label=" "
                    min={DMX_MIN_VALUE}
                    max={DMX_MAX_VALUE}
                    variant="outlined"
                    highlightOnFocus
                    title="Tilt DMX value"
                    onChange={(value) => setWizardAim(wizardAimPan, value)}
                  />
                </WizardAimRow>
              </WizardAimBlock>
              <DialogHint>
                Live DMX override drives this fixture while you aim. Store saves the
                current pan/tilt into the corner listed above.
              </DialogHint>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setWizardStepIndex((step) => Math.max(0, step - 1))}
            disabled={wizardStepIndex <= 0}
            variant="text"
          >
            Back
          </Button>
          <Button onClick={closeFollowSpotWizard} variant="outlined">
            Cancel
          </Button>
          <Button
            onClick={storeWizardCorner}
            variant="contained"
            disabled={wizardFixture === null}
          >
            {wizardStepIndex + 1 >= wizardTotalSteps ? 'Store & Finish' : 'Store Corner'}
          </Button>
        </DialogActions>
      </Dialog>
    </Root>
  )
}

function CalibrationEditor({
  fixtureType,
  isFixtureInverted,
  onUpdate,
  onPreview,
}: {
  fixtureType: FixtureType
  isFixtureInverted: boolean
  onUpdate: (
    updater: (current: MoverCalibration) => MoverCalibration,
    preview?: CalibrationPreview
  ) => void
  onPreview: (preview: CalibrationPreview) => void
}) {
  const calibration = fixtureType.moverCalibration ?? initMoverCalibration()
  const tiltForwardLabel = 'Tilt Forward'
  const tiltSecondaryField: 'down' | 'up' = isFixtureInverted ? 'down' : 'up'
  const tiltSecondaryLabel = isFixtureInverted ? 'Tilt Toward Floor' : 'Tilt Toward Ceiling'
  const tiltSecondaryValue = isFixtureInverted ? calibration.tilt.down : calibration.tilt.up

  function previewPan(dmx: number) {
    onPreview({
      axis: 'pan',
      dmx: clampDmxValue(dmx),
    })
  }

  function previewTilt(dmx: number) {
    onPreview({
      axis: 'tilt',
      dmx: clampDmxValue(dmx),
    })
  }

  function setPanField(field: keyof MoverCalibration['pan'], value: number | boolean) {
    const preview: CalibrationPreview | undefined =
      typeof value === 'number' && field !== 'rangeDeg'
        ? { axis: 'pan', dmx: clampDmxValue(value) }
        : undefined

    onUpdate(
      (current) => ({
        ...current,
        pan: {
          ...current.pan,
          [field]: value,
        },
      }),
      preview
    )
  }

  function setTiltField(field: keyof MoverCalibration['tilt'], value: number | boolean) {
    const preview: CalibrationPreview | undefined =
      typeof value === 'number'
        ? { axis: 'tilt', dmx: clampDmxValue(value) }
        : undefined

    onUpdate(
      (current) => ({
        ...current,
        tilt: {
          ...current.tilt,
          [field]: value,
        },
      }),
      preview
    )
  }

  return (
    <>
      <CalibrationSection>
        <SectionTitleRow>
          <SectionTitle>Pan Calibration</SectionTitle>
          <PanCalibrationHelpButton />
        </SectionTitleRow>
        <FieldGrid>
          <NumberField
            val={calibration.pan.min}
            label="Pan Min"
            min={DMX_MIN_VALUE}
            max={DMX_MAX_VALUE}
            variant="outlined"
            highlightOnFocus
            onFocus={() => previewPan(calibration.pan.min)}
            onMouseDown={() => previewPan(calibration.pan.min)}
            onChange={(value) => setPanField('min', clampDmxValue(value))}
          />
          <NumberField
            val={calibration.pan.max}
            label="Pan Max"
            min={DMX_MIN_VALUE}
            max={DMX_MAX_VALUE}
            variant="outlined"
            highlightOnFocus
            onFocus={() => previewPan(calibration.pan.max)}
            onMouseDown={() => previewPan(calibration.pan.max)}
            onChange={(value) => setPanField('max', clampDmxValue(value))}
          />
          <NumberField
            val={calibration.pan.front}
            label="Pan Front"
            min={DMX_MIN_VALUE}
            max={DMX_MAX_VALUE}
            variant="outlined"
            highlightOnFocus
            onFocus={() => previewPan(calibration.pan.front)}
            onMouseDown={() => previewPan(calibration.pan.front)}
            onChange={(value) => setPanField('front', clampDmxValue(value))}
          />
          <NumberField
            val={calibration.pan.back}
            label="Pan Back"
            min={DMX_MIN_VALUE}
            max={DMX_MAX_VALUE}
            variant="outlined"
            highlightOnFocus
            onFocus={() => previewPan(calibration.pan.back)}
            onMouseDown={() => previewPan(calibration.pan.back)}
            onChange={(value) => setPanField('back', clampDmxValue(value))}
          />
          <NumberField
            val={calibration.pan.home}
            label="Pan Home"
            min={DMX_MIN_VALUE}
            max={DMX_MAX_VALUE}
            variant="outlined"
            highlightOnFocus
            onFocus={() => previewPan(calibration.pan.home)}
            onMouseDown={() => previewPan(calibration.pan.home)}
            onChange={(value) => setPanField('home', clampDmxValue(value))}
          />
          <NumberField
            val={calibration.pan.rangeDeg}
            label="Pan Range (deg)"
            min={MOVER_MIN_PAN_RANGE_DEG}
            max={MOVER_MAX_PAN_RANGE_DEG}
            numberType="float"
            step={1}
            variant="outlined"
            onChange={(value) =>
              setPanField(
                'rangeDeg',
                Math.max(
                  MOVER_MIN_PAN_RANGE_DEG,
                  Math.min(MOVER_MAX_PAN_RANGE_DEG, value)
                )
              )
            }
          />
        </FieldGrid>
        <Checkbox
          label="Reverse Pan DMX"
          checked={calibration.pan.invert}
          onChange={(checked) => setPanField('invert', checked)}
        />
      </CalibrationSection>

      <CalibrationSection>
        <SectionTitleRow>
          <SectionTitle>Tilt Calibration</SectionTitle>
          <TiltCalibrationHelpButton />
        </SectionTitleRow>
        <DialogHint>
          Forward plus one vertical anchor — Toward Ceiling (upright) or Toward Floor
          (hung).
        </DialogHint>
        <FieldGrid>
          <NumberField
            val={calibration.tilt.min}
            label="Tilt Min"
            min={DMX_MIN_VALUE}
            max={DMX_MAX_VALUE}
            variant="outlined"
            highlightOnFocus
            onFocus={() => previewTilt(calibration.tilt.min)}
            onMouseDown={() => previewTilt(calibration.tilt.min)}
            onChange={(value) => setTiltField('min', clampDmxValue(value))}
          />
          <NumberField
            val={calibration.tilt.max}
            label="Tilt Max"
            min={DMX_MIN_VALUE}
            max={DMX_MAX_VALUE}
            variant="outlined"
            highlightOnFocus
            onFocus={() => previewTilt(calibration.tilt.max)}
            onMouseDown={() => previewTilt(calibration.tilt.max)}
            onChange={(value) => setTiltField('max', clampDmxValue(value))}
          />
          <NumberField
            val={calibration.tilt.forward}
            label={tiltForwardLabel}
            min={DMX_MIN_VALUE}
            max={DMX_MAX_VALUE}
            variant="outlined"
            highlightOnFocus
            onFocus={() => previewTilt(calibration.tilt.forward)}
            onMouseDown={() => previewTilt(calibration.tilt.forward)}
            onChange={(value) => setTiltField('forward', clampDmxValue(value))}
          />
          <NumberField
            val={tiltSecondaryValue}
            label={tiltSecondaryLabel}
            min={DMX_MIN_VALUE}
            max={DMX_MAX_VALUE}
            variant="outlined"
            highlightOnFocus
            onFocus={() => previewTilt(tiltSecondaryValue)}
            onMouseDown={() => previewTilt(tiltSecondaryValue)}
            onChange={(value) => setTiltField(tiltSecondaryField, clampDmxValue(value))}
          />
          <NumberField
            val={calibration.tilt.home}
            label="Tilt Home"
            min={DMX_MIN_VALUE}
            max={DMX_MAX_VALUE}
            variant="outlined"
            highlightOnFocus
            onFocus={() => previewTilt(calibration.tilt.home)}
            onMouseDown={() => previewTilt(calibration.tilt.home)}
            onChange={(value) => setTiltField('home', clampDmxValue(value))}
          />
          <NumberField
            val={calibration.tilt.rangeDeg}
            label="Tilt Range (deg)"
            min={MOVER_MIN_TILT_RANGE_DEG}
            max={MOVER_MAX_TILT_RANGE_DEG}
            numberType="float"
            step={1}
            variant="outlined"
            onChange={(value) =>
              setTiltField(
                'rangeDeg',
                Math.max(
                  MOVER_MIN_TILT_RANGE_DEG,
                  Math.min(MOVER_MAX_TILT_RANGE_DEG, value)
                )
              )
            }
          />
        </FieldGrid>
        <Checkbox
          label="Reverse Tilt DMX"
          checked={calibration.tilt.invert}
          onChange={(checked) => setTiltField('invert', checked)}
        />
      </CalibrationSection>
    </>
  )
}

function BoundsEditor({
  bounds,
  onUpdate,
  onPreview,
}: {
  bounds: MoverBounds
  onUpdate: (
    updater: (current: MoverBounds) => MoverBounds,
    preview?: BoundsPreview
  ) => void
  onPreview: (preview: BoundsPreview) => void
}) {
  function previewCorner(corner: keyof MoverBounds) {
    onPreview({
      panDmx: clampDmxValue(bounds[corner].pan),
      tiltDmx: clampDmxValue(bounds[corner].tilt),
    })
  }

  function setCornerField(
    corner: keyof MoverBounds,
    axis: 'pan' | 'tilt',
    value: number
  ) {
    const dmxValue = clampDmxValue(value)
    const nextCorner = {
      ...bounds[corner],
      [axis]: dmxValue,
    }

    onUpdate(
      (current) => ({
        ...current,
        [corner]: {
          ...current[corner],
          [axis]: dmxValue,
        },
      }),
      {
        panDmx: nextCorner.pan,
        tiltDmx: nextCorner.tilt,
      }
    )
  }

  return (
    <CalibrationSection>
      <SectionHeader>
        <SectionTitleRow>
          <SectionTitle>Bound Area Corners</SectionTitle>
          <BoundCornersHelpButton />
        </SectionTitleRow>
        <Button
          size="small"
          variant="outlined"
          onClick={() => onUpdate(() => initMoverBounds())}
          title="Reset corners to full pan/tilt range"
        >
          Reset Bounds
        </Button>
      </SectionHeader>

      <DialogHint>
        Corner DMX maps scene pad 0–1 to this fixture&apos;s floor rectangle.
      </DialogHint>

      <BoundsGrid>
        {([
          ['topLeft', 'Top Left'],
          ['topRight', 'Top Right'],
          ['bottomLeft', 'Bottom Left'],
          ['bottomRight', 'Bottom Right'],
        ] as const).map(([cornerKey, label]) => {
          const corner = bounds[cornerKey]

          return (
            <CornerCard key={cornerKey}>
              <CornerTitle>{label}</CornerTitle>
              <CornerFields>
                <NumberField
                  val={corner.pan}
                  label="Pan"
                  min={DMX_MIN_VALUE}
                  max={DMX_MAX_VALUE}
                  variant="outlined"
                  highlightOnFocus
                  onFocus={() => previewCorner(cornerKey)}
                  onMouseDown={() => previewCorner(cornerKey)}
                  onChange={(value) => setCornerField(cornerKey, 'pan', value)}
                />
                <NumberField
                  val={corner.tilt}
                  label="Tilt"
                  min={DMX_MIN_VALUE}
                  max={DMX_MAX_VALUE}
                  variant="outlined"
                  highlightOnFocus
                  onFocus={() => previewCorner(cornerKey)}
                  onMouseDown={() => previewCorner(cornerKey)}
                  onChange={(value) => setCornerField(cornerKey, 'tilt', value)}
                />
              </CornerFields>
            </CornerCard>
          )
        })}
      </BoundsGrid>
    </CalibrationSection>
  )
}
const MountRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.8rem;
`

const MountLabelRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.2rem;
`

const MountLabel = styled.div`
  font-size: 0.85rem;
  color: ${(props) => props.theme.colors.text.secondary};
`

const Root = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
`

const Content = styled.div`
  display: grid;
  grid-template-columns: minmax(20rem, 30rem) minmax(0, 1fr);
  gap: 0.9rem;
  padding: 1rem;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;

  @media (max-width: 1100px) {
    grid-template-columns: minmax(0, 1fr);
    overflow: auto;
  }
`

const Panel = styled.div<{ $fill?: boolean }>`
  background: ${(props) => props.theme.colors.bg.darker};
  border: 1px solid ${(props) => props.theme.colors.divider};
  border-radius: 0.4rem;
  padding: 0.9rem;
  min-height: 0;
  display: flex;
  flex-direction: column;
  ${(props) =>
    props.$fill
      ? `
    flex: 1 1 auto;
    height: 100%;
  `
      : ''}
`

const PanelScroll = styled.div`
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: #7a7a7a99 #0000;

  &::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }

  &::-webkit-scrollbar-track {
    background: #0000;
  }

  &::-webkit-scrollbar-thumb {
    background: #7a7a7a99;
    border-radius: 999px;
  }
`

const PanelTitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-bottom: 0.4rem;
`

const TitleSp = styled.div`
  flex: 1 1 auto;
  min-width: 0.35rem;
`

const PanelTitle = styled.div`
  font-size: ${(props) => props.theme.font.size.h1};
`

const PanelHint = styled.div`
  font-size: 0.8rem;
  color: ${(props) => props.theme.colors.text.secondary};
  margin-bottom: 0.8rem;
`

const Empty = styled.div`
  font-size: 0.9rem;
  color: ${(props) => props.theme.colors.text.secondary};
`

const FixtureRow = styled.div<{ $clickable?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.6rem;
  border-top: 1px solid ${(props) => props.theme.colors.divider};
  gap: 0.7rem;
  cursor: ${(props) => (props.$clickable ? 'pointer' : 'default')};

  &:hover {
    background: ${(props) =>
      props.$clickable ? props.theme.colors.bg.lighter : 'transparent'};
  }
`

const FixtureMeta = styled.div`
  min-width: 10rem;
`

const FixtureName = styled.div`
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-weight: 600;
`

const FixtureColorSwatch = styled.span`
  flex: 0 0 auto;
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 999px;
  border: 1px solid #ffffffaa;
  box-shadow: 0 0 6px #0008;
`

const SequenceBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0 0.3rem;
  border-radius: 999px;
  background: #1a3f7a;
  color: #eaf2ff;
  font-size: 0.7rem;
  font-weight: 700;
`

const SequenceField = styled.input`
  width: 4rem;
  background: #101317;
  border: 1px solid #ffffff33;
  color: inherit;
  border-radius: 0.25rem;
  padding: 0.2rem 0.35rem;
  font-size: 0.75rem;
`

const GroupSettingsBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 0.75rem;
  padding-bottom: 0.65rem;
  border-bottom: 1px solid ${(props) => props.theme.colors.divider};
`

const GroupSettingsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
`

const GroupSettingsName = styled.div`
  flex: 1 1 6rem;
  min-width: 0;
  font-size: 0.8rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const WizardGroupRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.75rem 0;

  select {
    flex: 1;
    background: #101317;
    color: inherit;
    border: 1px solid #ffffff33;
    border-radius: 0.25rem;
    padding: 0.35rem;
  }
`

const WizardStepText = styled.div`
  font-size: 0.95rem;
  margin: 0.5rem 0;
`

const WizardAimBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  margin: 0.75rem 0 0.35rem;
  padding: 0.75rem;
  border: 1px solid ${(props) => props.theme.colors.divider};
  border-radius: 0.35rem;
  background: ${(props) => props.theme.colors.bg.primary};
`

const WizardAimHeader = styled.div`
  font-size: 0.82rem;
  font-weight: 600;
  color: ${(props) => props.theme.colors.text.secondary};
`

const WizardAimRow = styled.div`
  display: grid;
  grid-template-columns: 2.5rem minmax(0, 1fr) 5.5rem;
  gap: 0.65rem;
  align-items: center;
`

const WizardAimLabel = styled.div`
  font-size: 0.8rem;
  color: ${(props) => props.theme.colors.text.secondary};
`

const WizardAimSlider = styled.input`
  width: 100%;
  min-width: 0;
  margin: 0;
  accent-color: #7ec8ff;
  cursor: pointer;
`

const FixtureTypeText = styled.div`
  font-size: 0.75rem;
  color: ${(props) => props.theme.colors.text.secondary};
`

const GroupEditor = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: min(22rem, 100%);
`

const RightColumn = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
`

const FloorMapShell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  flex: 1 1 auto;
  min-height: 0;
`

const FloorMap = styled.div`
  position: relative;
  border: 1px solid ${(props) => props.theme.colors.divider};
  border-radius: 0.4rem;
  background:
    linear-gradient(to right, #ffffff14 1px, transparent 1px) 0 0 / 8% 8%,
    linear-gradient(to bottom, #ffffff14 1px, transparent 1px) 0 0 / 8% 8%,
    #00000033;
  width: 100%;
  max-width: min(100%, 56rem);
  margin: 0 auto;
  flex: 1 1 auto;
  min-height: min(70vh, 36rem);
  max-height: 100%;
  overflow: hidden;
  align-self: stretch;
`

const OrientationLabel = styled.div`
  position: absolute;
  transform: translateX(-50%);
  font-size: 0.7rem;
  letter-spacing: 0.03em;
  color: ${(props) => props.theme.colors.text.secondary};
  text-transform: uppercase;
  pointer-events: none;
  opacity: 0.9;
  z-index: 2;
`

const AxisHint = styled.div`
  position: absolute;
  font-size: 0.62rem;
  letter-spacing: 0.04em;
  color: ${(props) => props.theme.colors.text.secondary};
  pointer-events: none;
  opacity: 0.7;
  z-index: 2;
  text-transform: uppercase;
`

const ViewModeBadge = styled.div`
  position: absolute;
  top: 0.4rem;
  right: 0.45rem;
  z-index: 2;
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: #dce7ff;
  background: #101825cc;
  border: 1px solid #ffffff33;
  border-radius: 999px;
  padding: 0.18rem 0.55rem;
  pointer-events: none;
`

const CornerLabel = styled.div`
  position: absolute;
  font-size: 0.68rem;
  color: ${(props) => props.theme.colors.text.secondary};
  pointer-events: none;
  opacity: 0.75;
  z-index: 2;
`

const FloorMapEmpty = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 0.8rem;
  box-sizing: border-box;
  color: ${(props) => props.theme.colors.text.secondary};
  font-size: 0.8rem;
  z-index: 1;
`

const MapLayer = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 3;
`

const MapLineSvg = styled.svg`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
`

const MapLineElement = styled.line`
  stroke-width: 0.5;
  stroke-linecap: round;
`

const MoverPoint = styled.button<{ $selected?: boolean }>`
  position: absolute;
  width: ${(props) => (props.$selected ? '0.95rem' : '0.78rem')};
  height: ${(props) => (props.$selected ? '0.95rem' : '0.78rem')};
  border-radius: 999px;
  border: 1px solid #ffffffdd;
  transform: translate(-50%, -50%);
  padding: 0;
  margin: 0;
  pointer-events: auto;
  cursor: pointer;
  z-index: 4;
`

const SpotPoint = styled.div`
  position: absolute;
  width: 1.05rem;
  height: 1.05rem;
  border-radius: 999px;
  border: 2px solid #ffffffaa;
  transform: translate(-50%, -50%);
  opacity: 0.85;
  pointer-events: none;
  z-index: 3;
`

const MapLegend = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  font-size: 0.74rem;
  color: ${(props) => props.theme.colors.text.secondary};
  max-height: 7rem;
  overflow-y: auto;
`

const LegendItem = styled.button<{ $selected?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border: 1px solid
    ${(props) =>
      props.$selected ? '#ffffff88' : props.theme.colors.divider};
  background: ${(props) =>
    props.$selected ? props.theme.colors.bg.lighter : 'transparent'};
  color: inherit;
  border-radius: 999px;
  padding: 0.18rem 0.55rem;
  cursor: pointer;
  font: inherit;
`

const LegendSwatch = styled.div`
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 999px;
  border: 1px solid #ffffffcc;
`

const CalibrationSection = styled.div`
  margin-bottom: 1rem;
`

const SectionTitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.2rem;
  margin-bottom: 0.5rem;
`

const SectionTitle = styled.div`
  font-size: 0.9rem;
`

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
`

const BoundsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7rem;

  @media (max-width: 1000px) {
    grid-template-columns: 1fr;
  }
`

const CornerCard = styled.div`
  border: 1px solid ${(props) => props.theme.colors.divider};
  border-radius: 0.35rem;
  padding: 0.5rem;
`

const CornerTitle = styled.div`
  font-size: 0.8rem;
  margin-bottom: 0.35rem;
  color: ${(props) => props.theme.colors.text.secondary};
`

const CornerFields = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.6rem;
`


const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.7rem;
  margin-bottom: 0.5rem;

  @media (max-width: 1200px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`

const DialogHint = styled.div`
  font-size: 0.82rem;
  color: ${(props) => props.theme.colors.text.secondary};
  margin-bottom: 0.8rem;
`













































