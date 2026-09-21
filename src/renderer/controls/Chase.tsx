import { useDispatch } from 'react-redux'
import { useRealtimeSelector } from 'renderer/redux/realtimeStore'
import { useActiveLightScene, useBaseParam } from '../redux/store'
import { setChase } from '../redux/controlSlice'
import DraggableNumber from '../base/DraggableNumber'
import ToggleButton from '../base/ToggleButton'
import ParamSlider from './ParamSlider'
import ADSR, { Control } from './ADSR'
import SlotBarVisualizer from './SlotBarVisualizer'
import type { ChaseDirection } from 'shared/chase'
import type { SlotAxis } from 'shared/slotOrder'
import {
  ENVELOPE_ADSR_HEIGHT_PX,
  ENVELOPE_MODULE_WIDTH_PX,
  EnvelopeModuleRoot,
  EnvelopeModuleRow,
  EnvelopeNumberSlot,
  EnvelopeToggleGroup,
} from './EnvelopeModuleLayout'

interface Props {
  splitIndex: number
}

const AXIS_OPTIONS: Array<{
  id: SlotAxis
  label: string
  title: string
}> = [
  { id: 'horizontal', label: '↔', title: 'Order left → right (top row first)' },
  { id: 'vertical', label: '↕', title: 'Order top → bottom (left column first)' },
]

function directionOptions(axis: SlotAxis): Array<{
  id: ChaseDirection
  label: string
  title: string
}> {
  if (axis === 'vertical') {
    return [
      { id: 'forward', label: '↓', title: 'Chase top → bottom' },
      { id: 'reverse', label: '↑', title: 'Chase bottom → top' },
      { id: 'bounce', label: '↕', title: 'Chase bounce vertically' },
    ]
  }
  return [
    { id: 'forward', label: '→', title: 'Chase left → right' },
    { id: 'reverse', label: '←', title: 'Chase right → left' },
    { id: 'bounce', label: '↔', title: 'Chase bounce horizontally' },
  ]
}

export default function Chase({ splitIndex }: Props) {
  const chase = useActiveLightScene(
    (scene) => scene.splitScenes[splitIndex]?.chase
  )
  const dispatch = useDispatch()
  const chaseMix = useBaseParam('chase', splitIndex)
  const levels = useRealtimeSelector(
    (rtState) =>
      rtState.splitStates[splitIndex]?.chase?.points?.map(
        (point) => point.level
      ) ?? []
  )

  if (chase === undefined || chaseMix === undefined) {
    return null
  }

  const {
    stepPeriod,
    stepsOn,
    direction,
    slotAxis,
    envelopeRatio,
    envelopeDuration,
  } = chase

  const axis = slotAxis ?? 'horizontal'
  const dirs = directionOptions(axis)

  const ratio: Control = {
    val: envelopeRatio,
    min: 0,
    max: 1,
    onChange: (newVal) => {
      dispatch(
        setChase({
          key: 'envelopeRatio',
          value: newVal,
          splitIndex,
        })
      )
    },
  }

  const duration: Control = {
    val: envelopeDuration,
    min: 0.1,
    max: 16,
    onChange: (newVal) => {
      dispatch(
        setChase({
          key: 'envelopeDuration',
          value: newVal,
          splitIndex,
        })
      )
    },
  }

  return (
    <>
      <EnvelopeModuleRoot>
        <ADSR
          width={ENVELOPE_MODULE_WIDTH_PX}
          height={ENVELOPE_ADSR_HEIGHT_PX}
          ratio={ratio}
          duration={duration}
        />
        <SlotBarVisualizer levels={levels} mix={chaseMix} />
        <EnvelopeModuleRow>
          <EnvelopeToggleGroup title="Slot order axis" style={{ flex: '2 1 0' }}>
            {AXIS_OPTIONS.map((option) => (
              <ToggleButton
                key={option.id}
                isEnabled={axis === option.id}
                title={option.title}
                onClick={() =>
                  dispatch(
                    setChase({
                      key: 'slotAxis',
                      value: option.id,
                      splitIndex,
                    })
                  )
                }
              >
                {option.label}
              </ToggleButton>
            ))}
          </EnvelopeToggleGroup>
          <EnvelopeToggleGroup
            title="Chase direction"
            style={{ flex: '3 1 0' }}
          >
            {dirs.map((option) => (
              <ToggleButton
                key={option.id}
                isEnabled={direction === option.id}
                title={option.title}
                onClick={() =>
                  dispatch(
                    setChase({
                      key: 'direction',
                      value: option.id,
                      splitIndex,
                    })
                  )
                }
              >
                {option.label}
              </ToggleButton>
            ))}
          </EnvelopeToggleGroup>
        </EnvelopeModuleRow>
        <EnvelopeModuleRow>
          <EnvelopeNumberSlot $grow>
            <DraggableNumber
              value={stepsOn}
              min={1}
              max={16}
              title="Slots on at each step"
              onChange={(newVal) =>
                dispatch(
                  setChase({
                    key: 'stepsOn',
                    value: newVal,
                    splitIndex,
                  })
                )
              }
            />
          </EnvelopeNumberSlot>
          <EnvelopeNumberSlot $grow>
            <DraggableNumber
              value={stepPeriod}
              min={0.05}
              max={4}
              title="Step period in beats"
              onChange={(newVal) =>
                dispatch(
                  setChase({
                    key: 'stepPeriod',
                    value: newVal,
                    splitIndex,
                  })
                )
              }
            />
          </EnvelopeNumberSlot>
        </EnvelopeModuleRow>
      </EnvelopeModuleRoot>
      <ParamSlider param={'chase'} splitIndex={splitIndex} />
    </>
  )
}
