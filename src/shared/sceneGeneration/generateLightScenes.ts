import { nanoid } from 'nanoid'
import cloneDeep from 'lodash.clonedeep'
import { fixLightScenes } from '../fixState'
import { pruneUnusedModulators } from '../modulation'
import { LightScenes_t } from '../Scenes'
import { createSeededRng } from './rng'
import {
  analyzeRigProfile,
  SceneGenerationRigInput,
} from './rigProfile'
import {
  buildLightScenesList,
  DEFAULT_SAVE_LIGHT_SEED,
} from './generateLightScenesInternals'
import {
  resolveSceneGenerationCapabilities,
  resolveSceneGenerationPrefs,
  type GenerateLightScenesOptions,
} from './sceneGenerationOptions'

export type { GenerateLightScenesOptions } from './sceneGenerationOptions'

export function generateLightScenesForRig(
  rig: SceneGenerationRigInput,
  options: GenerateLightScenesOptions = {}
): LightScenes_t {
  const rng = createSeededRng(options.seed ?? Date.now())
  const profile = analyzeRigProfile(rig)
  const prefs = resolveSceneGenerationPrefs(options)
  const capabilities = resolveSceneGenerationCapabilities(profile, prefs.look)
  const scenes = buildLightScenesList(rng, profile, prefs, capabilities)

  const ids = scenes.map(() => nanoid())
  const byId: LightScenes_t['byId'] = {}
  scenes.forEach((scene, index) => {
    byId[ids[index]!] = scene
  })

  const result: LightScenes_t = {
    ids,
    byId,
    active: ids[0]!,
    auto: cloneDeep(
      options.preserveAuto ?? {
        enabled: false,
        epicness: 0.5,
        period: 8,
        energyMatchEnabled: true,
        matchAudioEnergy: true,
      }
    ),
  }

  fixLightScenes(result)
  for (const id of result.ids) {
    const scene = result.byId[id]
    if (scene !== undefined) {
      pruneUnusedModulators(scene)
    }
  }
  fixLightScenes(result)
  return result
}

export { DEFAULT_SAVE_LIGHT_SEED }
export {
  analyzeRigProfile,
  type RigProfile,
  type SceneGenerationRigInput,
} from './rigProfile'
export {
  mergeGeneratedLightScenes,
  type MergeGeneratedLightScenesOptions,
} from './mergeGeneratedLightScenes'
export {
  capabilityActive,
  clampEpicnessBias,
  clampSceneGenerationCount,
  DEFAULT_SCENE_GENERATION_LOOK,
  resolveSceneGenerationCapabilities,
  resolveSceneGenerationPrefs,
  SCENE_GENERATION_COUNT_DEFAULT,
  SCENE_GENERATION_COUNT_MAX,
  SCENE_GENERATION_COUNT_MIN,
  type SceneGenerationCapabilities,
  type SceneGenerationCommitMode,
  type SceneGenerationEnhancementId,
  type SceneGenerationLookPrefs,
} from './sceneGenerationOptions'
