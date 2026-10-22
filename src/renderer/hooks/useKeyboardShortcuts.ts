import { useEffect } from 'react'
import { useDispatch, useStore } from 'react-redux'
import {
  setKeyboardShortcut,
  midiSetKeyboardLearnMode,
  midiSetIsEditing,
  midiSetMidiOutLearnMode,
  clearKeyboardListening,
} from '../redux/controlSlice'
import { fireMidiButtonAction } from '../redux/fireMidiButtonAction'
import { commitPerformancePad } from '../redux/performanceControl'
import { buttonMidiActionTypes } from '../redux/deviceState'
import { getCleanReduxState, type ReduxState } from '../redux/store'
import { realtimeStore } from '../redux/realtimeStore'
import { send_user_command } from '../ipcHandler'
import {
  chordIdFromKeyboardEvent,
  isModifierOnlyChord,
} from '../input/keyboardChord'

function isTypingTarget(ev: EventTarget | null): boolean {
  if (!(ev instanceof HTMLElement)) return false
  const tag = ev.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (ev.isContentEditable) return true
  return false
}

function getDeviceFromStore(store: ReturnType<typeof useStore>) {
  const state = getCleanReduxState(store.getState() as ReduxState)
  return state.control.device
}

export default function useKeyboardShortcuts() {
  const dispatch = useDispatch()
  const store = useStore()

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const dev = getDeviceFromStore(store)
      if (!dev) return

      const shortcuts = dev.keyboardShortcuts ?? {}

      if (ev.key === 'Escape') {
        if (
          dev.keyboardListening ||
          dev.keyboardLearnMode ||
          dev.isEditing ||
          dev.midiOutLearnMode
        ) {
          ev.preventDefault()
          if (dev.keyboardListening) {
            dispatch(clearKeyboardListening())
          }
          if (dev.keyboardLearnMode) {
            dispatch(midiSetKeyboardLearnMode(false))
          }
          if (dev.isEditing) {
            dispatch(midiSetIsEditing(false))
          }
          if (dev.midiOutLearnMode) {
            dispatch(midiSetMidiOutLearnMode(false))
          }
          return
        }
      }

      if (dev.keyboardListening) {
        if (isTypingTarget(ev.target)) return
        if (isModifierOnlyChord(ev)) return
        const chordId = chordIdFromKeyboardEvent(ev)
        ev.preventDefault()
        ev.stopPropagation()
        dispatch(
          setKeyboardShortcut({
            chordId,
            action: dev.keyboardListening,
          })
        )
        return
      }

      if (isTypingTarget(ev.target)) return

      const chordId = chordIdFromKeyboardEvent(ev)
      const bound = shortcuts[chordId]
      if (!bound) return
      if (!buttonMidiActionTypes.has(bound.action.type)) return

      ev.preventDefault()
      ev.stopPropagation()
      const state = getCleanReduxState(store.getState() as ReduxState)
      const rt = realtimeStore.getState()
      const tapTempo = () => send_user_command({ type: 'TapTempo' })
      if (bound.action.type === 'firePerformancePad') {
        commitPerformancePad(
          dispatch as (a: unknown) => void,
          () => getCleanReduxState(store.getState() as ReduxState),
          bound.action.controlId,
          tapTempo,
          rt
        )
        return
      }
      fireMidiButtonAction(
        dispatch as (a: unknown) => void,
        state,
        rt,
        bound.action,
        tapTempo
      )
    }

    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [dispatch, store])
}
