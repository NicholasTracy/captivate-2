import { useEffect, useMemo } from 'react'
import styled from 'styled-components'
import { useDispatch } from 'react-redux'
import useDragMapped from '../hooks/useDragMapped'
import { setBaseParams } from '../redux/controlSlice'
import XYAxisCursor from './XYAxisCursor'
import Select from '../base/Select'
import { useBaseParam, useDmxSelector, useTypedSelector, useActiveLightScene } from 'renderer/redux/store'
import { isMoverFixtureType } from '../../shared/dmxFixtures'
import MidiOverlay_xy from '../base/MidiOverlay_xy'
import { makeSetBaseParamAction } from '../redux/deviceState'
import {
  MoverPatternHelpButton,
} from '../pages/moverHelpButtons'
import {
  MOVER_MODE_FOLLOW_SPOT,
  MOVER_MODE_MIRROR,
  MOVER_MODE_TANDEM,
  MOVER_TANDEM_MAX_SPREAD,
} from '../../shared/moverPadTargets'
import { baseMoverGroupName } from '../../shared/moverOrdering'
import { dmxFixtureMatchesSceneGroups } from '../../shared/sceneGroups'

interface Props {
  splitIndex: number
}

type MoverModeOption = 'followSpot' | 'tandem' | 'mirror'

const XY_CENTER_DETENT_RADIUS = 0.04

function applyCenterDetent(value: number): number {
  return Math.abs(value - 0.5) <= XY_CENTER_DETENT_RADIUS ? 0.5 : value
}

function normalizeMoverMode(value: number): number {
  const rounded = Math.round(value)
  if (rounded < MOVER_MODE_FOLLOW_SPOT || rounded > MOVER_MODE_MIRROR) {
    return MOVER_MODE_FOLLOW_SPOT
  }
  return rounded
}

function moverModeToOption(mode: number): MoverModeOption {
  if (mode === MOVER_MODE_TANDEM) return 'tandem'
  if (mode === MOVER_MODE_MIRROR) return 'mirror'
  return 'followSpot'
}

function moverModeFromOption(option: MoverModeOption): number {
  if (option === 'tandem') return MOVER_MODE_TANDEM
  if (option === 'mirror') return MOVER_MODE_MIRROR
  return MOVER_MODE_FOLLOW_SPOT
}

function moverModeOptionLabel(option: MoverModeOption, kinematicsOn: boolean) {
  if (option === 'tandem') return 'Tandem'
  if (option === 'mirror') return 'Mirror'
  return kinematicsOn ? 'Follow Spot' : 'Follow'
}

export default function XYAxispad({ splitIndex }: Props) {
  const dispatch = useDispatch()
  const moverAdvancedControlEnabled = useTypedSelector(
    (state) => state.gui.moverAdvancedControlEnabled
  )
  const hasAnyMover = useDmxSelector((state) => {
    return state.universe.some((fixture) => {
      const fixtureType = state.fixtureTypesByID[fixture.type]
      return fixtureType !== undefined && isMoverFixtureType(fixtureType)
    })
  })
  const splitGroups = useActiveLightScene(
    (scene) => scene.splitScenes[splitIndex]?.groups ?? {}
  )
  // Gate modes by this split's mover groups — not global any-group kinematics.
  const kinematicsUiEnabled = useDmxSelector((state) => {
    const settings = state.moverGroupSettings ?? {}
    const moverGroupById = state.moverGroupByFixtureId ?? {}
    return state.universe.some((fixture) => {
      const fixtureType = state.fixtureTypesByID[fixture.type]
      const isMover =
        fixtureType !== undefined && isMoverFixtureType(fixtureType)
      if (!isMover) return false
      const fixtureGroups = fixture.groups ?? []
      const inSplit = dmxFixtureMatchesSceneGroups(splitGroups, {
        fixtureGroups: fixtureGroups,
        fixtureTypeName: fixtureType?.name,
        isMover: true,
      })
      if (!inSplit) return false
      const fixtureId =
        typeof fixture.id === 'string' ? fixture.id.trim() : ''
      const groupName =
        (fixtureId.length > 0 ? moverGroupById[fixtureId]?.trim() : '') ||
        fixtureType?.name?.trim() ||
        ''
      if (groupName.length === 0) {
        return false
      }
      const base = baseMoverGroupName(groupName)
      return (
        settings[groupName]?.kinematicsEnabled === true ||
        settings[base]?.kinematicsEnabled === true
      )
    })
  })

  const modeOptions = useMemo((): MoverModeOption[] => {
    if (kinematicsUiEnabled) {
      return ['followSpot', 'tandem', 'mirror']
    }
    return ['mirror']
  }, [kinematicsUiEnabled])

  const [dragContainer, onPointerDown] = useDragMapped(({ x, y }) => {
    dispatch(
      setBaseParams({
        splitIndex,
        params: {
          xAxis: applyCenterDetent(x),
          yAxis: applyCenterDetent(y),
        },
      })
    )
  })

  const xAxis = useBaseParam('xAxis', splitIndex)
  const yAxis = useBaseParam('yAxis', splitIndex)
  const moverSpread = useBaseParam('moverSpread', splitIndex)
  const moverMirrorX = useBaseParam('moverMirrorX', splitIndex)
  const moverMirrorY = useBaseParam('moverMirrorY', splitIndex)
  const moverModeRaw = useBaseParam('moverMode', splitIndex)

  useEffect(() => {
    if (xAxis === undefined || yAxis === undefined) {
      return
    }

    const nextParams: { [key: string]: number } = {}
    if (moverSpread === undefined) nextParams.moverSpread = 0
    if (moverMirrorX === undefined) nextParams.moverMirrorX = 0
    if (moverMirrorY === undefined) nextParams.moverMirrorY = 0
    if (moverModeRaw === undefined) {
      nextParams.moverMode = kinematicsUiEnabled
        ? MOVER_MODE_FOLLOW_SPOT
        : MOVER_MODE_MIRROR
    }

    if (Object.keys(nextParams).length > 0) {
      dispatch(
        setBaseParams({
          splitIndex,
          params: nextParams,
        })
      )
    }
  }, [
    dispatch,
    kinematicsUiEnabled,
    moverMirrorX,
    moverMirrorY,
    moverModeRaw,
    moverSpread,
    splitIndex,
    xAxis,
    yAxis,
  ])

  // Coerce non-mirror modes to shared raw when kinematics off.
  useEffect(() => {
    if (!moverAdvancedControlEnabled || moverModeRaw === undefined) {
      return
    }
    if (kinematicsUiEnabled) {
      return
    }
    const mode = normalizeMoverMode(moverModeRaw)
    if (mode !== MOVER_MODE_MIRROR && mode !== MOVER_MODE_FOLLOW_SPOT) {
      dispatch(
        setBaseParams({
          splitIndex,
          params: { moverMode: MOVER_MODE_FOLLOW_SPOT },
        })
      )
    }
  }, [
    dispatch,
    kinematicsUiEnabled,
    moverAdvancedControlEnabled,
    moverModeRaw,
    splitIndex,
  ])

  if (
    xAxis === undefined ||
    yAxis === undefined ||
    moverSpread === undefined ||
    moverMirrorX === undefined ||
    moverMirrorY === undefined ||
    moverModeRaw === undefined
  ) {
    return null
  }

  const moverMode = normalizeMoverMode(moverModeRaw)
  const mirrorXEnabled = moverMirrorX > 0.5
  const mirrorYEnabled = moverMirrorY > 0.5
  const displayMode = kinematicsUiEnabled
    ? moverMode
    : moverMode === MOVER_MODE_MIRROR
      ? MOVER_MODE_MIRROR
      : MOVER_MODE_FOLLOW_SPOT

  return (
    <Root>
      <MidiOverlay_xy
        splitIndex={splitIndex}
        labels={['Pan', 'Tilt']}
        style={{ width: '200px', minWidth: '200px', height: '180px', flexShrink: 0 }}
        actions={[
          makeSetBaseParamAction(splitIndex, 'xAxis'),
          makeSetBaseParamAction(splitIndex, 'yAxis'),
        ]}
      >
        <PadSurface ref={dragContainer} onPointerDown={onPointerDown}>
          <CenterMarker aria-hidden />
          <XYAxisCursor splitIndex={splitIndex} />
        </PadSurface>
      </MidiOverlay_xy>

      <MoverControls
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {moverAdvancedControlEnabled ? (
          <>
        <ControlLabelRow>
          <ControlLabel>Mover Pattern</ControlLabel>
          <MoverPatternHelpButton />
        </ControlLabelRow>
        {kinematicsUiEnabled ? (
          <SelectRow>
            <Select
              label="Mover Pattern"
              val={moverModeToOption(moverMode)}
              items={modeOptions}
              labelForItem={(option) =>
                moverModeOptionLabel(option, kinematicsUiEnabled)
              }
              onChange={(newMode) => {
                const nextMode = moverModeFromOption(newMode)
                const nextParams: { [key: string]: number } = {
                  moverMode: nextMode,
                }
                if (
                  nextMode === MOVER_MODE_MIRROR &&
                  !mirrorXEnabled &&
                  !mirrorYEnabled
                ) {
                  nextParams.moverMirrorX = 1
                  nextParams.moverMirrorY = 0
                }
                dispatch(
                  setBaseParams({
                    splitIndex,
                    params: nextParams,
                  })
                )
              }}
              style={{ width: '100%' }}
            />
          </SelectRow>
        ) : (
          <SelectRow>
            <MirrorOnlyHint>
              Raw pad → DMX. Enable kinematics on a mover group for Follow Spot /
              Tandem.
            </MirrorOnlyHint>
            <ToggleRow>
              <RadioButton
                type="button"
                $active={moverMode === MOVER_MODE_MIRROR}
                title="Enable mirror mode"
                onClick={() => {
                  const nextOn = moverMode !== MOVER_MODE_MIRROR
                  dispatch(
                    setBaseParams({
                      splitIndex,
                      params: {
                        moverMode: nextOn
                          ? MOVER_MODE_MIRROR
                          : MOVER_MODE_FOLLOW_SPOT,
                        ...(nextOn && !mirrorXEnabled && !mirrorYEnabled
                          ? { moverMirrorX: 1, moverMirrorY: 0 }
                          : {}),
                      },
                    })
                  )
                }}
              >
                <RadioDot $active={moverMode === MOVER_MODE_MIRROR} aria-hidden />
                <span>Mirror</span>
              </RadioButton>
            </ToggleRow>
          </SelectRow>
        )}

        {!hasAnyMover && (
          <DisabledHint>
            Add movers to enable pan/tilt patterns.
          </DisabledHint>
        )}

        {kinematicsUiEnabled && displayMode === MOVER_MODE_TANDEM && (
          <>
            <ControlLabel>Tandem Distance</ControlLabel>
            <SpreadInput
              type="range"
              title="Spacing between movers in tandem mode"
              min={0}
              max={MOVER_TANDEM_MAX_SPREAD}
              step={0.01}
              value={moverSpread}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onChange={(event) => {
                dispatch(
                  setBaseParams({
                    splitIndex,
                    params: {
                      moverSpread: Math.max(
                        0,
                        Math.min(
                          MOVER_TANDEM_MAX_SPREAD,
                          Number(event.target.value) || 0
                        )
                      ),
                    },
                  })
                )
              }}
            />
          </>
        )}

        {(displayMode === MOVER_MODE_MIRROR ||
          (!kinematicsUiEnabled && moverMode === MOVER_MODE_MIRROR)) && (
          <>
            <ControlLabel>Mirror Axis</ControlLabel>
            <RadioGroup>
              <RadioButton
                type="button"
                $active={mirrorXEnabled}
                title="Mirror on left/right axis"
                onClick={() => {
                  const nextX = mirrorXEnabled ? 0 : 1
                  const safeNextX = nextX === 0 && !mirrorYEnabled ? 1 : nextX
                  dispatch(
                    setBaseParams({
                      splitIndex,
                      params: {
                        moverMirrorX: safeNextX,
                      },
                    })
                  )
                }}
              >
                <RadioDot $active={mirrorXEnabled} aria-hidden />
                <span>L/R</span>
              </RadioButton>
              <RadioButton
                type="button"
                $active={mirrorYEnabled}
                title="Mirror on top/bottom axis"
                onClick={() => {
                  const nextY = mirrorYEnabled ? 0 : 1
                  const safeNextY = nextY === 0 && !mirrorXEnabled ? 1 : nextY
                  dispatch(
                    setBaseParams({
                      splitIndex,
                      params: {
                        moverMirrorY: safeNextY,
                      },
                    })
                  )
                }}
              >
                <RadioDot $active={mirrorYEnabled} aria-hidden />
                <span>T/B</span>
              </RadioButton>
            </RadioGroup>
          </>
        )}
          </>
        ) : null}
      </MoverControls>
    </Root>
  )
}

const Root = styled.div`
  display: flex;
  align-items: stretch;
  gap: 0.5rem;
  margin-right: 1rem;
  min-width: max-content;
`

const PadSurface = styled.div`
  position: relative;
  width: 200px;
  min-width: 200px;
  height: 180px;
  background: #000;
  overflow: hidden;
  border: 1px solid ${(props) => props.theme.colors.divider};
`

const CenterMarker = styled.div`
  position: absolute;
  left: 50%;
  top: 50%;
  width: 0.9rem;
  height: 0.9rem;
  transform: translate(-50%, -50%);
  border-radius: 999px;
  border: 1px solid #ffffff6a;
  background: radial-gradient(circle at center, #ffffff55 0 22%, #ffffff05 58%, #0000 100%);
  pointer-events: none;
  z-index: 0;

  &::before,
  &::after {
    content: '';
    position: absolute;
    background: #ffffff5a;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
  }

  &::before {
    width: 0.04rem;
    height: 1.1rem;
  }

  &::after {
    width: 1.1rem;
    height: 0.04rem;
  }
`

const MoverControls = styled.div`
  width: 14rem;
  min-width: 13rem;
  max-width: 16rem;
  height: 180px;
  overflow-y: auto;
  overflow-x: hidden;
  background: #000b;
  border: 1px solid #ffffff22;
  border-radius: 0.35rem;
  padding: 0.35rem 0.45rem;
  scrollbar-width: thin;
  scrollbar-color: #7a7a7a99 #0000;

  &::-webkit-scrollbar {
    width: 9px;
  }

  &::-webkit-scrollbar-track {
    background: #0000;
  }

  &::-webkit-scrollbar-thumb {
    background: #7a7a7a99;
    border-radius: 999px;
  }
`

const ControlLabelRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.15rem;
`

const ControlLabel = styled.div`
  font-size: 0.62rem;
  color: #cfd8e8;
  margin-bottom: 0.16rem;
  margin-top: 0.22rem;
`

const SelectRow = styled.div`
  margin-bottom: 0.14rem;
`

const SpreadInput = styled.input`
  width: 100%;
  margin: 0;
  appearance: none;
  height: 0.72rem;
  background: transparent;
  cursor: pointer;

  &::-webkit-slider-runnable-track {
    height: 0.24rem;
    border-radius: 999px;
    background: linear-gradient(to right, #454f5e, #9fb6d5);
  }

  &::-webkit-slider-thumb {
    appearance: none;
    width: 0.52rem;
    height: 0.52rem;
    margin-top: -0.14rem;
    border-radius: 999px;
    border: 1px solid #000a;
    background: #d8e6ff;
  }
`

const ToggleRow = styled.div`
  display: flex;
  gap: 0.22rem;
`

const RadioGroup = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.22rem;
`

const RadioButton = styled.button<{ $active: boolean }>`
  border: 1px solid ${(props) => (props.$active ? '#8fb4ffbb' : '#ffffff33')};
  background: ${(props) => (props.$active ? '#1a3f7a' : '#101317')};
  color: ${(props) => (props.$active ? '#eaf2ff' : '#d9e3f2')};
  font-size: 0.64rem;
  border-radius: 0.28rem;
  cursor: pointer;
  padding: 0.18rem 0.28rem;
  display: flex;
  align-items: center;
  gap: 0.24rem;
  justify-content: flex-start;
`

const RadioDot = styled.span<{ $active: boolean }>`
  width: 0.58rem;
  height: 0.58rem;
  border-radius: 999px;
  border: 1px solid ${(props) => (props.$active ? '#dbe7ff' : '#7d8795')};
  background: ${(props) => (props.$active ? '#cfe0ff' : 'transparent')};
  box-shadow: ${(props) =>
    props.$active ? '0 0 0 2px rgba(16, 19, 23, 0.6) inset' : 'none'};
  flex: 0 0 auto;
`

const DisabledHint = styled.div`
  font-size: 0.58rem;
  color: #e6b7b7;
  margin-top: 0.2rem;
`

const MirrorOnlyHint = styled.div`
  font-size: 0.58rem;
  color: #b8c4d4;
  line-height: 1.3;
  margin-bottom: 0.25rem;
`
