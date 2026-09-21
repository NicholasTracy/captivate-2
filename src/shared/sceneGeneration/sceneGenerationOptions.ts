/**
 * Scene generation wizard options + capability framework.
 *
 * Recipes should gate future features through {@link SceneGenerationCapabilities}
 * rather than reading look flags ad hoc. Unimplemented enhancements stay
 * `available: false` until wired (mover kinematics / aiming, gobo, prism, etc.).
 */

import type { LightScenes_t } from '../Scenes'
import type { RigProfile } from './rigProfile'

/** How generated scenes are committed into the project. */
export type SceneGenerationCommitMode = 'append' | 'replace'

/**
 * Future-facing enhancement ids. Keep stable so wizard UI and recipes can grow
 * without renaming.
 */
export type SceneGenerationEnhancementId =
  | 'moverKinematics'
  | 'moverAiming'
  | 'gobo'
  | 'prism'
  | 'colorMap'
  | 'atmosphere'
  | 'led'

/** User-facing look toggles that recipes honor today (or soon). */
export type SceneGenerationLookPrefs = {
  beatReactive: boolean
  audioBands: boolean
  spatialSplits: boolean
  /** Extra mover showcase scenes + mover awareness on core scenes. */
  moverShowcases: boolean
  /** Allow strobe params in peak recipes when the rig has strobe. */
  peakStrobe: boolean
  /**
   * Opt-in enhancements. Ignored until the matching capability is implemented.
   * Defaults are all false so generation stays stable.
   */
  enhancements: Partial<Record<SceneGenerationEnhancementId, boolean>>
}

export type GenerateLightScenesOptions = {
  seed?: number | string
  preserveAuto?: LightScenes_t['auto']
  /**
   * Target number of light scenes (core + optional mover showcases).
   * Omitted / invalid → full epicness ladder (+ movers when enabled).
   */
  sceneCount?: number
  /**
   * Sampling bias over the epicness ladder when sceneCount < full ladder.
   * 0 = calm-weighted, 0.5 = balanced, 1 = peak-weighted.
   */
  epicnessBias?: number
  look?: Partial<SceneGenerationLookPrefs>
}

/** Resolved prefs after defaults — passed into recipe builders. */
export type ResolvedSceneGenerationPrefs = {
  sceneCount: number | null
  epicnessBias: number
  look: SceneGenerationLookPrefs
}

/**
 * Runtime capability bag for recipes. `available` means the rig + prefs allow it;
 * `implemented` means recipe code actually uses it today.
 */
export type SceneGenerationCapability = {
  available: boolean
  implemented: boolean
}

export type SceneGenerationCapabilities = {
  movers: SceneGenerationCapability
  strobe: SceneGenerationCapability
  spatial: SceneGenerationCapability
  beat: SceneGenerationCapability
  audio: SceneGenerationCapability
  /** Reserved — not implemented yet. */
  moverKinematics: SceneGenerationCapability
  moverAiming: SceneGenerationCapability
  gobo: SceneGenerationCapability
  prism: SceneGenerationCapability
  colorMap: SceneGenerationCapability
  atmosphere: SceneGenerationCapability
  led: SceneGenerationCapability
}

export const DEFAULT_SCENE_GENERATION_LOOK: SceneGenerationLookPrefs = {
  beatReactive: true,
  audioBands: true,
  spatialSplits: true,
  moverShowcases: true,
  peakStrobe: true,
  enhancements: {},
}

/** Soft caps so a wizard slider cannot explode undo history / UI. */
export const SCENE_GENERATION_COUNT_MIN = 4
export const SCENE_GENERATION_COUNT_MAX = 48
export const SCENE_GENERATION_COUNT_DEFAULT = 24

export function clampSceneGenerationCount(value: number): number {
  if (!Number.isFinite(value)) return SCENE_GENERATION_COUNT_DEFAULT
  return Math.max(
    SCENE_GENERATION_COUNT_MIN,
    Math.min(SCENE_GENERATION_COUNT_MAX, Math.round(value))
  )
}

export function clampEpicnessBias(value: number): number {
  if (!Number.isFinite(value)) return 0.5
  return Math.min(1, Math.max(0, value))
}

export function resolveSceneGenerationPrefs(
  options: GenerateLightScenesOptions = {}
): ResolvedSceneGenerationPrefs {
  const look: SceneGenerationLookPrefs = {
    ...DEFAULT_SCENE_GENERATION_LOOK,
    ...options.look,
    enhancements: {
      ...DEFAULT_SCENE_GENERATION_LOOK.enhancements,
      ...(options.look?.enhancements ?? {}),
    },
  }

  const sceneCount =
    options.sceneCount === undefined
      ? null
      : clampSceneGenerationCount(options.sceneCount)

  return {
    sceneCount,
    epicnessBias: clampEpicnessBias(
      options.epicnessBias === undefined ? 0.5 : options.epicnessBias
    ),
    look,
  }
}

export function resolveSceneGenerationCapabilities(
  profile: RigProfile,
  look: SceneGenerationLookPrefs
): SceneGenerationCapabilities {
  const want = (id: SceneGenerationEnhancementId) =>
    look.enhancements[id] === true

  return {
    movers: {
      available: profile.hasMovers && look.moverShowcases,
      implemented: true,
    },
    strobe: {
      available: profile.hasStrobe && look.peakStrobe,
      implemented: true,
    },
    spatial: {
      available: look.spatialSplits,
      implemented: true,
    },
    beat: {
      available: look.beatReactive,
      implemented: true,
    },
    audio: {
      available: look.audioBands,
      implemented: true,
    },
    // Scaffold only — recipes must not rely on these until implemented flips true.
    moverKinematics: {
      available: profile.hasMovers && want('moverKinematics'),
      implemented: false,
    },
    moverAiming: {
      available: profile.hasMovers && want('moverAiming'),
      implemented: false,
    },
    gobo: {
      available: profile.hasGobo && want('gobo'),
      implemented: false,
    },
    prism: {
      available: profile.hasPrism && want('prism'),
      implemented: false,
    },
    colorMap: {
      available: profile.hasColorMap && want('colorMap'),
      implemented: false,
    },
    atmosphere: {
      available: profile.hasAtmos && want('atmosphere'),
      implemented: false,
    },
    led: {
      available: want('led'),
      implemented: false,
    },
  }
}

/** True when a recipe may use a capability (available AND implemented). */
export function capabilityActive(
  caps: SceneGenerationCapabilities,
  key: keyof SceneGenerationCapabilities
): boolean {
  const entry = caps[key]
  return entry.available && entry.implemented
}
