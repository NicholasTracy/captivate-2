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
import { getActivePerformanceRoutes } from './performanceRouteApply'
import type { CleanReduxState } from './store'
import type { RealtimeState } from './realtimeStore'

export {
  applyPerformanceRouteToControlState,
  getActivePerformanceRoute,
  getActivePerformanceRoutes,
  midiActionLabel,
  autoLabelForRoute,
  isContinuousPerformanceRoute,
  readPerformanceRoutes,
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
  const routes = getActivePerformanceRoutes(state.control, controlId)
  if (!routes.some((route) => route.type === 'setBpm')) return
  const bpm = mapPerformanceValueToBpm(clampNormalized(value))
  if (setTempo) {
    setTempo(bpm)
  } else {
    send_user_command({ type: 'SetBPM', bpm })
  }
}

const padResetTimers = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * Fire a performance pad: value → 1, apply every continuous route on the
 * active scene, then every button route on that scene. Briefly resets to 0.
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
  const routes = getActivePerformanceRoutes(state.control, controlId)
  let sentBpm = false
  for (const route of routes) {
    if (route.type === 'setBpm') {
      if (sentBpm) continue
      sentBpm = true
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
      // Note and OSC outs follow the pad back to 0. Destinations stay at the
      // value the press wrote; releasing the pad must not zero master or params.
      dispatch(
        setPerformanceControlValue({
          id: controlId,
          value: 0,
          applyRoutes: false,
        })
      )
    }, 120)
  )
}
