import { useEffect, useRef, useState } from 'react'
import { useDispatch } from 'react-redux'
import AppModal from '../overlays/AppModal'
import { useTypedSelector } from '../redux/store'
import {
  setActivePage,
  setAppSettings,
  setConnectionsMenu,
  setInteractiveTourActive,
} from '../redux/guiSlice'
import { persistAppSettings } from '../appSettingsClient'

/**
 * Offers the interactive lighting tutorial once per install (until completed/skipped).
 */
export default function FirstRunTutorialPrompt() {
  const dispatch = useDispatch()
  const appSettings = useTypedSelector((s) => s.gui.appSettings)
  const completed = appSettings.firstRunTutorialCompleted === true
  const tourActive = useTypedSelector((s) => s.gui.interactiveTourActive)
  const settingsLoaded = useTypedSelector((s) => s.gui.appSettingsLoaded)
  const newProjectDialog = useTypedSelector((s) => s.gui.newProjectDialog)
  const settingsOpen = useTypedSelector((s) => s.gui.settingsOpen)
  const aboutOpen = useTypedSelector((s) => s.gui.aboutOpen)
  const connectionMenu = useTypedSelector((s) => s.gui.connectionMenu)
  const sceneGenerationWizardOpen = useTypedSelector(
    (s) => s.gui.sceneGenerationWizardOpen
  )
  const appDialog = useTypedSelector((s) => s.gui.appDialog)
  const loading = useTypedSelector((s) => s.gui.loading)

  const blocking =
    newProjectDialog ||
    settingsOpen ||
    aboutOpen ||
    connectionMenu ||
    sceneGenerationWizardOpen ||
    appDialog !== null ||
    loading !== null

  const [open, setOpen] = useState(false)
  const offeredRef = useRef(false)

  const detached = new URLSearchParams(window.location.search).get('page')

  useEffect(() => {
    if (detached) return
    if (!settingsLoaded || completed || tourActive || blocking) return
    if (offeredRef.current) return
    offeredRef.current = true
    const t = window.setTimeout(() => setOpen(true), 600)
    return () => window.clearTimeout(t)
  }, [settingsLoaded, completed, tourActive, blocking, detached])

  const dismissPrompt = async () => {
    setOpen(false)
    if (appSettings.firstRunTutorialCompleted) return
    const next = { ...appSettings, firstRunTutorialCompleted: true }
    dispatch(setAppSettings(next))
    try {
      await persistAppSettings(next)
    } catch {
      // Ignore persistence errors; local flag still set.
    }
  }

  if (detached || !open || completed || tourActive) return null

  return (
    <AppModal
      open={open}
      title="Take the interactive tour?"
      maxWidth="28rem"
      onClose={() => void dismissPrompt()}
      actions={[
        {
          label: 'Not now',
          onClick: () => void dismissPrompt(),
        },
        {
          label: 'Start tour',
          onClick: () => {
            setOpen(false)
            dispatch(setConnectionsMenu(false))
            dispatch(setActivePage('Universe'))
            dispatch(setInteractiveTourActive(true))
          },
        },
      ]}
    >
      <p style={{ margin: '0 0 0.75rem', lineHeight: 1.5 }}>
        New to lighting control? This guided tour explains fixtures, patching,
        scenes, and live controls in plain language — and has you click the
        real buttons along the way. The rest of the screen dims so you can stay
        focused.
      </p>
      <p style={{ margin: 0, lineHeight: 1.45, opacity: 0.9, fontSize: '0.92rem' }}>
        Replay anytime from <strong>Help → Interactive Tutorial</strong>. Online
        wiki articles are under <strong>Help → Online Tutorials</strong>.
      </p>
    </AppModal>
  )
}
