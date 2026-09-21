import { useDispatch } from 'react-redux'
import { useRealtimeSelector } from 'renderer/redux/realtimeStore'
import { useActiveLightScene, useBaseParam } from '../redux/store'
import { setRandomizer } from '../redux/controlSlice'
import DraggableNumber from '../base/DraggableNumber'
import Slider from '../base/Slider'
import ParamSlider from './ParamSlider'
import ADSR, { Control } from './ADSR'
import SlotBarVisualizer from './SlotBarVisualizer'
import {
  ENVELOPE_ADSR_HEIGHT_PX,
  ENVELOPE_MODULE_WIDTH_PX,
  EnvelopeModuleRoot,
  EnvelopeModuleRow,
  EnvelopeNumberSlot,
  EnvelopeSliderSlot,
} from './EnvelopeModuleLayout'

interface Props {
  splitIndex: number
}

export default function Randomizer({ splitIndex }: Props) {
  const randomizer = useActiveLightScene((scene) =>
    scene.splitScenes[splitIndex]?.randomizer
  )
  const dispatch = useDispatch()
  const randomize = useBaseParam('randomize', splitIndex)
  const levels = useRealtimeSelector(
    (rtState) =>
      rtState.splitStates[splitIndex]?.randomizer?.map((point) => point.level) ??
      []
  )

  if (randomizer === undefined || randomize === undefined) {
    return null
  }

  const { triggerPeriod, triggerDensity, envelopeRatio, envelopeDuration } =
    randomizer

  const ratio: Control = {
    val: envelopeRatio,
    min: 0,
    max: 1,
    onChange: (newVal) => {
      dispatch(
        setRandomizer({
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
        setRandomizer({
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
        <SlotBarVisualizer levels={levels} mix={randomize} />
        <EnvelopeModuleRow>
          <EnvelopeSliderSlot title="Trigger density — 0 never fires, 1 hits every slot each period">
            <Slider
              value={triggerDensity}
              orientation="horizontal"
              onChange={(newVal) =>
                dispatch(
                  setRandomizer({
                    key: 'triggerDensity',
                    value: newVal,
                    splitIndex,
                  })
                )
              }
            />
          </EnvelopeSliderSlot>
          <EnvelopeNumberSlot>
            <DraggableNumber
              value={triggerPeriod}
              min={0.05}
              max={4}
              title="Trigger period in beats"
              onChange={(newVal) =>
                dispatch(
                  setRandomizer({
                    key: 'triggerPeriod',
                    value: newVal,
                    splitIndex,
                  })
                )
              }
            />
          </EnvelopeNumberSlot>
        </EnvelopeModuleRow>
      </EnvelopeModuleRoot>
      <ParamSlider param={'randomize'} splitIndex={splitIndex} />
    </>
  )
}
