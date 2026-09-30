import { store } from '../redux/store'
import {
  hideAppDialog,
  pushStatusMessage,
  showAppDialog,
  type AppDialogChoice,
  type AppDialogState,
} from '../redux/guiSlice'

type BooleanResolver = (accepted: boolean) => void
type ChoiceResolver = (choiceId: string | null) => void

const booleanResolvers = new Map<string, BooleanResolver>()
const choiceResolvers = new Map<string, ChoiceResolver>()
const explicitResolutionIds = new Set<string>()
let observerInstalled = false

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function resolveBooleanById(id: string, accepted: boolean) {
  explicitResolutionIds.delete(id)
  const resolver = booleanResolvers.get(id)
  if (resolver !== undefined) {
    booleanResolvers.delete(id)
    resolver(accepted)
  }
}

function resolveChoiceById(id: string, choiceId: string | null) {
  explicitResolutionIds.delete(id)
  const resolver = choiceResolvers.get(id)
  if (resolver !== undefined) {
    choiceResolvers.delete(id)
    resolver(choiceId)
  }
}

function installDialogObserver() {
  if (observerInstalled) {
    return
  }
  observerInstalled = true
  let lastDialogId: string | null = store.getState().gui.appDialog?.id ?? null
  store.subscribe(() => {
    const nextDialogId = store.getState().gui.appDialog?.id ?? null
    if (lastDialogId !== null && nextDialogId !== lastDialogId) {
      if (explicitResolutionIds.has(lastDialogId)) {
        explicitResolutionIds.delete(lastDialogId)
        lastDialogId = nextDialogId
        return
      }
      // Dialog disappeared or was replaced outside resolveActiveAppDialog.
      if (choiceResolvers.has(lastDialogId)) {
        resolveChoiceById(lastDialogId, null)
      } else {
        resolveBooleanById(lastDialogId, false)
      }
    }
    lastDialogId = nextDialogId
  })
}

function prepareDialog(input: Omit<AppDialogState, 'id'>): string {
  installDialogObserver()
  const active = store.getState().gui.appDialog
  if (active !== null) {
    // Replace-in-place behavior should never orphan the previous promise.
    if (choiceResolvers.has(active.id)) {
      resolveChoiceById(active.id, null)
    } else {
      resolveBooleanById(active.id, false)
    }
  }

  const id = makeId()
  store.dispatch(
    showAppDialog({
      id,
      ...input,
    })
  )
  return id
}

export function openAppConfirm(options: {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  critical?: boolean
}) {
  const id = prepareDialog({
    title: options.title,
    message: options.message,
    confirmLabel: options.confirmLabel ?? 'OK',
    cancelLabel: options.cancelLabel ?? 'Cancel',
    danger: options.danger === true,
    critical: options.critical === true,
  })
  return new Promise<boolean>((resolve) => {
    booleanResolvers.set(id, resolve)
  })
}

/**
 * Multi-button dialog. Resolves to the chosen action `id`, or `null` if
 * dismissed / replaced without an explicit choice.
 */
export function openAppChoice(options: {
  title: string
  message: string
  choices: AppDialogChoice[]
  critical?: boolean
}): Promise<string | null> {
  if (options.choices.length === 0) {
    return Promise.resolve(null)
  }
  const id = prepareDialog({
    title: options.title,
    message: options.message,
    critical: options.critical === true,
    choices: options.choices,
  })
  return new Promise<string | null>((resolve) => {
    choiceResolvers.set(id, resolve)
  })
}

export async function openAppAlert(options: {
  title: string
  message: string
  confirmLabel?: string
  level?: 'info' | 'warn' | 'error'
  source?: string
}) {
  if (options.level !== undefined) {
    store.dispatch(
      pushStatusMessage({
        level: options.level,
        message: options.message,
        source: options.source,
      })
    )
  }
  await openAppConfirm({
    title: options.title,
    message: options.message,
    confirmLabel: options.confirmLabel ?? 'OK',
    cancelLabel: '',
    danger: false,
  })
}

export function resolveActiveAppDialog(
  accepted: boolean,
  choiceId?: string
) {
  const active = store.getState().gui.appDialog
  if (active === null) {
    store.dispatch(hideAppDialog())
    return
  }
  explicitResolutionIds.add(active.id)
  store.dispatch(hideAppDialog())
  if (choiceResolvers.has(active.id)) {
    resolveChoiceById(active.id, accepted ? (choiceId ?? null) : null)
    return
  }
  resolveBooleanById(active.id, accepted)
}

export function closeAllAppDialogs(accepted = false) {
  const active = store.getState().gui.appDialog
  if (active !== null) {
    explicitResolutionIds.add(active.id)
  }
  store.dispatch(hideAppDialog())

  if (active !== null) {
    if (choiceResolvers.has(active.id)) {
      const resolver = choiceResolvers.get(active.id)
      choiceResolvers.delete(active.id)
      resolver?.(null)
    } else {
      const resolver = booleanResolvers.get(active.id)
      if (resolver !== undefined) {
        booleanResolvers.delete(active.id)
        resolver(accepted)
      }
    }
  }

  if (booleanResolvers.size > 0) {
    for (const resolver of booleanResolvers.values()) {
      resolver(accepted)
    }
    booleanResolvers.clear()
  }
  if (choiceResolvers.size > 0) {
    for (const resolver of choiceResolvers.values()) {
      resolver(null)
    }
    choiceResolvers.clear()
  }
}
