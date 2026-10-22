import {
  OscMessage,
  oscInputID,
  oscMessageNormalizedValue,
} from '../../shared/osc'
import { CleanReduxState } from '../../renderer/redux/store'
import { RealtimeState } from '../../renderer/redux/realtimeStore'
import {
  buttonMidiActionTypes,
  getActionID,
  getSetBaseParamSplitIndex,
  MidiAction,
  initSliderOptions,
  normalizeSliderOptionsForAction,
  SliderControlOptions,
} from '../../renderer/redux/deviceState'
import { fireMidiButtonAction } from '../../renderer/redux/fireMidiButtonAction'
import {
  midiSetButtonAction,
  midiSetSliderAction,
  setAutoSceneBombacity,
  setMaster,
  setBaseParams,
  setGroupIntensity,
} from '../../renderer/redux/controlSlice'
import {
  commitPerformancePad,
  commitPerformanceValue,
} from '../../renderer/redux/performanceControl'
import { getGroupIntensityLevel } from '../../shared/groupIntensity'
import { PayloadAction } from '@reduxjs/toolkit'

const buttonThresholdState = new Map<string, boolean>()

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeOptions(action: MidiAction, options: SliderControlOptions) {
  return normalizeSliderOptionsForAction(action, options)
}

/**
 * OSC learn + playback. Uses the same button/slider action maps as MIDI;
 * input ids are OSC addresses (e.g. `/captivate/master`).
 */
export function handleOscMessage(
  message: OscMessage,
  state: CleanReduxState,
  rt_state: RealtimeState,
  setTempo: (bpm: number) => void,
  dispatch: (action: PayloadAction<any>) => void,
  tapTempo: () => void
) {
  const inputId = oscInputID(message.address)
  if (!inputId.startsWith('/')) return

  const deviceState = state.control.device
  const normalized = oscMessageNormalizedValue(message)

  if (deviceState.isEditing && deviceState.listening) {
    const listenType = deviceState.listening.type
    if (buttonMidiActionTypes.has(listenType)) {
      dispatch(
        midiSetButtonAction({
          inputID: inputId,
          action: deviceState.listening,
        })
      )
    } else {
      dispatch(
        midiSetSliderAction({
          inputID: inputId,
          action: deviceState.listening,
          options: initSliderOptions(deviceState.listening, 'cc'),
        })
      )
    }
    return
  }

  const buttonAction = Object.entries(deviceState.buttonActions).find(
    ([_actionId, action]) => action.inputID === inputId
  )?.[1]

  if (buttonAction) {
    const actionKey = `${inputId}:${getActionID(buttonAction.action)}`
    const pressed = normalized >= 0.5
    const wasPressed = buttonThresholdState.get(actionKey) === true
    buttonThresholdState.set(actionKey, pressed)
    if (pressed && !wasPressed) {
      const action = buttonAction.action
      if (action.type === 'firePerformancePad') {
        commitPerformancePad(
          dispatch,
          () => state,
          action.controlId,
          tapTempo,
          rt_state,
          setTempo
        )
      } else {
        fireMidiButtonAction(dispatch, state, rt_state, action, tapTempo)
      }
    }
  }

  const sliderAction = Object.entries(deviceState.sliderActions).find(
    ([_actionId, action]) => action.inputID === inputId
  )?.[1]

  if (!sliderAction) return

  const action = sliderAction.action
  const options = normalizeOptions(action, sliderAction.options)
  const range = options.max - options.min

  const getOldVal = () => {
    if (action.type === 'setAutoSceneBombacity') {
      return state.control.light.auto.epicness
    } else if (action.type === 'setBpm') {
      return rt_state.time.bpm
    } else if (action.type === 'setBaseParam') {
      const splitIndex = getSetBaseParamSplitIndex(action)
      return (
        state.control.light.byId[state.control.light.active]?.splitScenes[
          splitIndex
        ]?.baseParams[action.paramKey] ?? 0.5
      )
    } else if (action.type === 'setMaster') {
      return state.control.master
    } else if (action.type === 'setGroupIntensity') {
      return getGroupIntensityLevel(state.control.groupIntensity, action.group)
    } else if (action.type === 'setPerformanceValue') {
      return state.control.performance.controls[action.controlId]?.value ?? 0
    }
    return 0
  }

  const setNewVal = (newVal: number) => {
    const bounded = clamp(newVal, options.min, options.max)

    if (action.type === 'setAutoSceneBombacity') {
      dispatch(
        setAutoSceneBombacity({
          sceneType: 'light',
          val: bounded,
        })
      )
    } else if (action.type === 'setMaster') {
      dispatch(setMaster(bounded))
    } else if (action.type === 'setBaseParam') {
      // Active light scene only (setBaseParams → modifyActiveLightScene).
      dispatch(
        setBaseParams({
          splitIndex: getSetBaseParamSplitIndex(action),
          params: {
            [action.paramKey]: bounded,
          },
        })
      )
    } else if (action.type === 'setGroupIntensity') {
      dispatch(setGroupIntensity({ group: action.group, intensity: bounded }))
    } else if (action.type === 'setBpm') {
      setTempo(bounded)
    } else if (action.type === 'setPerformanceValue') {
      commitPerformanceValue(
        dispatch,
        () => state,
        action.controlId,
        bounded,
        setTempo
      )
    } else if (action.type === 'tapTempo') {
      tapTempo()
    }
  }

  // OSC maps like absolute CC: 0..1 (or MIDI-scaled) into the slider range.
  // Relative CC mode still works if a sender encodes deltas the MIDI way.
  if (options.type === 'cc' && options.mode === 'relative') {
    const delta = (normalized - 0.5) * 2 * range
    setNewVal(getOldVal() + delta)
    return
  }

  setNewVal(options.min + normalized * range)
}
