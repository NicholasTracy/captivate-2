import { nanoid } from 'nanoid'
import cloneDeep from 'lodash.clonedeep'
import { fixLightScenes } from '../fixState'
import type { LightScene_t, LightScenes_t } from '../Scenes'
import type { SceneGenerationCommitMode } from './sceneGenerationOptions'

export type MergeGeneratedLightScenesOptions = {
  mode: SceneGenerationCommitMode
  /** When appending, keep the currently active scene. Default true. */
  keepActive?: boolean
}

/**
 * Commit a freshly generated light-scene bundle into the project.
 * Visual scenes are never touched (caller only passes light scenes).
 *
 * Existing Redux scenes are Immer-frozen — always clone before fixLightScenes
 * mutates modulator fields (e.g. lfo.shape).
 */
export function mergeGeneratedLightScenes(
  existing: LightScenes_t,
  generated: LightScenes_t,
  options: MergeGeneratedLightScenesOptions
): LightScenes_t {
  if (options.mode === 'replace') {
    return {
      ...cloneDeep(generated),
      auto: cloneDeep(existing.auto ?? generated.auto),
    }
  }

  const keepActive = options.keepActive !== false
  const previousActive = existing.active

  const mergedIds = [...existing.ids]
  const byId: LightScenes_t['byId'] = {}
  for (const id of existing.ids) {
    const scene = existing.byId[id]
    if (scene !== undefined) {
      byId[id] = cloneDeep(scene)
    }
  }

  for (const oldId of generated.ids) {
    const scene = generated.byId[oldId]
    if (scene === undefined) continue
    const nextId = nanoid()
    const nextScene: LightScene_t = cloneDeep(scene)
    mergedIds.push(nextId)
    byId[nextId] = nextScene
  }

  const active =
    keepActive &&
    typeof previousActive === 'string' &&
    byId[previousActive] !== undefined
      ? previousActive
      : mergedIds[0]!

  const result: LightScenes_t = {
    ids: mergedIds,
    byId,
    active,
    auto: cloneDeep(existing.auto ?? generated.auto),
  }
  fixLightScenes(result)
  return result
}
