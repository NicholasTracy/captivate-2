import {
  buildControlBusSnapshot,
  CONTROL_BUS_HEARTBEAT_ADDRESSES,
  CONTROL_BUS_HEARTBEAT_MS,
  CONTROL_BUS_PUBLISH_HZ,
  controlBusValuesEqual,
  flattenControlBusAddresses,
  isLocalhostHost,
  type ControlBusSnapshot,
} from '../../shared/controlBus'
import {
  clampOscPort,
  DEFAULT_OSC_SEND_HOST,
  DEFAULT_OSC_SEND_PORT,
  encodeOscMessage,
} from '../../shared/osc'
import type { CleanReduxState } from '../../renderer/redux/store'
import type { RealtimeState } from '../../renderer/redux/realtimeStore'
import type { OscConnections } from '../../shared/connection'
import * as OscConnection from './oscConnection'
import * as MidiOutputConnection from './midiOutputConnection'
import {
  getActionID,
  getMidiSliderBounds,
  getSetBaseParamSplitIndex,
  type MidiOutBinding,
} from '../../renderer/redux/deviceState'
import { getGroupIntensityLevel } from '../../shared/groupIntensity'

const PUBLISH_INTERVAL_MS = 1000 / CONTROL_BUS_PUBLISH_HZ

let _lastPublishAtMs = 0
let _lastOscValues: { [address: string]: number } = {}
let _lastHeartbeatAtMs = 0
let _lastMidiCcByKey: { [key: string]: number } = {}
let _lastMidiNoteByKey: { [key: string]: number } = {}
let _lastClockTickAtMs = 0
let _lastPlaying: boolean | null = null
let _lastOscStatusKey = ''

export function resetControlBusPublishState(): void {
  _lastPublishAtMs = 0
  _lastOscValues = {}
  _lastHeartbeatAtMs = 0
  _lastMidiCcByKey = {}
  _lastMidiNoteByKey = {}
  _lastClockTickAtMs = 0
  _lastPlaying = null
  _lastOscStatusKey = ''
}

export function publishControlBusTick(
  controlState: CleanReduxState | null,
  realtimeState: RealtimeState,
  onOscStatus?: (status: OscConnections) => void
): void {
  if (controlState === null) return

  const now = performance.now()
  if (_lastPublishAtMs > 0 && now - _lastPublishAtMs < PUBLISH_INTERVAL_MS) {
    // Still emit MIDI clock at high rate when enabled.
    maybeSendMidiClock(controlState, realtimeState, now)
    return
  }
  _lastPublishAtMs = now

  const snapshot = buildControlBusSnapshot(controlState, realtimeState)
  publishOsc(controlState, snapshot, now, onOscStatus)
  publishMidiOutMappings(controlState, snapshot, realtimeState)
  maybeSendMidiClock(controlState, realtimeState, now)
}

function publishOsc(
  controlState: CleanReduxState,
  snapshot: ControlBusSnapshot,
  nowMs: number,
  onOscStatus?: (status: OscConnections) => void
): void {
  const settings = controlState.control.device.connectionSettings
  const sendEnabled = settings.oscSendEnabled === true
  const sendHost =
    typeof settings.oscSendHost === 'string' && settings.oscSendHost.trim()
      ? settings.oscSendHost.trim()
      : DEFAULT_OSC_SEND_HOST
  const sendPort = clampOscPort(
    typeof settings.oscSendPort === 'number'
      ? settings.oscSendPort
      : DEFAULT_OSC_SEND_PORT
  )
  const listenEnabled = settings.oscEnabled === true
  const listenPort = clampOscPort(
    typeof settings.oscPort === 'number' ? settings.oscPort : 9000
  )

  let sendError: string | null = null
  let sending = false

  if (sendEnabled) {
    if (
      listenEnabled &&
      isLocalhostHost(sendHost) &&
      sendPort === listenPort
    ) {
      sendError =
        'OSC send blocked: destination equals local listen port (loop guard)'
    } else {
      sending = true
      const flat = flattenControlBusAddresses(snapshot)
      const heartbeatDue =
        _lastHeartbeatAtMs === 0 || nowMs - _lastHeartbeatAtMs >= CONTROL_BUS_HEARTBEAT_MS
      if (heartbeatDue) {
        _lastHeartbeatAtMs = nowMs
      }

      for (const [address, value] of Object.entries(flat)) {
        const prev = _lastOscValues[address]
        const isHeartbeat = (
          CONTROL_BUS_HEARTBEAT_ADDRESSES as readonly string[]
        ).includes(address)
        const changed =
          prev === undefined || !controlBusValuesEqual(prev, value)
        if (!changed && !(heartbeatDue && isHeartbeat)) continue
        _lastOscValues[address] = value
        const isInt =
          address === '/captivate/scene/light' ||
          address === '/captivate/time/playing' ||
          address === '/captivate/blackout' ||
          address === '/captivate/audio/beat'
        const buffer = encodeOscMessage(address, [
          isInt
            ? { type: 'i', value: Math.round(value) }
            : { type: 'f', value },
        ])
        OscConnection.sendTo(sendHost, sendPort, buffer)
      }
    }
  } else {
    _lastOscValues = {}
  }

  const listenStatus = OscConnection.getLastStatus()
  const nextStatus: OscConnections = {
    ...listenStatus,
    sendEnabled,
    sendHost,
    sendPort,
    sending: sendEnabled && sending && !sendError,
    sendError,
  }
  const statusKey = JSON.stringify({
    e: nextStatus.enabled,
    l: nextStatus.listening,
    p: nextStatus.port,
    err: nextStatus.error,
    se: nextStatus.sendEnabled,
    sh: nextStatus.sendHost,
    sp: nextStatus.sendPort,
    sg: nextStatus.sending,
    serr: nextStatus.sendError,
  })
  if (statusKey !== _lastOscStatusKey) {
    _lastOscStatusKey = statusKey
    onOscStatus?.(nextStatus)
  }
}

function resolveMidiOutNormalizedValue(
  binding: MidiOutBinding,
  controlState: CleanReduxState,
  snapshot: ControlBusSnapshot,
  realtimeState: RealtimeState
): number | null {
  const action = binding.action
  const bounds = getMidiSliderBounds(action)
  let raw = 0

  if (action.type === 'setMaster') {
    raw = snapshot.master
  } else if (action.type === 'setBpm') {
    raw = snapshot.time.bpm
  } else if (action.type === 'setAutoSceneBombacity') {
    raw = controlState.control.light.auto.epicness
  } else if (action.type === 'setGroupIntensity') {
    raw = getGroupIntensityLevel(
      controlState.control.groupIntensity,
      action.group
    )
  } else if (action.type === 'setBaseParam') {
    const splitIndex = getSetBaseParamSplitIndex(action)
    const fromOutput =
      realtimeState.splitStates[splitIndex]?.outputParams?.[action.paramKey]
    if (typeof fromOutput === 'number' && Number.isFinite(fromOutput)) {
      raw = fromOutput
    } else {
      raw =
        controlState.control.light.byId[controlState.control.light.active]
          ?.splitScenes[splitIndex]?.baseParams[action.paramKey] ?? 0.5
    }
  } else if (action.type === 'setPerformanceValue') {
    raw =
      controlState.control.performance.controls[action.controlId]?.value ?? 0
  } else {
    return null
  }

  const min = bounds.defaultMin
  const max = bounds.defaultMax
  if (max <= min) return 0
  return Math.min(1, Math.max(0, (raw - min) / (max - min)))
}

function resolveMidiOutNoteOn(
  binding: MidiOutBinding,
  controlState: CleanReduxState,
  snapshot: ControlBusSnapshot
): boolean | null {
  const action = binding.action
  if (action.type === 'toggleBlackout') {
    return snapshot.blackout
  }
  if (action.type === 'setActivePage') {
    return controlState.gui.activePage === action.page
  }
  if (action.type === 'toggleAutoScene') {
    if (action.sceneType === 'light') {
      return controlState.control.light.auto.enabled === true
    }
    return controlState.control.visual.auto.enabled === true
  }
  if (action.type === 'setActiveSceneIndex') {
    const scenes =
      action.sceneType === 'light'
        ? controlState.control.light
        : controlState.control.visual
    const activeIndex = scenes.ids.indexOf(scenes.active)
    return activeIndex === action.index
  }
  return null
}

function publishMidiOutMappings(
  controlState: CleanReduxState,
  snapshot: ControlBusSnapshot,
  realtimeState: RealtimeState
): void {
  if (!MidiOutputConnection.hasOpenOutput()) {
    _lastMidiCcByKey = {}
    _lastMidiNoteByKey = {}
    return
  }

  const actions = controlState.control.device.midiOutActions ?? {}
  for (const binding of Object.values(actions)) {
    if (!binding) continue
    const key = `${getActionID(binding.action)}:${binding.channel}:${binding.cc}:${binding.type}`

    if (binding.type === 'cc') {
      const normalized = resolveMidiOutNormalizedValue(
        binding,
        controlState,
        snapshot,
        realtimeState
      )
      if (normalized === null) continue
      const ccValue = Math.min(127, Math.max(0, Math.round(normalized * 127)))
      if (_lastMidiCcByKey[key] === ccValue) continue
      _lastMidiCcByKey[key] = ccValue
      const status = 0xb0 | (binding.channel & 0x0f)
      MidiOutputConnection.sendToAllOpenOutputs([
        status,
        binding.cc & 0x7f,
        ccValue,
      ])
      continue
    }

    if (binding.type === 'note') {
      const on = resolveMidiOutNoteOn(binding, controlState, snapshot)
      if (on === null) continue
      const velocity = on ? 127 : 0
      if (_lastMidiNoteByKey[key] === velocity) continue
      _lastMidiNoteByKey[key] = velocity
      if (velocity > 0) {
        const status = 0x90 | (binding.channel & 0x0f)
        MidiOutputConnection.sendToAllOpenOutputs([
          status,
          binding.cc & 0x7f,
          velocity,
        ])
      } else {
        const status = 0x80 | (binding.channel & 0x0f)
        MidiOutputConnection.sendToAllOpenOutputs([
          status,
          binding.cc & 0x7f,
          0,
        ])
      }
    }
  }
}

function maybeSendMidiClock(
  controlState: CleanReduxState,
  realtimeState: RealtimeState,
  nowMs: number
): void {
  const settings = controlState.control.device.connectionSettings
  if (settings.midiClockOutEnabled !== true) {
    _lastPlaying = realtimeState.time.isPlaying === true
    _lastClockTickAtMs = 0
    return
  }
  // Loop guard: never emit clock while following MIDI clock in.
  if (settings.midiClockBpmEnabled === true) {
    return
  }
  if (!MidiOutputConnection.hasOpenOutput()) {
    return
  }

  const playing = realtimeState.time.isPlaying === true
  if (_lastPlaying === null) {
    _lastPlaying = playing
  } else if (playing !== _lastPlaying) {
    MidiOutputConnection.sendToAllOpenOutputs([playing ? 0xfa : 0xfc])
    _lastPlaying = playing
    _lastClockTickAtMs = nowMs
  }

  if (!playing) return

  const bpm = realtimeState.time.bpm
  if (!Number.isFinite(bpm) || bpm < 20 || bpm > 400) return

  // 24 PPQ: interval between 0xF8 ticks = 60000 / (bpm * 24) ms
  const tickIntervalMs = 60000 / (bpm * 24)
  if (_lastClockTickAtMs === 0) {
    _lastClockTickAtMs = nowMs
    MidiOutputConnection.sendToAllOpenOutputs([0xf8])
    return
  }

  let elapsed = nowMs - _lastClockTickAtMs
  // Catch up a few ticks if we fell behind, but avoid flooding.
  let sent = 0
  while (elapsed >= tickIntervalMs && sent < 8) {
    MidiOutputConnection.sendToAllOpenOutputs([0xf8])
    _lastClockTickAtMs += tickIntervalMs
    elapsed -= tickIntervalMs
    sent++
  }
}
