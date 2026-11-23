import { useEffect, useRef } from 'react'
import styled from 'styled-components'
import { onVisualizerPreviewFrame } from '../ipcHandler'

export default function VisualizerMirror() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const waitingRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const waiting = waitingRef.current
    if (canvas === null) return
    const ctx = canvas.getContext('2d')
    if (ctx === null) return
    let disposed = false
    let busy = false
    let pending: Uint8Array | null = null
    let staleTimer: number | null = null

    const showWaiting = () => {
      if (waiting !== null) waiting.style.display = 'flex'
    }
    const hideWaiting = () => {
      if (waiting !== null) waiting.style.display = 'none'
    }
    const armStale = () => {
      if (staleTimer !== null) window.clearTimeout(staleTimer)
      staleTimer = window.setTimeout(showWaiting, 1000)
    }

    const paint = (jpeg: Uint8Array) => {
      if (disposed) return
      if (busy) {
        pending = jpeg
        return
      }
      busy = true
      const bytes = new Uint8Array(jpeg)
      createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }))
        .then((bitmap) => {
          if (disposed) {
            bitmap.close()
            return
          }
          if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
            canvas.width = bitmap.width
            canvas.height = bitmap.height
          }
          ctx.drawImage(bitmap, 0, 0)
          bitmap.close()
          hideWaiting()
          armStale()
        })
        .catch(() => undefined)
        .finally(() => {
          busy = false
          if (pending !== null && !disposed) {
            const next = pending
            pending = null
            paint(next)
          }
        })
    }

    showWaiting()
    const unsubscribe = onVisualizerPreviewFrame(paint)
    return () => {
      disposed = true
      unsubscribe()
      if (staleTimer !== null) window.clearTimeout(staleTimer)
    }
  }, [])

  return (
    <Root>
      <Canvas ref={canvasRef} />
      <Waiting ref={waitingRef}>Waiting for the visualizer preview</Waiting>
    </Root>
  )
}

const Root = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: #000;
  overflow: hidden;
`

const Canvas = styled.canvas`
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  background: #000;
`

const Waiting = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  box-sizing: border-box;
  text-align: center;
  color: #dfe8f8;
  font-size: 0.95rem;
`
