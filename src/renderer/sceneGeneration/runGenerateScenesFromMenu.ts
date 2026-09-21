import { store } from '../redux/store'
import { setSceneGenerationWizardOpen } from '../redux/guiSlice'

/** Extras → Generate Scenes… opens the wizard (append-capable, look options). */
export async function runGenerateScenesFromMenu(): Promise<boolean> {
  store.dispatch(setSceneGenerationWizardOpen(true))
  return true
}
