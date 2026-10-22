import type { PayloadAction } from '@reduxjs/toolkit'
import { clampNormalized } from '../../math/util'
import { send_user_command } from '../ipcHandler'
import {
  firePerformancePad,
  setPerformanceControlValue,
} from './controlSlice'
import {
  buttonMidiActionTypes,
  getMidiSliderBounds,
} from './deviceState'
import { fireMidiButtonAction } from './fireMidiButtonAction'
import { getActivePerformanceRoute } from './performanceRouteApply'
import type { CleanReduxState } from './store'
import type { RealtimeState } from './realtimeStore'

export {
  applyPerformanceRouteToControlState,
  getActivePerformanceRoute,
  midiActionLabel,
  autoLabelForRoute,
  isContinuousPerformanceRoute,
} from './performanceRouteApply'

function mapPerformanceValueToBpm(value: number): number {
  const bounds = getMidiSliderBounds({ type: 'setBpm' })
  const t = clampNormalized(value)
  return bounds.defaultMin + t * (bounds.defaultMax - bounds.defaultMin)
}

type DispatchFn = (action: PayloadAction<unknown>) => void

/**
 * Update a performance control value and apply the active scene route.
 * Continuous destinations apply in-reducer; setBpm uses setTempo or user_command.
 */
export function commitPerformanceValue(
  dispatch: DispatchFn,
  getState: () => CleanReduxState,
  controlId: string,
  value: number,
  setTempo?: (bpm: number) => void
): void {
  dispatch(setPerformanceControlValue({ id: controlId, value }))
  const state = getState()
  const route = getActivePerformanceRoute(state.control, controlId)
  if (!route || route.type !== 'setBpm') return
  const bpm = mapPerformanceValueToBpm(clampNormalized(value))
  if (setTempo) {
    setTempo(bpm)
  } else {
    send_user_command({ type: 'SetBPM', bpm })
  }
}

const padResetTimers = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * Fire a performance pad: value → 1, apply continuous route if any, then
 * button destinations via fireMidiButtonAction. Briefly resets value to 0.
 */
export function commitPerformancePad(
  dispatch: DispatchFn,
  getState: () => CleanReduxState,
  controlId: string,
  tapTempo: () => void,
  rt_state: RealtimeState,
  setTempo?: (bpm: number) => void
): void {
  dispatch(firePerformancePad(controlId))
  const state = getState()
  const route = getActivePerformanceRoute(state.control, controlId)
  if (route) {
    if (route.type === 'setBpm') {
      if (setTempo) {
        setTempo(mapPerformanceValueToBpm(1))
      } else {
        send_user_command({ type: 'SetBPM', bpm: mapPerformanceValueToBpm(1) })
      }
    } else if (buttonMidiActionTypes.has(route.type)) {
      fireMidiButtonAction(dispatch, state, rt_state, route, tapTempo)
    }
  }

  const prev = padResetTimers.get(controlId)
  if (prev !== undefined) clearTimeout(prev)
  padResetTimers.set(
    controlId,
    setTimeout(() => {
      padResetTimers.delete(controlId)
      dispatch(setPerformanceControlValue({ id: controlId, value: 0 }))
    }, 120)
  )
}
