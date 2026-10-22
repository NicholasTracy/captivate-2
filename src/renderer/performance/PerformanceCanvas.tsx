import { useEffect, useMemo, useRef, useState } from 'react'
import styled from 'styled-components'
import { useDispatch, useStore } from 'react-redux'
import {
  addPerformanceControl,
  addPerformanceRoute,
  movePerformanceControl,
  removePerformanceControl,
  removePerformanceRoute,
  renamePerformanceControl,
  setPerformanceControlColor,
  setPerformanceEditUnlocked,
  setPerformanceGridSize,
  setPerformanceOscOut,
} from '../redux/controlSlice'
import {
  commitPerformancePad,
  commitPerformanceValue,
  midiActionLabel,
  readPerformanceRoutes,
} from '../redux/performanceControl'
import { isSendablePerformanceOscAddress } from '../../shared/performance'
import {
  PERFORMANCE_COLOR_PRESETS,
  PERFORMANCE_DEFAULT_COLS,
  PERFORMANCE_DEFAULT_ROWS,
  PERFORMANCE_PAD_SIZE,
  PERFORMANCE_SLIDER_SIZE,
  type PerformanceControl,
  type PerformanceControlKind,
} from '../../shared/performance'
import { defaultParamsList, paramDisplayName } from '../../shared/params'
import type { MidiAction } from '../redux/deviceState'
import { ButtonMidiOverlay, SliderMidiOverlay } from '../base/MidiOverlay'
import SliderBase from '../base/SliderBase'
import {
  getCleanReduxState,
  useControlSelector,
  type ReduxState,
} from '../redux/store'
import { realtimeStore } from '../redux/realtimeStore'
import { send_user_command } from '../ipcHandler'

const GAP_PX = 10

type GridMetrics = {
  cellW: number
  cellH: number
  gap: number
}

function controlPixelRect(
  grid: { x: number; y: number; w: number; h: number },
  metrics: GridMetrics
): { left: number; top: number; width: number; height: number } {
  const { cellW, cellH, gap } = metrics
  const stepX = cellW + gap
  const stepY = cellH + gap
  return {
    left: grid.x * stepX,
    top: grid.y * stepY,
    width: grid.w * cellW + (grid.w - 1) * gap,
    height: grid.h * cellH + (grid.h - 1) * gap,
  }
}

type DestKind = 'master' | 'baseParam' | 'groupIntensity' | 'bombacity'

export default function PerformanceCanvas() {
  const dispatch = useDispatch()
  const store = useStore()
  const bank = useControlSelector((s) => s.performance)
  const routes = useControlSelector((s) => {
    const scene = s.light.byId[s.light.active]
    return scene?.performanceRoutes ?? {}
  })
  const editUnlocked = bank.editUnlocked
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)
  const [metrics, setMetrics] = useState<GridMetrics>({
    cellW: 72,
    cellH: 72,
    gap: GAP_PX,
  })

  const controls = useMemo(() => {
    return bank.order
      .map((id) => bank.controls[id])
      .filter((c): c is PerformanceControl => !!c)
  }, [bank.controls, bank.order])

  useEffect(() => {
    // One-time bump from the original 8×8 default to denser cells.
    if (bank.cols === 8 && bank.rows === 8) {
      dispatch(
        setPerformanceGridSize({
          cols: PERFORMANCE_DEFAULT_COLS,
          rows: PERFORMANCE_DEFAULT_ROWS,
        })
      )
    }
  }, [bank.cols, bank.rows, dispatch])

  useEffect(() => {
    const el = gridRef.current
    if (el === null) return

    const measure = () => {
      const width = el.clientWidth
      const height = el.clientHeight
      if (width <= 0 || height <= 0) return
      const cols = Math.max(1, bank.cols)
      const rows = Math.max(1, bank.rows)
      const cellW = (width - (cols - 1) * GAP_PX) / cols
      const cellH = (height - (rows - 1) * GAP_PX) / rows
      setMetrics((prev) => {
        if (
          Math.abs(prev.cellW - cellW) < 0.5 &&
          Math.abs(prev.cellH - cellH) < 0.5
        ) {
          return prev
        }
        return { cellW, cellH, gap: GAP_PX }
      })
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [bank.cols, bank.rows])

  const selected =
    selectedId !== null
      ? controls.find((c) => c.id === selectedId) ?? null
      : null
  const selectedRoutes =
    selected !== null ? readPerformanceRoutes(routes[selected.id]) : []

  const onAdd = (kind: PerformanceControlKind) => {
    dispatch(addPerformanceControl({ kind }))
  }

  return (
    <Root>
      <Toolbar>
        <Title>Performance</Title>
        <ToolbarSpacer />
        <ToggleRow>
          <ToggleLabel>Edit</ToggleLabel>
          <ToggleButton
            type="button"
            $on={editUnlocked}
            onClick={() => {
              const next = !editUnlocked
              dispatch(setPerformanceEditUnlocked(next))
              if (!next) setSelectedId(null)
            }}
          >
            {editUnlocked ? 'Unlocked' : 'Locked'}
          </ToggleButton>
        </ToggleRow>
        {editUnlocked ? (
          <>
            <AddButton type="button" onClick={() => onAdd('pad')}>
              Add Pad
            </AddButton>
            <AddButton type="button" onClick={() => onAdd('slider')}>
              Add Slider
            </AddButton>
          </>
        ) : null}
      </Toolbar>
      <Hint>
        {editUnlocked
          ? 'Drag pads/sliders on the grid. Select one to rename, route, or remove in the inspector.'
          : 'Locked for performance. Unlock Edit to rearrange controls. MIDI learn still works via the piano icon.'}
      </Hint>
      <MainRow>
        <GridWrap>
          <Grid
            ref={gridRef}
            style={{
              gridTemplateColumns: `repeat(${bank.cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${bank.rows}, minmax(0, 1fr))`,
              gap: GAP_PX,
            }}
          >
            {Array.from({ length: bank.cols * bank.rows }).map((_, i) => (
              <CellBg key={i} />
            ))}
            {controls.map((control) => {
              const controlRoutes = readPerformanceRoutes(routes[control.id])
              return (
                <ControlCard
                  key={control.id}
                  control={control}
                  routes={controlRoutes}
                  metrics={metrics}
                  editUnlocked={editUnlocked}
                  selected={selectedId === control.id}
                  onSelect={() => setSelectedId(control.id)}
                  onMove={(x, y) =>
                    dispatch(movePerformanceControl({ id: control.id, x, y }))
                  }
                  onValue={(value) => {
                    commitPerformanceValue(
                      dispatch as (a: unknown) => void,
                      () => getCleanReduxState(store.getState() as ReduxState),
                      control.id,
                      value
                    )
                  }}
                  onPad={() => {
                    commitPerformancePad(
                      dispatch as (a: unknown) => void,
                      () => getCleanReduxState(store.getState() as ReduxState),
                      control.id,
                      () => send_user_command({ type: 'TapTempo' }),
                      realtimeStore.getState()
                    )
                  }}
                />
              )
            })}
          </Grid>
        </GridWrap>
        {editUnlocked ? (
          <Inspector>
            <InspectorTitle>Inspector</InspectorTitle>
            {selected ? (
              <InspectorBody
                control={selected}
                routes={selectedRoutes}
                onRename={(label) =>
                  dispatch(
                    renamePerformanceControl({ id: selected.id, label })
                  )
                }
                onColor={(color) =>
                  dispatch(
                    setPerformanceControlColor({ id: selected.id, color })
                  )
                }
                onRemove={() => {
                  dispatch(removePerformanceControl(selected.id))
                  setSelectedId(null)
                }}
                onAddRoute={(action) =>
                  dispatch(
                    addPerformanceRoute({
                      controlId: selected.id,
                      action,
                    })
                  )
                }
                onRemoveRoute={(index) =>
                  dispatch(
                    removePerformanceRoute({
                      controlId: selected.id,
                      index,
                    })
                  )
                }
                onOsc={(patch) =>
                  dispatch(
                    setPerformanceOscOut({ id: selected.id, ...patch })
                  )
                }
              />
            ) : (
              <InspectorEmpty>Select a pad or slider on the grid.</InspectorEmpty>
            )}
          </Inspector>
        ) : null}
      </MainRow>
    </Root>
  )
}

function InspectorBody({
  control,
  routes,
  onRename,
  onColor,
  onRemove,
  onAddRoute,
  onRemoveRoute,
  onOsc,
}: {
  control: PerformanceControl
  routes: MidiAction[]
  onRename: (label: string) => void
  onColor: (color: string) => void
  onRemove: () => void
  onAddRoute: (action: MidiAction) => void
  onRemoveRoute: (index: number) => void
  onOsc: (patch: { enabled?: boolean; address?: string }) => void
}) {
  const [destKind, setDestKind] = useState<DestKind>('master')
  const [paramKey, setParamKey] = useState<string>('brightness')
  const [groupName, setGroupName] = useState('All')

  const applyDest = () => {
    let action: MidiAction
    if (destKind === 'master') action = { type: 'setMaster' }
    else if (destKind === 'bombacity')
      action = { type: 'setAutoSceneBombacity' }
    else if (destKind === 'groupIntensity')
      action = { type: 'setGroupIntensity', group: groupName.trim() || 'All' }
    else action = { type: 'setBaseParam', paramKey, splitIndex: 0 }
    onAddRoute(action)
  }

  const oscAddressOk =
    control.oscAddress.trim().length === 0 ||
    isSendablePerformanceOscAddress(control.oscAddress.trim())

  return (
    <>
      <Field>
        <FieldLabel>Name</FieldLabel>
        <NameInput
          value={control.label}
          onChange={(e) => onRename(e.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel>Color</FieldLabel>
        <ColorRow>
          {PERFORMANCE_COLOR_PRESETS.map((preset) => (
            <ColorSwatch
              key={preset}
              type="button"
              title={preset}
              $color={preset}
              $active={control.color.toLowerCase() === preset.toLowerCase()}
              onClick={() => onColor(preset)}
            />
          ))}
          <ColorPicker
            type="color"
            value={control.color}
            title="Custom color"
            onChange={(e) => onColor(e.target.value)}
          />
        </ColorRow>
      </Field>
      <Field>
        <FieldLabel>Type</FieldLabel>
        <Muted>
          {control.kind === 'pad' ? 'Pad' : 'Slider'} ·{' '}
          {control.kind === 'pad'
            ? `${PERFORMANCE_PAD_SIZE.w}×${PERFORMANCE_PAD_SIZE.h}`
            : `${PERFORMANCE_SLIDER_SIZE.w}×${PERFORMANCE_SLIDER_SIZE.h}`}
        </Muted>
      </Field>
      <Field>
        <FieldLabel>Destinations (active scene)</FieldLabel>
        {routes.length === 0 ? (
          <Muted>None</Muted>
        ) : (
          routes.map((route, index) => (
            <DestRow key={`${index}:${midiActionLabel(route)}`}>
              <Muted>{midiActionLabel(route)}</Muted>
              <TinyBtn type="button" onClick={() => onRemoveRoute(index)}>
                Remove
              </TinyBtn>
            </DestRow>
          ))
        )}
      </Field>
      <DestPicker>
        <select
          value={destKind}
          onChange={(e) => setDestKind(e.target.value as DestKind)}
        >
          <option value="master">Master</option>
          <option value="baseParam">Base param</option>
          <option value="groupIntensity">Group intensity</option>
          <option value="bombacity">Bombacity</option>
        </select>
        {destKind === 'baseParam' ? (
          <select
            value={paramKey}
            onChange={(e) => setParamKey(e.target.value)}
          >
            {defaultParamsList.map((p) => (
              <option key={p} value={p}>
                {paramDisplayName(p)}
              </option>
            ))}
          </select>
        ) : null}
        {destKind === 'groupIntensity' ? (
          <NameInput
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Group"
          />
        ) : null}
        <TinyBtn type="button" onClick={applyDest}>
          Add destination
        </TinyBtn>
      </DestPicker>
      <Field>
        <FieldLabel>OSC out</FieldLabel>
        <ToggleRow>
          <ToggleButton
            type="button"
            $on={control.oscSendEnabled}
            onClick={() => onOsc({ enabled: !control.oscSendEnabled })}
          >
            {control.oscSendEnabled ? 'Send on' : 'Send off'}
          </ToggleButton>
        </ToggleRow>
        <NameInput
          value={control.oscAddress}
          placeholder="/performance/control"
          onChange={(e) => onOsc({ address: e.target.value })}
        />
        <Muted>
          {oscAddressOk
            ? 'Sends this control (0–1, pads 0 or 1) when Connections OSC send is on. The /captivate bus still publishes.'
            : 'Address must be a path starting with / and contain no spaces.'}
        </Muted>
      </Field>
      <RemoveWide type="button" onClick={onRemove}>
        Remove control
      </RemoveWide>
    </>
  )
}

function routeChipLabel(routes: MidiAction[]): string | null {
  if (routes.length === 0) return null
  if (routes.length === 1) return midiActionLabel(routes[0]!)
  return `${midiActionLabel(routes[0]!)} +${routes.length - 1}`
}

function ControlCard({
  control,
  routes,
  metrics,
  editUnlocked,
  selected,
  onSelect,
  onMove,
  onValue,
  onPad,
}: {
  control: PerformanceControl
  routes: MidiAction[]
  metrics: GridMetrics
  editUnlocked: boolean
  selected: boolean
  onSelect: () => void
  onMove: (x: number, y: number) => void
  onValue: (value: number) => void
  onPad: () => void
}) {
  const dragOrigin = useRef<{
    startX: number
    startY: number
    gridX: number
    gridY: number
  } | null>(null)

  const rect = controlPixelRect(control.grid, metrics)
  const stepX = metrics.cellW + metrics.gap
  const stepY = metrics.cellH + metrics.gap
  const style: React.CSSProperties = {
    position: 'absolute',
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  }

  const accent = control.color
  const routeLabel = routeChipLabel(routes)
  const midiOverlay =
    control.kind === 'slider' ? (
      <SliderMidiOverlay
        action={{ type: 'setPerformanceValue', controlId: control.id }}
        style={{ width: '100%', height: '100%' }}
      >
        <FaderBody $color={accent}>
          <SliderBase
            orientation="vertical"
            radius={0.35}
            verticalPadRem={0.45}
            fillCrossAxis
            trackBackground="transparent"
            onChange={onValue}
            title={control.label}
          >
            <FaderCap
              $color={accent}
              style={{ bottom: `${control.value * 100}%` }}
            />
          </SliderBase>
        </FaderBody>
      </SliderMidiOverlay>
    ) : (
      <ButtonMidiOverlay
        action={{ type: 'firePerformancePad', controlId: control.id }}
        style={{ width: '100%', height: '100%' }}
      >
        <PadButton
          type="button"
          $hot={control.value > 0.5}
          $color={accent}
          onClick={(e) => {
            e.stopPropagation()
            if (!editUnlocked) onPad()
          }}
        >
          {control.label}
        </PadButton>
      </ButtonMidiOverlay>
    )

  return (
    <Card
      style={style}
      $kind={control.kind}
      $selected={selected}
      $edit={editUnlocked}
      $color={accent}
      onClick={() => {
        if (editUnlocked) onSelect()
      }}
      onPointerDown={
        editUnlocked
          ? (e) => {
              if ((e.target as HTMLElement).closest('button,a')) return
              onSelect()
              dragOrigin.current = {
                startX: e.clientX,
                startY: e.clientY,
                gridX: control.grid.x,
                gridY: control.grid.y,
              }
              ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
            }
          : undefined
      }
      onPointerMove={
        editUnlocked
          ? (e) => {
              if (!dragOrigin.current) return
              const dx = e.clientX - dragOrigin.current.startX
              const dy = e.clientY - dragOrigin.current.startY
              const nx =
                dragOrigin.current.gridX +
                Math.round(dx / Math.max(1, stepX))
              const ny =
                dragOrigin.current.gridY +
                Math.round(dy / Math.max(1, stepY))
              if (nx !== control.grid.x || ny !== control.grid.y) {
                onMove(nx, ny)
              }
            }
          : undefined
      }
      onPointerUp={
        editUnlocked
          ? () => {
              dragOrigin.current = null
            }
          : undefined
      }
    >
      {control.kind === 'slider' ? (
        <CardHeader>
          <Name title={control.label}>{control.label}</Name>
          {routeLabel ? (
            <RouteChip title={routeLabel}>{routeLabel}</RouteChip>
          ) : null}
        </CardHeader>
      ) : null}
      <Body $pad={control.kind === 'pad'}>{midiOverlay}</Body>
      {control.kind === 'pad' && routeLabel ? (
        <RouteChipAbs title={routeLabel}>{routeLabel}</RouteChipAbs>
      ) : null}
    </Card>
  )
}

const Root = styled.div`
  /* PageWrapper is not a flex parent — match other pages and fill its height. */
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: ${(p) => p.theme.colors.bg.darker};
`

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 0.75rem;
  border-bottom: 1px solid ${(p) => p.theme.colors.divider};
  flex-shrink: 0;
`

const Title = styled.div`
  font-size: 0.95rem;
  font-weight: 700;
  color: ${(p) => p.theme.colors.text.primary};
`

const ToolbarSpacer = styled.div`
  flex: 1;
`

const ToggleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.35rem;
`

const ToggleLabel = styled.span`
  font-size: 0.75rem;
  color: ${(p) => p.theme.colors.text.secondary};
`

const ToggleButton = styled.button<{ $on: boolean }>`
  border: 1px solid
    ${(p) => (p.$on ? p.theme.colors.text.primary : p.theme.colors.divider)};
  background: ${(p) =>
    p.$on ? p.theme.colors.bg.lighter : p.theme.colors.bg.primary};
  color: ${(p) => p.theme.colors.text.primary};
  border-radius: 0.3rem;
  padding: 0.3rem 0.55rem;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
`

const AddButton = styled.button`
  border: 1px solid ${(p) => p.theme.colors.divider};
  background: ${(p) => p.theme.colors.bg.primary};
  color: ${(p) => p.theme.colors.text.primary};
  border-radius: 0.3rem;
  padding: 0.3rem 0.55rem;
  font-size: 0.75rem;
  cursor: pointer;
  &:hover {
    background: ${(p) => p.theme.colors.bg.lighter};
  }
`

const Hint = styled.div`
  padding: 0.4rem 0.75rem;
  font-size: 0.72rem;
  color: ${(p) => p.theme.colors.text.secondary};
  border-bottom: 1px solid ${(p) => p.theme.colors.divider};
  flex-shrink: 0;
`

const MainRow = styled.div`
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: row;
  overflow: hidden;
`

const GridWrap = styled.div`
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  padding: 0.75rem;
  display: flex;
`

const Grid = styled.div`
  position: relative;
  display: grid;
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  /* Background cells fill tracks; controls are absolutely positioned over them. */
  align-content: stretch;
  justify-content: stretch;
`

const CellBg = styled.div`
  border-radius: 0.3rem;
  background: ${(p) => p.theme.colors.bg.primary};
  border: 1px solid ${(p) => p.theme.colors.divider};
  opacity: 0.4;
  pointer-events: none;
`

const Card = styled.div<{
  $kind: PerformanceControlKind
  $selected: boolean
  $edit: boolean
  $color: string
}>`
  z-index: 2;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-radius: 0.4rem;
  border: 1px solid
    ${(p) => (p.$selected && p.$edit ? p.$color : `${p.$color}99`)};
  background: ${(p) => p.theme.colors.bg.panel ?? p.theme.colors.bg.lighter};
  box-shadow: ${(p) => p.theme.elevation.shadowSm};
  padding: ${(p) => (p.$kind === 'slider' ? '0.3rem 0.25rem' : '0.35rem')};
  gap: 0.25rem;
  touch-action: none;
  user-select: none;
  cursor: ${(p) => (p.$edit ? 'grab' : 'default')};
`

const CardHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex: 0 0 auto;
  min-height: 1.1rem;
  max-width: 100%;
`

const Name = styled.div`
  flex: 1 1 auto;
  min-width: 0;
  font-size: 0.72rem;
  font-weight: 700;
  color: ${(p) => p.theme.colors.text.primary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const NameInput = styled.input`
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  font-size: 0.8rem;
  font-weight: 600;
  color: ${(p) => p.theme.colors.text.primary};
  background: ${(p) => p.theme.colors.bg.darker};
  border: 1px solid ${(p) => p.theme.colors.divider};
  border-radius: 0.25rem;
  padding: 0.35rem 0.45rem;
`

const Body = styled.div<{ $pad?: boolean }>`
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  position: relative;
  display: flex;
  overflow: hidden;
  ${(p) => (p.$pad ? 'margin: -0.1rem;' : '')}

  /* MidiOverlay root + interactive child must fill the card body. */
  & > * {
    flex: 1 1 auto;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }
`

const FaderBody = styled.div<{ $color: string }>`
  width: 100%;
  height: 100%;
  min-height: 0;
  position: relative;
  border-radius: 0.3rem;
  background: linear-gradient(
    180deg,
    ${(p) => p.theme.colors.bg.darker} 0%,
    ${(p) => `${p.$color}22`} 100%
  );
  border: 1px solid ${(p) => `${p.$color}66`};
  overflow: hidden;
`

const FaderCap = styled.div<{ $color: string }>`
  position: absolute;
  left: 3%;
  width: 94%;
  height: 1.05rem;
  transform: translateY(50%);
  border-radius: 0.22rem;
  background: linear-gradient(
    180deg,
    ${(p) => p.$color} 0%,
    ${(p) => p.$color}cc 100%
  );
  border: 1px solid ${(p) => p.$color};
  box-shadow:
    0 2px 5px rgba(0, 0, 0, 0.45),
    inset 0 1px 0 rgba(255, 255, 255, 0.35),
    inset 0 -2px 0 rgba(0, 0, 0, 0.22);
  pointer-events: none;
`

const PadButton = styled.button<{ $hot: boolean; $color: string }>`
  width: 100%;
  height: 100%;
  min-height: 0;
  border-radius: 0.35rem;
  border: 1px solid ${(p) => `${p.$color}aa`};
  background: ${(p) =>
    p.$hot
      ? `linear-gradient(180deg, ${p.$color} 0%, ${p.$color}cc 100%)`
      : `linear-gradient(180deg, ${p.$color}55 0%, ${p.$color}22 100%)`};
  color: ${(p) => p.theme.colors.text.primary};
  font-weight: 800;
  font-size: 0.85rem;
  letter-spacing: 0.04em;
  cursor: pointer;
  padding: 0.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
`

const RouteChip = styled.div`
  flex: 0 1 auto;
  max-width: 45%;
  font-size: 0.58rem;
  color: ${(p) => p.theme.colors.text.secondary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const RouteChipAbs = styled(RouteChip)`
  position: absolute;
  left: 0.4rem;
  right: 0.4rem;
  bottom: 0.35rem;
  max-width: none;
  pointer-events: none;
  text-align: center;
  opacity: 0.85;
`

const Inspector = styled.aside`
  flex: 0 0 17rem;
  width: 17rem;
  min-width: 15rem;
  max-width: 40%;
  border-left: 1px solid ${(p) => p.theme.colors.divider};
  background: ${(p) => p.theme.colors.bg.primary};
  padding: 0.75rem;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
`

const InspectorTitle = styled.div`
  font-size: 0.8rem;
  font-weight: 700;
  color: ${(p) => p.theme.colors.text.primary};
`

const InspectorEmpty = styled.div`
  font-size: 0.75rem;
  color: ${(p) => p.theme.colors.text.secondary};
`

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`

const FieldLabel = styled.div`
  font-size: 0.68rem;
  font-weight: 600;
  color: ${(p) => p.theme.colors.text.secondary};
`

const ColorRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
`

const ColorSwatch = styled.button<{ $color: string; $active: boolean }>`
  width: 1.35rem;
  height: 1.35rem;
  border-radius: 0.3rem;
  border: 2px solid
    ${(p) => (p.$active ? p.theme.colors.text.primary : 'transparent')};
  background: ${(p) => p.$color};
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.35);
  cursor: pointer;
  padding: 0;
  flex: 0 0 auto;
`

const ColorPicker = styled.input`
  width: 1.6rem;
  height: 1.6rem;
  padding: 0;
  border: 1px solid ${(p) => p.theme.colors.divider};
  border-radius: 0.3rem;
  background: ${(p) => p.theme.colors.bg.darker};
  cursor: pointer;
`

const Muted = styled.div`
  font-size: 0.75rem;
  color: ${(p) => p.theme.colors.text.primary};
  word-break: break-word;
`

const TinyBtn = styled.button`
  border: 1px solid ${(p) => p.theme.colors.divider};
  background: ${(p) => p.theme.colors.bg.lighter};
  color: ${(p) => p.theme.colors.text.primary};
  border-radius: 0.25rem;
  font-size: 0.7rem;
  padding: 0.3rem 0.45rem;
  cursor: pointer;
`

const DestRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.35rem;
`

const DestPicker = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  select,
  input {
    width: 100%;
    box-sizing: border-box;
    font-size: 0.75rem;
    background: ${(p) => p.theme.colors.bg.darker};
    color: ${(p) => p.theme.colors.text.primary};
    border: 1px solid ${(p) => p.theme.colors.divider};
    border-radius: 0.25rem;
    padding: 0.35rem 0.4rem;
  }
`

const RemoveWide = styled.button`
  margin-top: 0.35rem;
  border: 1px solid ${(p) => p.theme.colors.divider};
  background: transparent;
  color: ${(p) => p.theme.colors.text.secondary};
  border-radius: 0.3rem;
  padding: 0.45rem;
  font-size: 0.75rem;
  cursor: pointer;
  &:hover {
    color: ${(p) => p.theme.colors.text.primary};
    background: ${(p) => p.theme.colors.bg.darker};
  }
`
