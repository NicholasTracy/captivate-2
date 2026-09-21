import { useCallback, useLayoutEffect, useState } from 'react'
import { tourSelector } from './tourIds'
import { overlayZIndex } from '../zIndexes'

export type TargetRect = {
  top: number
  left: number
  width: number
  height: number
}

const PAD = 10
/** Above the tour dim, below tour popups / coach. */
const TARGET_Z = overlayZIndex.tour + 10
const LAYER_Z = overlayZIndex.tour + 5

type SavedStyle = {
  zIndex: string
  position: string
  boxShadow: string
  outline: string
  outlineOffset: string
  backgroundColor: string
  filter: string
  opacity: string
}

/**
 * Track a `[data-tour]` element's viewport box and lift it above the dim so it
 * stays fully visible (not shaded). Also lifts known ancestor layers (sidebar /
 * status bar) when the target is trapped in a lower stacking context.
 */
export function useTourTargetRect(
  tourId: string | undefined,
  active: boolean
): TargetRect | null {
  const [rect, setRect] = useState<TargetRect | null>(null)

  const measure = useCallback(() => {
    if (!active || !tourId) {
      setRect(null)
      return
    }
    const el = document.querySelector(tourSelector(tourId)) as HTMLElement | null
    if (!el) {
      setRect(null)
      return
    }
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    const r = el.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) {
      setRect(null)
      return
    }
    setRect({
      top: Math.max(0, r.top - PAD),
      left: Math.max(0, r.left - PAD),
      width: r.width + PAD * 2,
      height: r.height + PAD * 2,
    })
  }, [active, tourId])

  useLayoutEffect(() => {
    if (!active || !tourId) {
      setRect(null)
      return
    }

    const el = document.querySelector(tourSelector(tourId)) as HTMLElement | null
    if (!el) {
      setRect(null)
      return
    }

    const layer = el.closest(
      '[data-tour-layer]'
    ) as HTMLElement | null

    const prevEl: SavedStyle = {
      zIndex: el.style.zIndex,
      position: el.style.position,
      boxShadow: el.style.boxShadow,
      outline: el.style.outline,
      outlineOffset: el.style.outlineOffset,
      backgroundColor: el.style.backgroundColor,
      filter: el.style.filter,
      opacity: el.style.opacity,
    }
    const prevLayer = layer
      ? { zIndex: layer.style.zIndex, position: layer.style.position }
      : null

    const computed = window.getComputedStyle(el)
    if (computed.position === 'static') {
      el.style.position = 'relative'
    }
    el.style.zIndex = String(TARGET_Z)
    el.style.filter = 'none'
    el.style.opacity = '1'
    el.style.outline = '2px solid #5b8fd6'
    el.style.outlineOffset = '3px'
    el.style.boxShadow = '0 0 0 6px #5b8fd655, 0 8px 24px #0008'
    // Opaque plate so transparent controls don’t show the dim through them.
    if (
      computed.backgroundColor === 'rgba(0, 0, 0, 0)' ||
      computed.backgroundColor === 'transparent'
    ) {
      let bg = ''
      let node: HTMLElement | null = el.parentElement
      while (node) {
        const parentBg = window.getComputedStyle(node).backgroundColor
        if (
          parentBg &&
          parentBg !== 'rgba(0, 0, 0, 0)' &&
          parentBg !== 'transparent'
        ) {
          bg = parentBg
          break
        }
        node = node.parentElement
      }
      el.style.backgroundColor = bg || '#1a1d24'
    }

    if (layer) {
      const layerPos = window.getComputedStyle(layer).position
      if (layerPos === 'static') {
        layer.style.position = 'relative'
      }
      layer.style.zIndex = String(LAYER_Z)
    }

    measure()
    const onResize = () => measure()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)

    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => measure())
        : null
    ro?.observe(el)

    const interval = window.setInterval(measure, 400)

    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
      window.clearInterval(interval)
      ro?.disconnect()
      el.style.zIndex = prevEl.zIndex
      el.style.position = prevEl.position
      el.style.boxShadow = prevEl.boxShadow
      el.style.outline = prevEl.outline
      el.style.outlineOffset = prevEl.outlineOffset
      el.style.backgroundColor = prevEl.backgroundColor
      el.style.filter = prevEl.filter
      el.style.opacity = prevEl.opacity
      if (layer && prevLayer) {
        layer.style.zIndex = prevLayer.zIndex
        layer.style.position = prevLayer.position
      }
    }
  }, [active, tourId, measure])

  return rect
}
