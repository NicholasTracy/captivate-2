import styled from 'styled-components'
import { useDispatch } from 'react-redux'
import { useBaseParam } from '../redux/store'
import { useRealtimeSelector } from '../redux/realtimeStore'
import { setBaseParams } from '../redux/controlSlice'
import SliderBase from '../base/SliderBase'
import SliderCursor from '../base/SliderCursor'
import ManualSliderCursor from './ManualSliderCursor'
import { SliderMidiOverlay } from '../base/MidiOverlay'
import { makeSetBaseParamAction } from '../redux/deviceState'
import { indexArray } from '../../shared/util'
import ParamSlider from './ParamSlider'
import { colorWheelValueFromHueSat } from '../../shared/dmxColors'
import type { ColorWheelSlot } from '../../shared/splitColorCapabilities'

interface Props {
  splitIndex: number
  slots: ColorWheelSlot[]
  /** When true, this split is color-wheel-only (no HSB pad). */
  showBrightness: boolean
}

const sliderRadius = 0.35

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function getDetentIndex(value: number, slotCount: number): number {
  if (slotCount <= 1) return 0
  return Math.max(
    0,
    Math.min(slotCount - 1, Math.round(clamp01(value) * (slotCount - 1)))
  )
}

function snapToDetent(value: number, slotCount: number): number {
  if (slotCount <= 1) return 0
  return getDetentIndex(value, slotCount) / (slotCount - 1)
}

export default function ColorWheelControl({
  splitIndex,
  slots,
  showBrightness,
}: Props) {
  const dispatch = useDispatch()
  const wheelOnly = showBrightness
  const baseColorWheel = useBaseParam('colorWheel', splitIndex)
  const baseHue = useBaseParam('hue', splitIndex)
  const baseSaturation = useBaseParam('saturation', splitIndex)
  const outputParams = useRealtimeSelector(
    (state) => state.splitStates[splitIndex]?.outputParams
  )
  const slotCount = slots.length

  if (slotCount === 0) {
    return null
  }

  // Wheel-only splits require an explicit colorWheel param. Hybrid can show a
  // derived position from hue/sat so scene-gen colors stay visible on the wheel.
  if (wheelOnly && baseColorWheel === undefined) {
    return null
  }

  const derivedFromHue =
    baseHue !== undefined && baseSaturation !== undefined
      ? colorWheelValueFromHueSat(slots, baseHue, baseSaturation)
      : 0
  const outputDerivedFromHue =
    outputParams?.hue !== undefined && outputParams?.saturation !== undefined
      ? colorWheelValueFromHueSat(
          slots,
          Number(outputParams.hue),
          Number(outputParams.saturation)
        )
      : derivedFromHue

  const baseWheelValue = baseColorWheel ?? derivedFromHue
  const outputWheelValue =
    outputParams?.colorWheel !== undefined
      ? Number(outputParams.colorWheel)
      : outputDerivedFromHue

  const snappedBase = snapToDetent(baseWheelValue, slotCount)
  const snappedOutput = snapToDetent(outputWheelValue, slotCount)
  // Selection/label follow the manual base slot; live cursor still uses output.
  const selectedIndex = getDetentIndex(snappedBase, slotCount)
  const selectedSlot = slots[selectedIndex] ?? slots[0]!
  const selectedLabel = selectedSlot.label

  const onChange = (nextValue: number) => {
    const snapped = snapToDetent(nextValue, slotCount)
    const index = getDetentIndex(snapped, slotCount)
    const slot = slots[index] ?? slots[0]!
    if (wheelOnly) {
      dispatch(
        setBaseParams({
          splitIndex,
          params: { colorWheel: snapped },
        })
      )
      return
    }
    // Hybrid: write hue/sat so colorMap follows HSB (and scene-gen LFOs keep working).
    // Avoid stamping colorWheel here — discrete wheel would lock out hue matching.
    dispatch(
      setBaseParams({
        splitIndex,
        params: {
          hue: slot.hue,
          saturation: Math.max(slot.saturation, 0.85),
        },
      })
    )
  }

  const selectIndex = (index: number) => {
    const nextValue =
      slotCount <= 1 ? 0 : index / Math.max(1, slotCount - 1)
    onChange(nextValue)
  }

  return (
    <Row>
      <Root>
        <Title>Color wheel</Title>
        <SwatchGrid $columns={slotCount <= 6 ? slotCount : 4}>
          {slots.map((slot) => (
            <Swatch
              key={slot.index}
              type="button"
              $color={slot.preview}
              $active={slot.index === selectedIndex}
              title={slot.label}
              onClick={() => selectIndex(slot.index)}
            />
          ))}
        </SwatchGrid>
        <SelectedLabel>{selectedLabel}</SelectedLabel>
        <SliderMidiOverlay
          action={makeSetBaseParamAction(
            splitIndex,
            wheelOnly ? 'colorWheel' : 'hue'
          )}
          style={{ width: '100%', marginTop: '0.15rem' }}
        >
          <SliderTrackWrap>
            <SliderBase
              orientation="horizontal"
              radius={sliderRadius}
              onChange={onChange}
              title="Color wheel position"
            >
              <HorizontalDetents slotCount={slotCount} />
              <SliderCursor
                orientation="horizontal"
                value={snappedOutput}
                radius={sliderRadius}
                color="#7befff99"
              />
              <ManualSliderCursor
                orientation="horizontal"
                param={wheelOnly ? 'colorWheel' : 'hue'}
                splitIndex={splitIndex}
                value={snappedBase}
                radius={sliderRadius}
                color="#fff"
                border
              />
            </SliderBase>
          </SliderTrackWrap>
        </SliderMidiOverlay>
      </Root>
      {showBrightness && (
        <ParamSlider
          param="brightness"
          splitIndex={splitIndex}
          hideRemoveButton
          label="Brightness"
          wrapperStyle={{
            height: '180px',
            minHeight: '180px',
            marginRight: 0,
          }}
        />
      )}
    </Row>
  )
}

function HorizontalDetents({ slotCount }: { slotCount: number }) {
  if (slotCount <= 1) return null

  return (
    <>
      {indexArray(slotCount).map((index) => {
        const ratio = slotCount <= 1 ? 0 : index / (slotCount - 1)
        return <Detent key={index} style={{ left: `${ratio * 100}%` }} />
      })}
    </>
  )
}

const Row = styled.div`
  display: flex;
  flex-direction: row;
  align-items: stretch;
  gap: 0.35rem;
  margin-right: 1rem;
`

const Root = styled.div`
  width: 200px;
  border: 1px solid ${(p) => p.theme.colors.divider};
  background: ${(p) => p.theme.colors.bg.darker};
  box-shadow: ${(p) => p.theme.elevation.insetHighlight};
  padding: 0.45rem 0.5rem 0.55rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  box-sizing: border-box;
`

const Title = styled.div`
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: ${(p) => p.theme.colors.text.secondary};
`

const SwatchGrid = styled.div<{ $columns: number }>`
  display: grid;
  grid-template-columns: repeat(${({ $columns }) => $columns}, minmax(0, 1fr));
  gap: 0.28rem;
`

const Swatch = styled.button<{ $color: string; $active: boolean }>`
  appearance: none;
  border: 2px solid
    ${({ $active, theme }) =>
      $active ? theme.colors.text.primary : theme.colors.divider};
  border-radius: 0.28rem;
  background: ${({ $color }) => $color};
  width: 100%;
  aspect-ratio: 1;
  padding: 0;
  cursor: pointer;
  box-shadow: ${({ $active, theme }) =>
    $active
      ? `0 0 0 1px ${theme.colors.bg.darker}, 0 0 0 3px ${theme.colors.text.primary}`
      : 'inset 0 0 0 1px rgba(0, 0, 0, 0.18)'};

  &:hover {
    border-color: ${(p) => p.theme.colors.text.secondary};
  }
`

const SelectedLabel = styled.div`
  font-size: 0.68rem;
  color: ${(p) => p.theme.colors.text.secondary};
  text-align: center;
  line-height: 1.15;
  min-height: 0.8rem;
`

const SliderTrackWrap = styled.div`
  width: 100%;
  height: 1.35rem;
  position: relative;
`

const Detent = styled.div`
  position: absolute;
  top: -0.12rem;
  bottom: -0.12rem;
  width: 1px;
  background: #ffffff55;
  transform: translateX(-0.35rem);
  pointer-events: none;
`
