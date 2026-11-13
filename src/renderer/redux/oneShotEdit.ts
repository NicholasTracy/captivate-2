import {
  createContext,
  createElement,
  useLayoutEffect,
  type ReactNode,
} from 'react'

/** Set while the One-Shots page editor is mounted. Null everywhere else. */
export const OneShotEditContext = createContext<string | null>(null)

let captureId: string | null = null

export function setOneShotEditCapture(id: string | null) {
  captureId = id
}

export function currentOneShotEditCapture(): string | null {
  return captureId
}

/**
 * Scene-editor controls write through `modifyActiveLightScene`. While this
 * provider is mounted, those writes land on the one-shot instead of the
 * playing light scene. The context is what the read hooks use, and only
 * this subtree is under it.
 */
export function OneShotEditProvider({
  id,
  children,
}: {
  id: string
  children: ReactNode
}) {
  setOneShotEditCapture(id)
  useLayoutEffect(() => {
    setOneShotEditCapture(id)
    return () => {
      if (currentOneShotEditCapture() === id) setOneShotEditCapture(null)
    }
  }, [id])
  return createElement(
    OneShotEditContext.Provider,
    { value: id },
    children
  )
}
