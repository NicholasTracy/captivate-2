import { clampNormalized } from '../../math/util'
import {
  autoLabelFromDestinationHint,
  normalizePerformanceRouteList,
} from '../../shared/performance'
import { paramDisplayName } from '../../shared/params'
import type { GroupIntensityMap } from '../../shared/groupIntensity'
import type { LightScenes_t } from '../../shared/Scenes'
import {
  getSetBaseParamSplitIndex,
  type MidiAction,
} from './deviceState'

/** Minimal control slice shape needed to apply performance routes. */
export interface PerformanceRouteHost {
  master: number
  groupIntensity: GroupIntensityMap
  light: LightScenes_t
}

/** Human-readable label for a destination MidiAction (route / auto-name). */
export function midiActionLabel(action: MidiAction): string {
  switch (action.type) {
    case 'setMaster':
      return 'Master'
    case 'setBaseParam': {
      const split = getSetBaseParamSplitIndex(action)
      const name = paramDisplayName(action.paramKey)
      return split === 0 ? name : `Split ${split} ${name}`
    }
    case 'setGroupIntensity':
      return `Group ${action.group}`
    case 'setAutoSceneBombacity':
      return 'Bombacity'
    case 'setBpm':
      return 'BPM'
    case 'setActiveSceneIndex':
      return `${action.sceneType} scene ${action.index + 1}`
    case 'tapTempo':
      return 'Tap tempo'
    case 'toggleAutoScene':
      return `Auto ${action.sceneType}`
    case 'toggleBlackout':
      return 'Blackout'
    case 'triggerAtmosFixture':
      return 'Atmos trigger'
    case 'setActivePage':
      return `Page ${action.page}`
    case 'setPerformanceValue':
      return 'Performance slider'
    case 'firePerformancePad':
      return 'Performance pad'
    case 'setModulationAmount':
      return `Mod ${action.modIndex + 1} ${action.param}`
    default:
      return 'Control'
  }
}

export function readPerformanceRoutes(raw: unknown): MidiAction[] {
  return normalizePerformanceRouteList(raw) as MidiAction[]
}

export function isContinuousPerformanceRoute(action: MidiAction): boolean {
  return (
    action.type === 'setMaster' ||
    action.type === 'setBaseParam' ||
    action.type === 'setGroupIntensity' ||
    action.type === 'setAutoSceneBombacity' ||
    action.type === 'setBpm'
  )
}

function applyGroupIntensity(
  state: PerformanceRouteHost,
  group: string,
  intensity: number
) {
  const name = group.trim()
  if (name.length === 0) return
  const next = clampNormalized(intensity)
  if (next >= 0.999) {
    delete state.groupIntensity[name]
    for (const key of Object.keys(state.groupIntensity)) {
      if (key.toLowerCase() === name.toLowerCase()) {
        delete state.groupIntensity[key]
      }
    }
    return
  }
  for (const key of Object.keys(state.groupIntensity)) {
    if (key.toLowerCase() === name.toLowerCase() && key !== name) {
      delete state.groupIntensity[key]
    }
  }
  state.groupIntensity[name] = next
}

/**
 * Apply every continuous route on the active light scene for `controlId`.
 * Skips setBpm (needs the engine tempo path) and button routes.
 * Inactive scenes keep their own lists and are not written.
 */
export function applyPerformanceRouteToControlState(
  state: PerformanceRouteHost,
  controlId: string,
  value: number
): void {
  const scene = state.light.byId[state.light.active]
  if (!scene) return
  const routes = scene.performanceRoutes
  if (!routes || typeof routes !== 'object') return
  const actions = readPerformanceRoutes(routes[controlId])
  if (actions.length === 0) return

  const v = clampNormalized(value)

  for (const action of actions) {
    if (!isContinuousPerformanceRoute(action)) continue
    switch (action.type) {
      case 'setMaster':
        state.master = v
        break
      case 'setBaseParam': {
        const splitIndex = getSetBaseParamSplitIndex(action)
        const split = scene.splitScenes[splitIndex]
        if (split === undefined) break
        split.baseParams[action.paramKey] = v
        break
      }
      case 'setGroupIntensity':
        applyGroupIntensity(state, action.group, v)
        break
      case 'setAutoSceneBombacity':
        state.light.auto.epicness = v
        break
      case 'setBpm':
        // Tempo lives outside ControlState; handled by commitPerformanceValue.
        break
      default:
        break
    }
  }
}

/** Active light scene's route list for a performance control. */
export function getActivePerformanceRoutes(
  state: PerformanceRouteHost,
  controlId: string
): MidiAction[] {
  const scene = state.light.byId[state.light.active]
  return readPerformanceRoutes(scene?.performanceRoutes?.[controlId])
}

export function getActivePerformanceRoute(
  state: PerformanceRouteHost,
  controlId: string
): MidiAction | null {
  return getActivePerformanceRoutes(state, controlId)[0] ?? null
}

export function autoLabelForRoute(action: MidiAction): string {
  return autoLabelFromDestinationHint(midiActionLabel(action))
}
