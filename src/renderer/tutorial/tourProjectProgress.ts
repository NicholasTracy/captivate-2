import type { Page } from '../../shared/pages'
import type { DmxState } from '../redux/dmxSlice'
import type { ControlState } from '../redux/controlSlice'
import type { GuiState } from '../redux/guiSlice'

/** Snapshot of how far the open project is through a first-time setup. */
export type TourProjectProgress = {
  activePage: Page
  fixtureTypeCount: number
  patchedFixtureCount: number
  fixturesWithGroups: number
  lightSceneCount: number
  splitCount: number
  /** True if any light split has hue or brightness (typical first look). */
  hasBasicColorOrIntensity: boolean
  hasRandomizeOrChase: boolean
  dmxConnected: boolean
  midiConnected: boolean
  connectionsOpen: boolean
}

export function readTourProjectProgress(
  dmx: DmxState,
  control: ControlState,
  gui: Pick<
    GuiState,
    'activePage' | 'dmx' | 'midi' | 'connectionMenu'
  >
): TourProjectProgress {
  const light = control.light
  const activeScene = light.byId[light.active]
  const splits = activeScene?.splitScenes ?? []

  let hasBasicColorOrIntensity = false
  let hasRandomizeOrChase = false
  for (const split of splits) {
    const p = split.baseParams
    if (
      p.hue !== undefined ||
      p.saturation !== undefined ||
      p.brightness !== undefined ||
      p.intensity !== undefined
    ) {
      hasBasicColorOrIntensity = true
    }
    if (p.randomize !== undefined || p.chase !== undefined) {
      hasRandomizeOrChase = true
    }
  }

  let fixturesWithGroups = 0
  for (const fix of dmx.universe) {
    if (Array.isArray(fix.groups) && fix.groups.length > 0) {
      fixturesWithGroups += 1
    }
  }

  return {
    activePage: gui.activePage,
    fixtureTypeCount: dmx.fixtureTypes.length,
    patchedFixtureCount: dmx.universe.length,
    fixturesWithGroups,
    lightSceneCount: light.ids.length,
    splitCount: Math.max(1, splits.length),
    hasBasicColorOrIntensity,
    hasRandomizeOrChase,
    dmxConnected: gui.dmx.connected.length > 0,
    midiConnected: gui.midi.connected.length > 0,
    connectionsOpen: gui.connectionMenu === true,
  }
}
