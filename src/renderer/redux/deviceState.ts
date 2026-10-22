import type { Page } from '../../shared/pages'
import { PayloadAction } from '@reduxjs/toolkit'
import { DefaultParam } from '../../shared/params'
import { SceneType } from '../../shared/Scenes'
import { ConnectionId } from '../../shared/connection'
import { DMX_MAX_UNIVERSES } from '../../shared/dmxFixtures'
import {
  AudioInputSettings,
  initAudioInputSettings,
  normalizeAudioInputSettings,
} from '../../shared/audioEngine'
import {
  AtmosFxtrConfig,
  AtmosLevelChConfig,
  AtmosSettings,
  AtmosTrigChConfig,
  initAtmosFxtrControlConfig,
  initAtmosLevelChConfig,
  initAtmosSettings,
  initAtmosTriggerChConfig,
  normAtmosLevelChConfig,
  normAtmosSettings,
  normAtmosFxtrControlConfig,
  normAtmosTriggerChConfig,
} from '../../shared/atmospherics'
import {
  clampOscPort,
  DEFAULT_OSC_PORT,
  DEFAULT_OSC_SEND_HOST,
  DEFAULT_OSC_SEND_PORT,
} from '../../shared/osc'
import {
  normalizeLinkRole,
  type LinkRole,
} from '../../shared/controlBus'

export type { LinkRole }

interface Range {
  min: number
  max: number
}
interface SliderControl_cc extends Range {
  type: 'cc'
  mode: 'absolute' | 'relative'
}
interface SliderControl_note extends Range {
  type: 'note'
  value: 'velocity' | 'max'
  mode: 'toggle' | 'hold'
}
export type SliderControlOptions = SliderControl_cc | SliderControl_note

export interface MidiSliderBounds {
  min: number
  max: number
  defaultMin: number
  defaultMax: number
}

function clampToRange(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

interface SetActiveSceneIndex {
  type: 'setActiveSceneIndex'
  sceneType: SceneType
  index: number
}

interface SetAutoSceneBombacity {
  type: 'setAutoSceneBombacity'
}

interface SetMaster {
  type: 'setMaster'
}
interface SetBpm {
  type: 'setBpm'
}
interface SetGroupIntensity {
  type: 'setGroupIntensity'
  group: string
}

export function makeSetGroupIntensityAction(group: string): SetGroupIntensity {
  return { type: 'setGroupIntensity', group }
}

interface SetBaseParam {
  type: 'setBaseParam'
  paramKey: DefaultParam | string
  /** Omit or 0 for split 0 (legacy MIDI action IDs omit the index). */
  splitIndex?: number
}

export function makeSetBaseParamAction(
  splitIndex: number,
  paramKey: DefaultParam | string
): SetBaseParam {
  return { type: 'setBaseParam', splitIndex, paramKey }
}

export function getSetBaseParamSplitIndex(action: SetBaseParam): number {
  return action.splitIndex ?? 0
}

interface TapTempo {
  type: 'tapTempo'
}

interface ToggleAutoScene {
  type: 'toggleAutoScene'
  sceneType: SceneType
}

interface ToggleBlackout {
  type: 'toggleBlackout'
}
interface TriggerAtmosFixture {
  type: 'triggerAtmosFixture'
  fixtureId: string
}

interface SetActivePageAction {
  type: 'setActivePage'
  page: Page
}

/** MIDI/OSC/slider learn target → performance bank control value (0..1). */
interface SetPerformanceValue {
  type: 'setPerformanceValue'
  controlId: string
}

/** Pad/button learn target → fire a performance bank pad. */
interface FirePerformancePad {
  type: 'firePerformancePad'
  controlId: string
}

interface ConnectionSettings {
  openDmxRefreshRateHz: number
  universeCount: number
  dmxUniverseByDevice: { [connectionId: string]: number }
  /**
   * When true for a USB DMX `connectionId`, skip Enttec auto-probe and always use the
   * USB Pro / widget-framed protocol (same wire format as Enttec DMX USB Pro and Euro Light USB Pro).
   * Use for FTDI-based clones that output DMX with that framing but do not answer widget queries.
   */
  dmxUsbUseWidgetProtocolByDevice?: { [connectionId: string]: boolean }
  artNetIpByUniverse: { [universe: number]: string }
  audioInput: AudioInputSettings
  /** Follow MIDI timing clock (0xF8) from enabled MIDI inputs for master BPM. */
  midiClockBpmEnabled: boolean
  /** Emit MIDI timing clock (0xF8) + start/stop on enabled MIDI outputs. */
  midiClockOutEnabled: boolean
  /** Listen for Open Sound Control (UDP) on `oscPort`. Off by default. */
  oscEnabled: boolean
  /** UDP port for OSC input when `oscEnabled` is true. */
  oscPort: number
  /** Auto-publish control-bus namespace over OSC UDP. Off by default. */
  oscSendEnabled: boolean
  /** Destination host for OSC auto-publish. */
  oscSendHost: string
  /** Destination UDP port for OSC auto-publish (default 9001). */
  oscSendPort: number
  /** Join an Ableton Link session for wireless tempo sync. Off by default. */
  linkEnabled: boolean
  /** When Link is on, follow other Link apps' transport when supported. */
  linkStartStopSyncEnabled: boolean
  /**
   * Tempo authorship in a Link session:
   * - full: Captivate both follows peers and may push local tempo (default)
   * - leader: Captivate pushes tempo; still uses Link beats/phase
   * - follow: only Link session tempo drives BPM (UI/MIDI/OSC/audio clock do not setTempo)
   */
  linkRole: LinkRole
  atmos: AtmosSettings
}

export const buttonMidiActionTypes: Set<MidiAction['type']> = new Set([
  'setActiveSceneIndex',
  'tapTempo',
  'toggleAutoScene',
  'toggleBlackout',
  'triggerAtmosFixture',
  'setActivePage',
  'firePerformancePad',
])

export type MidiAction =
  | SetActiveSceneIndex
  | SetAutoSceneBombacity
  | SetMaster
  | SetBaseParam
  | SetBpm
  | SetGroupIntensity
  | TapTempo
  | ToggleAutoScene
  | ToggleBlackout
  | TriggerAtmosFixture
  | SetActivePageAction
  | SetPerformanceValue
  | FirePerformancePad

/** Slider-style actions published as MIDI CC out. */
export const midiOutSliderActionTypes: Set<MidiAction['type']> = new Set([
  'setMaster',
  'setBaseParam',
  'setBpm',
  'setGroupIntensity',
  'setAutoSceneBombacity',
  'setPerformanceValue',
])

/** Stateful button actions published as MIDI note on/off out. */
export const midiOutNoteActionTypes: Set<MidiAction['type']> = new Set([
  'toggleBlackout',
  'setActiveSceneIndex',
  'setActivePage',
  'toggleAutoScene',
])

export function supportsMidiOut(action: MidiAction): boolean {
  return (
    midiOutSliderActionTypes.has(action.type) ||
    midiOutNoteActionTypes.has(action.type)
  )
}

export function midiOutBindingKind(
  action: MidiAction
): 'cc' | 'note' | null {
  if (midiOutSliderActionTypes.has(action.type)) return 'cc'
  if (midiOutNoteActionTypes.has(action.type)) return 'note'
  return null
}

export interface MidiOutBinding {
  action: MidiAction
  channel: number
  /** CC number (0–127) when type is `cc`; note number when type is `note`. */
  cc: number
  type: 'cc' | 'note'
}

export function clampMidiChannel(channel: number): number {
  if (!Number.isFinite(channel)) return 0
  return Math.min(15, Math.max(0, Math.round(channel)))
}

export function clampMidiCc(cc: number): number {
  if (!Number.isFinite(cc)) return 0
  return Math.min(127, Math.max(0, Math.round(cc)))
}

/** Next unused CC/note on a channel among existing out bindings. */
export function nextFreeMidiOutNumber(
  actions: { [actionID: string]: MidiOutBinding },
  type: 'cc' | 'note',
  channel = 0
): number {
  const used = new Set<number>()
  for (const binding of Object.values(actions)) {
    if (
      binding &&
      binding.type === type &&
      clampMidiChannel(binding.channel) === channel
    ) {
      used.add(clampMidiCc(binding.cc))
    }
  }
  for (let i = 0; i < 128; i++) {
    if (!used.has(i)) return i
  }
  return 0
}

export function normalizeMidiOutBinding(
  raw: Partial<MidiOutBinding> | undefined,
  fallbackAction?: MidiAction
): MidiOutBinding | null {
  if (!raw || typeof raw !== 'object') return null
  const action = (raw.action ?? fallbackAction) as MidiAction | undefined
  if (!action || typeof action.type !== 'string') return null
  const kind = midiOutBindingKind(action)
  if (!kind) return null
  return {
    action,
    channel: clampMidiChannel(Number(raw.channel)),
    cc: clampMidiCc(Number(raw.cc)),
    type: kind,
  }
}

export function getMidiSliderBounds(action: MidiAction): MidiSliderBounds {
  switch (action.type) {
    case 'setBpm':
      return {
        min: 1,
        max: 1000,
        defaultMin: 60,
        defaultMax: 180,
      }
    default:
      return {
        min: 0,
        max: 1,
        defaultMin: 0,
        defaultMax: 1,
      }
  }
}
export function normalizeSliderOptionsForAction(
  action: MidiAction,
  options: SliderControlOptions
): SliderControlOptions {
  const bounds = getMidiSliderBounds(action)
  let min = Number.isFinite(options.min) ? Number(options.min) : bounds.defaultMin
  let max = Number.isFinite(options.max) ? Number(options.max) : bounds.defaultMax
  // Legacy saves stored all slider mappings in normalized [0..1] space.
  // For action-specific ranges (e.g. BPM), migrate those to sensible defaults.
  if ((bounds.min !== 0 || bounds.max !== 1) && min >= 0 && max <= 1) {
    min = bounds.defaultMin
    max = bounds.defaultMax
  }
  min = clampToRange(min, bounds.min, bounds.max)
  max = clampToRange(max, bounds.min, bounds.max)
  const normalizedMin = Math.min(min, max)
  const normalizedMax = Math.max(min, max)
  if (options.type === 'cc') {
    return {
      type: 'cc',
      min: normalizedMin,
      max: normalizedMax,
      mode: options.mode === 'relative' ? 'relative' : 'absolute',
    }
  }
  return {
    type: 'note',
    min: normalizedMin,
    max: normalizedMax,
    mode: options.mode === 'toggle' ? 'toggle' : 'hold',
    value: options.value === 'max' ? 'max' : 'velocity',
  }
}
export function initSliderOptions(
  action: MidiAction,
  type: 'cc' | 'note'
): SliderControlOptions {
  const bounds = getMidiSliderBounds(action)
  if (type === 'cc') {
    return {
      type: 'cc',
      min: bounds.defaultMin,
      max: bounds.defaultMax,
      mode: 'absolute',
    }
  }
  return {
    type: 'note',
    min: bounds.defaultMin,
    max: bounds.defaultMax,
    value: 'velocity',
    mode: 'hold',
  }
}

// must uniquely identify an action (for use in a hash table)
// does not need to be human readable. Just unique for a given action
export function getActionID(action: MidiAction) {
  if (action.type === 'setActiveSceneIndex') {
    return action.type + action.sceneType + action.index.toString()
  }
  if (action.type === 'setBaseParam') {
    const splitIndex = getSetBaseParamSplitIndex(action)
    if (splitIndex === 0) {
      return action.type + action.paramKey
    }
    return `${action.type}${splitIndex}:${action.paramKey}`
  }
  if (action.type === 'setGroupIntensity') {
    return action.type + action.group.toLowerCase()
  }
  if (action.type === 'triggerAtmosFixture') {
    return action.type + action.fixtureId
  }
  if (action.type === 'toggleAutoScene') {
    return action.type + action.sceneType
  }
  if (action.type === 'setActivePage') {
    return action.type + action.page
  }
  if (action.type === 'setPerformanceValue' || action.type === 'firePerformancePad') {
    return action.type + action.controlId
  }
  return action.type
}

export function findKeyboardChordIdForAction(
  shortcuts: DeviceState['keyboardShortcuts'],
  action: MidiAction
): string | null {
  const id = getActionID(action)
  for (const [cid, v] of Object.entries(shortcuts)) {
    if (getActionID(v.action) === id) return cid
  }
  return null
}

export interface ButtonAction {
  inputID: string
  action: MidiAction
}
export interface SliderAction extends ButtonAction {
  options: SliderControlOptions
}

// ActionID = setAutoSceneBombacity, setActiveSceneIndex0, etc.
// InputID = note70, cc50, etc.
export interface KeyboardShortcutBinding {
  action: MidiAction
}

export interface DeviceState {
  listening?: MidiAction
  isEditing: boolean
  /** When true, MIDI learn is off and overlays assign keyboard chords instead. */
  keyboardLearnMode: boolean
  /** When true, overlays assign MIDI CC/note + channel for output bindings. */
  midiOutLearnMode: boolean
  keyboardListening?: MidiAction
  keyboardShortcuts: { [chordId: string]: KeyboardShortcutBinding }
  connectable: {
    midi: ConnectionId[]
    midiOut: ConnectionId[]
    dmx: ConnectionId[]
    artNet: ConnectionId[]
  }
  connectionSettings: ConnectionSettings
  buttonActions: { [actionID: string]: ButtonAction }
  sliderActions: { [actionID: string]: SliderAction }
  /** Params/buttons published as MIDI CC or note on enabled output ports. */
  midiOutActions: { [actionID: string]: MidiOutBinding }
}

export function clampUniverseIndex(universe: number, maxUniverse: number) {
  if (!Number.isFinite(universe)) return 1
  const rounded = Math.round(universe)
  return Math.min(Math.max(1, rounded), maxUniverse)
}

function clampUniverseCount(universeCount: number) {
  return clampUniverseIndex(universeCount, DMX_MAX_UNIVERSES)
}

function clampDeviceUniverseAssignments(
  assignments: { [connectionId: string]: number },
  maxUniverse: number
) {
  const clamped: { [connectionId: string]: number } = {}
  for (const [connectionId, universe] of Object.entries(assignments)) {
    clamped[connectionId] = clampUniverseIndex(universe, maxUniverse)
  }
  return clamped
}

function clampArtNetRoutes(
  routes: { [universe: number]: string },
  maxUniverse: number
): { [universe: number]: string } {
  const clamped: { [universe: number]: string } = {}
  for (const [universeKey, ip] of Object.entries(routes)) {
    const parsedUniverse = Number(universeKey)
    if (!Number.isFinite(parsedUniverse)) continue

    const universe = clampUniverseIndex(parsedUniverse, maxUniverse)
    const normalizedIp = ip.trim()
    if (normalizedIp.length > 0) {
      clamped[universe] = normalizedIp
    }
  }
  return clamped
}

export function initDeviceState(): DeviceState {
  return {
    isEditing: false,
    keyboardLearnMode: false,
    midiOutLearnMode: false,
    keyboardShortcuts: {},
    buttonActions: {},
    sliderActions: {},
    midiOutActions: {},
    connectable: {
      midi: [],
      midiOut: [],
      dmx: [],
      artNet: [],
    },
    connectionSettings: {
      openDmxRefreshRateHz: 30,
      universeCount: 1,
      dmxUniverseByDevice: {},
      dmxUsbUseWidgetProtocolByDevice: {},
      artNetIpByUniverse: {},
      audioInput: initAudioInputSettings(),
      midiClockBpmEnabled: false,
      midiClockOutEnabled: false,
      oscEnabled: false,
      oscPort: DEFAULT_OSC_PORT,
      oscSendEnabled: false,
      oscSendHost: DEFAULT_OSC_SEND_HOST,
      oscSendPort: DEFAULT_OSC_SEND_PORT,
      linkEnabled: false,
      linkStartStopSyncEnabled: false,
      linkRole: 'full',
      atmos: initAtmosSettings(),
    },
  }
}

function withNormAtmos(state: DeviceState) {
  state.connectionSettings.atmos = normAtmosSettings(
    state.connectionSettings.atmos
  )
}

function findAtmosFxtr(
  state: DeviceState,
  fixtureId: string
): AtmosFxtrConfig | undefined {
  return state.connectionSettings.atmos.fixtures[fixtureId]
}

function ensureAtmosFxtrCfgMut(
  state: DeviceState,
  fixtureId: string
): AtmosFxtrConfig {
  const existing = findAtmosFxtr(state, fixtureId)
  if (existing !== undefined) {
    return existing
  }
  const created = initAtmosFxtrControlConfig(fixtureId)
  state.connectionSettings.atmos.fixtures[fixtureId] = created
  return created
}

function ensureAtmosTrigChMut(
  fixture: AtmosFxtrConfig,
  channelNumber: number
): AtmosTrigChConfig {
  const existing = fixture.triggerChannels[channelNumber]
  if (existing !== undefined) {
    return existing
  }
  const fallback = initAtmosTriggerChConfig(channelNumber)
  fallback.threshold = fixture.threshold
  fallback.triggerAction = fixture.triggerAction
  fallback.delayMs = fixture.delayMs
  fallback.intervalMs = fixture.intervalMs
  fallback.pulseMs = fixture.pulseMs
  fallback.manualDelayMs = fixture.manualDelayMs
  fallback.manualIntervalMs = fixture.manualIntervalMs
  fixture.triggerChannels[channelNumber] = fallback
  return fallback
}

function ensureAtmosLevelChMut(
  fixture: AtmosFxtrConfig,
  channelNumber: number
): AtmosLevelChConfig {
  const existing = fixture.levelChannels[channelNumber]
  if (existing !== undefined) {
    return existing
  }
  const fallback = initAtmosLevelChConfig(channelNumber)
  fixture.levelChannels[channelNumber] = fallback
  return fallback
}

export const midiActions = {
  setButtonAction: (
    state: DeviceState,
    { payload }: PayloadAction<{ inputID: string; action: MidiAction }>
  ) => {
    clearInputID(state, payload.inputID)
    state.buttonActions[getActionID(payload.action)] = payload
  },
  setSliderAction: (
    state: DeviceState,
    {
      payload,
    }: PayloadAction<{
      inputID: string
      action: MidiAction
      options: SliderControlOptions
    }>
  ) => {
    clearInputID(state, payload.inputID)
    state.sliderActions[getActionID(payload.action)] = {
      ...payload,
      options: normalizeSliderOptionsForAction(payload.action, payload.options),
    }
  },
  removeMidiAction: (
    state: DeviceState,
    { payload }: PayloadAction<MidiAction>
  ) => {
    const actionId = getActionID(payload)
    delete state.buttonActions[actionId]
    delete state.sliderActions[actionId]
    for (const [cid, v] of Object.entries(state.keyboardShortcuts)) {
      if (getActionID(v.action) === actionId) {
        delete state.keyboardShortcuts[cid]
      }
    }
  },
  listen: (state: DeviceState, { payload }: PayloadAction<MidiAction>) => {
    state.listening = payload
    state.keyboardLearnMode = false
    state.midiOutLearnMode = false
    delete state.keyboardListening
  },
  keyboardListen: (state: DeviceState, { payload }: PayloadAction<MidiAction>) => {
    state.keyboardListening = payload
    state.keyboardLearnMode = true
    state.midiOutLearnMode = false
    delete state.listening
  },
  clearKeyboardListening: (state: DeviceState) => {
    delete state.keyboardListening
  },
  setKeyboardLearnMode: (state: DeviceState, { payload }: PayloadAction<boolean>) => {
    state.keyboardLearnMode = payload === true
    if (!state.keyboardLearnMode) {
      delete state.keyboardListening
    }
    if (state.keyboardLearnMode) {
      state.isEditing = false
      state.midiOutLearnMode = false
      delete state.listening
    }
  },
  setMidiOutLearnMode: (
    state: DeviceState,
    { payload }: PayloadAction<boolean>
  ) => {
    state.midiOutLearnMode = payload === true
    if (state.midiOutLearnMode) {
      state.isEditing = false
      state.keyboardLearnMode = false
      delete state.listening
      delete state.keyboardListening
    }
  },
  setMidiOutAction: (
    state: DeviceState,
    { payload }: PayloadAction<MidiOutBinding>
  ) => {
    const normalized = normalizeMidiOutBinding(payload)
    if (!normalized) return
    state.midiOutActions[getActionID(normalized.action)] = normalized
  },
  removeMidiOutAction: (
    state: DeviceState,
    { payload }: PayloadAction<MidiAction>
  ) => {
    delete state.midiOutActions[getActionID(payload)]
  },
  setKeyboardShortcut: (
    state: DeviceState,
    { payload }: PayloadAction<{ chordId: string; action: MidiAction }>
  ) => {
    const aid = getActionID(payload.action)
    for (const [cid, v] of Object.entries(state.keyboardShortcuts)) {
      if (getActionID(v.action) === aid) {
        delete state.keyboardShortcuts[cid]
      }
    }
    state.keyboardShortcuts[payload.chordId] = { action: payload.action }
    delete state.keyboardListening
  },
  removeKeyboardChord: (state: DeviceState, { payload }: PayloadAction<string>) => {
    delete state.keyboardShortcuts[payload]
  },
  clearButtonMapping: (state: DeviceState, { payload }: PayloadAction<MidiAction>) => {
    const id = getActionID(payload)
    delete state.buttonActions[id]
    for (const [cid, v] of Object.entries(state.keyboardShortcuts)) {
      if (getActionID(v.action) === id) {
        delete state.keyboardShortcuts[cid]
      }
    }
  },
  setIsEditing: (state: DeviceState, { payload }: PayloadAction<boolean>) => {
    delete state.listening
    state.isEditing = payload
    state.keyboardLearnMode = false
    state.midiOutLearnMode = false
    delete state.keyboardListening
  },
  setMidiConnectable: (
    state: DeviceState,
    { payload }: PayloadAction<ConnectionId[]>
  ) => {
    state.connectable.midi = payload
  },
  setMidiOutConnectable: (
    state: DeviceState,
    { payload }: PayloadAction<ConnectionId[]>
  ) => {
    state.connectable.midiOut = payload
  },
  setDmxConnectable: (
    state: DeviceState,
    { payload }: PayloadAction<ConnectionId[]>
  ) => {
    state.connectable.dmx = payload
  },
  setArtNetConnectable: (
    state: DeviceState,
    { payload }: PayloadAction<ConnectionId[]>
  ) => {
    state.connectable.artNet = payload
  },
  setOpenDmxRefreshRateHz: (
    state: DeviceState,
    { payload }: PayloadAction<number>
  ) => {
    state.connectionSettings.openDmxRefreshRateHz = payload
  },
  setUniverseCount: (
    state: DeviceState,
    { payload }: PayloadAction<number>
  ) => {
    const universeCount = clampUniverseCount(payload)
    state.connectionSettings.universeCount = universeCount
    state.connectionSettings.dmxUniverseByDevice = clampDeviceUniverseAssignments(
      state.connectionSettings.dmxUniverseByDevice,
      universeCount
    )
    state.connectionSettings.artNetIpByUniverse = clampArtNetRoutes(
      state.connectionSettings.artNetIpByUniverse,
      universeCount
    )
  },
  setDmxDeviceUniverse: (
    state: DeviceState,
    {
      payload,
    }: PayloadAction<{ connectionId: ConnectionId; universe: number }>
  ) => {
    state.connectionSettings.dmxUniverseByDevice[payload.connectionId] =
      clampUniverseIndex(
        payload.universe,
        state.connectionSettings.universeCount
      )
  },
  setDmxUsbWidgetProtocol: (
    state: DeviceState,
    {
      payload,
    }: PayloadAction<{ connectionId: ConnectionId; useWidgetProtocol: boolean }>
  ) => {
    if (!state.connectionSettings.dmxUsbUseWidgetProtocolByDevice) {
      state.connectionSettings.dmxUsbUseWidgetProtocolByDevice = {}
    }
    const m = state.connectionSettings.dmxUsbUseWidgetProtocolByDevice
    if (payload.useWidgetProtocol) {
      m[payload.connectionId] = true
    } else {
      delete m[payload.connectionId]
    }
  },
  setArtNetUniverseRoute: (
    state: DeviceState,
    { payload }: PayloadAction<{ universe: number; ip: string }>
  ) => {
    const universe = clampUniverseIndex(
      payload.universe,
      state.connectionSettings.universeCount
    )
    const ip = payload.ip.trim()
    if (ip.length === 0) {
      delete state.connectionSettings.artNetIpByUniverse[universe]
    } else {
      state.connectionSettings.artNetIpByUniverse[universe] = ip
    }
  },
  setAudioInputEnabled: (
    state: DeviceState,
    { payload }: PayloadAction<boolean>
  ) => {
    const current = normalizeAudioInputSettings(state.connectionSettings.audioInput)
    state.connectionSettings.audioInput = {
      ...current,
      enabled: payload === true,
    }
  },
  setAudioInputDeviceId: (
    state: DeviceState,
    { payload }: PayloadAction<string>
  ) => {
    const current = normalizeAudioInputSettings(state.connectionSettings.audioInput)
    state.connectionSettings.audioInput = {
      ...current,
      deviceId: typeof payload === 'string' ? payload.trim() : '',
    }
  },
  setAudioInputGain: (
    state: DeviceState,
    { payload }: PayloadAction<number>
  ) => {
    const current = normalizeAudioInputSettings(state.connectionSettings.audioInput)
    state.connectionSettings.audioInput = {
      ...current,
      inputGain: normalizeAudioInputSettings({
        ...current,
        inputGain: payload,
      }).inputGain,
    }
  },
  setAudioInputAutoGainControl: (
    state: DeviceState,
    { payload }: PayloadAction<boolean>
  ) => {
    const current = normalizeAudioInputSettings(state.connectionSettings.audioInput)
    state.connectionSettings.audioInput = {
      ...current,
      autoGainControl: payload === true,
    }
  },
  setAudioBeatClockEnabled: (
    state: DeviceState,
    { payload }: PayloadAction<boolean>
  ) => {
    const current = normalizeAudioInputSettings(state.connectionSettings.audioInput)
    state.connectionSettings.audioInput = {
      ...current,
      useBeatClock: payload === true,
    }
    if (payload === true) {
      state.connectionSettings.midiClockBpmEnabled = false
    }
  },
  setMidiClockBpmEnabled: (
    state: DeviceState,
    { payload }: PayloadAction<boolean>
  ) => {
    state.connectionSettings.midiClockBpmEnabled = payload === true
    if (payload === true) {
      const current = normalizeAudioInputSettings(state.connectionSettings.audioInput)
      state.connectionSettings.audioInput = {
        ...current,
        useBeatClock: false,
      }
      // Avoid MIDI clock feedback loops.
      state.connectionSettings.midiClockOutEnabled = false
    }
  },
  setMidiClockOutEnabled: (
    state: DeviceState,
    { payload }: PayloadAction<boolean>
  ) => {
    state.connectionSettings.midiClockOutEnabled = payload === true
    if (payload === true) {
      state.connectionSettings.midiClockBpmEnabled = false
    }
  },
  setOscEnabled: (
    state: DeviceState,
    { payload }: PayloadAction<boolean>
  ) => {
    state.connectionSettings.oscEnabled = payload === true
  },
  setOscPort: (state: DeviceState, { payload }: PayloadAction<number>) => {
    state.connectionSettings.oscPort = clampOscPort(payload)
  },
  setOscSendEnabled: (
    state: DeviceState,
    { payload }: PayloadAction<boolean>
  ) => {
    state.connectionSettings.oscSendEnabled = payload === true
  },
  setOscSendHost: (state: DeviceState, { payload }: PayloadAction<string>) => {
    state.connectionSettings.oscSendHost =
      typeof payload === 'string' && payload.trim().length > 0
        ? payload.trim()
        : DEFAULT_OSC_SEND_HOST
  },
  setOscSendPort: (state: DeviceState, { payload }: PayloadAction<number>) => {
    state.connectionSettings.oscSendPort = clampOscPort(payload)
  },
  setLinkEnabled: (state: DeviceState, { payload }: PayloadAction<boolean>) => {
    state.connectionSettings.linkEnabled = payload === true
  },
  setLinkStartStopSyncEnabled: (
    state: DeviceState,
    { payload }: PayloadAction<boolean>
  ) => {
    state.connectionSettings.linkStartStopSyncEnabled = payload === true
  },
  setLinkRole: (state: DeviceState, { payload }: PayloadAction<LinkRole>) => {
    state.connectionSettings.linkRole = normalizeLinkRole(payload)
  },
  setAudioBeatSensitivity: (
    state: DeviceState,
    { payload }: PayloadAction<number>
  ) => {
    const current = normalizeAudioInputSettings(state.connectionSettings.audioInput)
    state.connectionSettings.audioInput = {
      ...current,
      beatSensitivity: normalizeAudioInputSettings({
        ...current,
        beatSensitivity: payload,
      }).beatSensitivity,
    }
  },
  setAudioBeatMinIntervalMs: (
    state: DeviceState,
    { payload }: PayloadAction<number>
  ) => {
    const current = normalizeAudioInputSettings(state.connectionSettings.audioInput)
    state.connectionSettings.audioInput = {
      ...current,
      beatMinIntervalMs: normalizeAudioInputSettings({
        ...current,
        beatMinIntervalMs: payload,
      }).beatMinIntervalMs,
    }
  },
  setAudioBpmSmoothing: (
    state: DeviceState,
    { payload }: PayloadAction<number>
  ) => {
    const current = normalizeAudioInputSettings(state.connectionSettings.audioInput)
    state.connectionSettings.audioInput = {
      ...current,
      bpmSmoothing: normalizeAudioInputSettings({
        ...current,
        bpmSmoothing: payload,
      }).bpmSmoothing,
    }
  },
  setAudioEnergySmoothing: (
    state: DeviceState,
    { payload }: PayloadAction<number>
  ) => {
    const current = normalizeAudioInputSettings(state.connectionSettings.audioInput)
    state.connectionSettings.audioInput = {
      ...current,
      energySmoothing: normalizeAudioInputSettings({
        ...current,
        energySmoothing: payload,
      }).energySmoothing,
    }
  },
  setAudioEnergyDynamics: (
    state: DeviceState,
    { payload }: PayloadAction<number>
  ) => {
    const current = normalizeAudioInputSettings(state.connectionSettings.audioInput)
    state.connectionSettings.audioInput = {
      ...current,
      energyDynamics: normalizeAudioInputSettings({
        ...current,
        energyDynamics: payload,
      }).energyDynamics,
    }
  },
  setAudioEnergyRhythmBias: (
    state: DeviceState,
    { payload }: PayloadAction<number>
  ) => {
    const current = normalizeAudioInputSettings(state.connectionSettings.audioInput)
    state.connectionSettings.audioInput = {
      ...current,
      energyRhythmBias: normalizeAudioInputSettings({
        ...current,
        energyRhythmBias: payload,
      }).energyRhythmBias,
    }
  },
  setAudioBeatTapHint: (
    state: DeviceState,
    { payload }: PayloadAction<{ bpm: number; atMs?: number }>
  ) => {
    const rawBpm = Number(payload.bpm)
    if (!Number.isFinite(rawBpm)) {
      return
    }
    const bpm = Math.min(220, Math.max(45, rawBpm))
    const atMs =
      payload.atMs != null && Number.isFinite(payload.atMs) && payload.atMs > 0
        ? payload.atMs
        : Date.now()
    const current = normalizeAudioInputSettings(state.connectionSettings.audioInput)
    state.connectionSettings.audioInput = {
      ...current,
      beatTapHintBpm: bpm,
      beatTapHintAtMs: atMs,
    }
  },
  clearAudioBeatTapHint: (state: DeviceState) => {
    const current = normalizeAudioInputSettings(state.connectionSettings.audioInput)
    state.connectionSettings.audioInput = {
      ...current,
      beatTapHintBpm: null,
      beatTapHintAtMs: 0,
    }
  },
  setAudioBpmRangePreset: (
    state: DeviceState,
    { payload }: PayloadAction<AudioInputSettings['audioBpmRangePreset']>
  ) => {
    const current = normalizeAudioInputSettings(state.connectionSettings.audioInput)
    state.connectionSettings.audioInput = {
      ...current,
      audioBpmRangePreset: normalizeAudioInputSettings({
        ...current,
        audioBpmRangePreset: payload,
      }).audioBpmRangePreset,
    }
  },
  setAudioBpmRangeCustom: (
    state: DeviceState,
    { payload }: PayloadAction<{ min: number; max: number }>
  ) => {
    const current = normalizeAudioInputSettings(state.connectionSettings.audioInput)
    const bounds = normalizeAudioInputSettings({
      ...current,
      audioBpmRangeCustomMin: payload.min,
      audioBpmRangeCustomMax: payload.max,
    })
    state.connectionSettings.audioInput = {
      ...current,
      audioBpmRangePreset: 'custom',
      audioBpmRangeCustomMin: bounds.audioBpmRangeCustomMin,
      audioBpmRangeCustomMax: bounds.audioBpmRangeCustomMax,
    }
  },
  setAtmosOn: (
    state: DeviceState,
    { payload }: PayloadAction<boolean>
  ) => {
    withNormAtmos(state)
    state.connectionSettings.atmos.enabled = payload === true
  },
  setAtmosArmed: (
    state: DeviceState,
    { payload }: PayloadAction<boolean>
  ) => {
    withNormAtmos(state)
    state.connectionSettings.atmos.armed = payload === true
  },
  setAtmosEStop: (
    state: DeviceState,
    { payload }: PayloadAction<boolean>
  ) => {
    withNormAtmos(state)
    state.connectionSettings.atmos.emergencyStop = payload === true
  },
  setAtmosPyro: (
    state: DeviceState,
    { payload }: PayloadAction<boolean>
  ) => {
    withNormAtmos(state)
    state.connectionSettings.atmos.allowPyro = payload === true
  },
  setAtmosLevelCap: (
    state: DeviceState,
    { payload }: PayloadAction<number>
  ) => {
    withNormAtmos(state)
    state.connectionSettings.atmos.globalLevelLimit = Math.min(
      1,
      Math.max(0, Number(payload) || 0)
    )
  },
  ensureAtmosFxtrConfig: (
    state: DeviceState,
    { payload }: PayloadAction<string>
  ) => {
    withNormAtmos(state)
    const fixtureId = payload.trim()
    if (fixtureId.length <= 0) return
    if (state.connectionSettings.atmos.fixtures[fixtureId] === undefined) {
      state.connectionSettings.atmos.fixtures[fixtureId] =
        initAtmosFxtrControlConfig(fixtureId)
    }
    state.connectionSettings.atmos.selectedFixtureId = fixtureId
  },
  removeAtmosFxtr: (
    state: DeviceState,
    { payload }: PayloadAction<string>
  ) => {
    withNormAtmos(state)
    const fixtureId = payload.trim()
    delete state.connectionSettings.atmos.fixtures[fixtureId]
    if (state.connectionSettings.atmos.selectedFixtureId === fixtureId) {
      const firstKey =
        Object.keys(state.connectionSettings.atmos.fixtures)[0] ?? null
      state.connectionSettings.atmos.selectedFixtureId = firstKey
    }
  },
  selectAtmosFxtr: (
    state: DeviceState,
    { payload }: PayloadAction<string | null>
  ) => {
    withNormAtmos(state)
    if (payload === null) {
      state.connectionSettings.atmos.selectedFixtureId = null
      return
    }
    const fixtureId = payload.trim()
    if (fixtureId.length <= 0) {
      state.connectionSettings.atmos.selectedFixtureId = null
      return
    }
    // Ensure config exists before selecting — otherwise the Atmospherics page
    // effect keeps dispatching select → null → select and hits React #185.
    ensureAtmosFxtrCfgMut(state, fixtureId)
    state.connectionSettings.atmos.selectedFixtureId = fixtureId
  },
  patchAtmosFxtr: (
    state: DeviceState,
    {
      payload,
    }: PayloadAction<{
      fixtureId: string
      patch: Partial<
        Omit<
          AtmosFxtrConfig,
          'fixtureId' | 'source' | 'auxChannels' | 'triggerChannels' | 'levelChannels'
        >
      >
    }>
  ) => {
    withNormAtmos(state)
    const fixtureId = payload.fixtureId.trim()
    const target = findAtmosFxtr(state, fixtureId)
    if (target === undefined) {
      return
    }
    if (payload.patch.enabled !== undefined) {
      target.enabled = payload.patch.enabled === true
    }
    if (payload.patch.groupName !== undefined) {
      const nextGroupName = payload.patch.groupName.trim()
      if (nextGroupName.length > 0) {
        target.groupName = nextGroupName
      }
    }
    if (payload.patch.threshold !== undefined) target.threshold = payload.patch.threshold
    if (payload.patch.hysteresis !== undefined) target.hysteresis = payload.patch.hysteresis
    if (payload.patch.triggerAction !== undefined)
      target.triggerAction = payload.patch.triggerAction
    if (payload.patch.delayMs !== undefined) target.delayMs = payload.patch.delayMs
    if (payload.patch.intervalMs !== undefined) target.intervalMs = payload.patch.intervalMs
    if (payload.patch.pulseMs !== undefined) target.pulseMs = payload.patch.pulseMs
    if (payload.patch.manualDelayMs !== undefined)
      target.manualDelayMs = payload.patch.manualDelayMs
    if (payload.patch.manualIntervalMs !== undefined)
      target.manualIntervalMs = payload.patch.manualIntervalMs
    state.connectionSettings.atmos.fixtures[fixtureId] =
      normAtmosFxtrControlConfig(target, fixtureId)
  },
  setAtmosFxtrGroup: (
    state: DeviceState,
    {
      payload,
    }: PayloadAction<{
      fixtureId: string
      groupName: string
    }>
  ) => {
    withNormAtmos(state)
    const fixtureId = payload.fixtureId.trim()
    if (fixtureId.length <= 0) return
    const targetFixture = ensureAtmosFxtrCfgMut(state, fixtureId)
    const nextGroupName = payload.groupName.trim()
    if (nextGroupName.length > 0) {
      targetFixture.groupName = nextGroupName
    }
    state.connectionSettings.atmos.fixtures[fixtureId] =
      normAtmosFxtrControlConfig(targetFixture, fixtureId)
  },
  patchAtmosTrigCh: (
    state: DeviceState,
    {
      payload,
    }: PayloadAction<{
      fixtureId: string
      channelNumber: number
      patch: Partial<AtmosTrigChConfig>
    }>
  ) => {
    withNormAtmos(state)
    const fixtureId = payload.fixtureId.trim()
    if (fixtureId.length <= 0) return
    const channelNumber = Math.max(1, Math.min(512, Math.round(payload.channelNumber)))
    const targetFixture = ensureAtmosFxtrCfgMut(state, fixtureId)
    const targetChannel = ensureAtmosTrigChMut(
      targetFixture,
      channelNumber
    )
    if (payload.patch.useGroupThreshold !== undefined) {
      targetChannel.useGroupThreshold = payload.patch.useGroupThreshold === true
    }
    if (payload.patch.threshold !== undefined) {
      targetChannel.threshold = payload.patch.threshold
    }
    if (payload.patch.triggerAction !== undefined) {
      targetChannel.triggerAction = payload.patch.triggerAction
    }
    if (payload.patch.delayMs !== undefined) {
      targetChannel.delayMs = payload.patch.delayMs
    }
    if (payload.patch.intervalMs !== undefined) {
      targetChannel.intervalMs = payload.patch.intervalMs
    }
    if (payload.patch.pulseMs !== undefined) {
      targetChannel.pulseMs = payload.patch.pulseMs
    }
    if (payload.patch.manualDelayMs !== undefined) {
      targetChannel.manualDelayMs = payload.patch.manualDelayMs
    }
    if (payload.patch.manualIntervalMs !== undefined) {
      targetChannel.manualIntervalMs = payload.patch.manualIntervalMs
    }
    targetFixture.triggerChannels[channelNumber] =
      normAtmosTriggerChConfig(targetChannel, channelNumber)
    state.connectionSettings.atmos.fixtures[fixtureId] =
      normAtmosFxtrControlConfig(targetFixture, fixtureId)
  },
  patchAtmosLevelCh: (
    state: DeviceState,
    {
      payload,
    }: PayloadAction<{
      fixtureId: string
      channelNumber: number
      patch: Partial<AtmosLevelChConfig>
    }>
  ) => {
    withNormAtmos(state)
    const fixtureId = payload.fixtureId.trim()
    if (fixtureId.length <= 0) return
    const channelNumber = Math.max(1, Math.min(512, Math.round(payload.channelNumber)))
    const targetFixture = ensureAtmosFxtrCfgMut(state, fixtureId)
    const targetChannel = ensureAtmosLevelChMut(
      targetFixture,
      channelNumber
    )
    if (payload.patch.controlMode !== undefined) {
      targetChannel.controlMode = payload.patch.controlMode
    }
    if (payload.patch.manualValue !== undefined) {
      targetChannel.manualValue = payload.patch.manualValue
    }
    targetFixture.levelChannels[channelNumber] = normAtmosLevelChConfig(
      targetChannel,
      channelNumber
    )
    state.connectionSettings.atmos.fixtures[fixtureId] =
      normAtmosFxtrControlConfig(targetFixture, fixtureId)
  },
}

function clearInputID(state: DeviceState, inputID: string) {
  for (let [actionID, buttonAction] of Object.entries(state.buttonActions)) {
    if (buttonAction.inputID === inputID) delete state.buttonActions[actionID]
  }
  for (let [actionID, sliderAction] of Object.entries(state.sliderActions)) {
    if (sliderAction.inputID === inputID) delete state.sliderActions[actionID]
  }
}
