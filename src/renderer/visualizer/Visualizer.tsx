import {
  useRef,
  useEffect,
  useMemo,
  useState,
  useCallback,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useDispatch } from 'react-redux'
import styled from 'styled-components'
import CastConnectedIcon from '@mui/icons-material/CastConnected'
import IconButton from '@mui/material/IconButton'
import FPS from '../visualizer/FPS'
import VisualizerManager from 'visualizer/threejs/VisualizerManager'
import { realtimeStore } from '../redux/realtimeStore'
import { store, getCleanReduxState, useActiveVisualScene } from '../redux/store'
import OpenVisualizerButton from 'renderer/visualizer/OpenVisualizerButton'
import VisualizerStreamingModal from './VisualizerStreamingModal'
import {
  setAllVisualScenesProjectionMapping,
  setVisualSceneConfig,
} from '../redux/controlSlice'
import { heliosSetPoints, sendDiagnosticsEvent, sendTelemetryMark } from '../ipcHandler'
import type {
  ProjectionMappingConfig,
  ProjectionMappingOutput,
} from '../../visualizer/threejs/layers/LayerConfig'
import { ProjectionMappingGpuCompositor } from './ProjectionMappingGpuCompositor'
import HeliosOutputPanel, {
  type HeliosTraceConfig,
} from './HeliosOutputPanel'
import {
  placeTracePoints,
  traceVisualizerFrame,
  type TraceWarp,
} from './traceVisualizerFrame'
import {
  cssMatrix3dFromCorners,
  homographyFromCorners,
  projectNormalizedPoint,
} from '../../shared/projectionHomography'

interface VisualizerProps {
  viewportOnly?: boolean
}

type CornerIndex = 0 | 1 | 2 | 3
type OutputCorners = ProjectionMappingOutput['corners']
type NormalizedPoint = { x: number; y: number }
type NormalizedRect = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}
type DragState =
  | {
      type: 'corner'
      outputId: string
      cornerIndex: CornerIndex
    }
  | {
      type: 'output'
      outputId: string
      start: { x: number; y: number }
      initialCorners: OutputCorners
    }
  | {
      type: 'marquee'
      start: NormalizedPoint
      end: NormalizedPoint
    }
type SelectedGrabPoint = {
  outputId: string
  cornerIndex: CornerIndex
}

const GRID_DIV = 10
const KEYSTONE_DIV = 6
const PERF_SAMPLE_MS = 2000
const LIVE_SAMPLE_MS = 5000

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function sanitizeOutput(output: ProjectionMappingOutput): ProjectionMappingOutput {
  const x = clamp01(output.sourceRect.x)
  const y = clamp01(output.sourceRect.y)
  const width = Math.max(0.001, Math.min(1 - x, output.sourceRect.width || 1))
  const height = Math.max(0.001, Math.min(1 - y, output.sourceRect.height || 1))
  return {
    ...output,
    enabled: output.enabled !== false,
    sourceRect: { x, y, width, height },
    corners: [
      { x: clamp01(output.corners[0].x), y: clamp01(output.corners[0].y) },
      { x: clamp01(output.corners[1].x), y: clamp01(output.corners[1].y) },
      { x: clamp01(output.corners[2].x), y: clamp01(output.corners[2].y) },
      { x: clamp01(output.corners[3].x), y: clamp01(output.corners[3].y) },
    ],
  }
}

function sanitizeProjectionMapping(config: ProjectionMappingConfig): ProjectionMappingConfig {
  const outputs = (config.outputs ?? [])
    .map((output) => sanitizeOutput(output))
    .filter((output) => output.enabled)
  const fallback: ProjectionMappingOutput = {
    id: 'pm-out-1',
    name: 'Output 1',
    enabled: true,
    sourceRect: { x: 0, y: 0, width: 1, height: 1 },
    corners: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
  }
  const safe = outputs.length > 0 ? outputs : [fallback]
  const activeOutputId =
    typeof config.activeOutputId === 'string' && safe.some((s) => s.id === config.activeOutputId)
      ? config.activeOutputId
      : safe[0].id
  return {
    enabled: config.enabled === true,
    showAlignmentGrid: config.showAlignmentGrid !== false,
    showKeystoneGrid: config.showKeystoneGrid !== false,
    showSelectedOutputGrid: config.showSelectedOutputGrid === true,
    activeOutputId,
    outputs: safe,
  }
}

function pointToRect(start: NormalizedPoint, end: NormalizedPoint): NormalizedRect {
  return {
    minX: Math.min(start.x, end.x),
    minY: Math.min(start.y, end.y),
    maxX: Math.max(start.x, end.x),
    maxY: Math.max(start.y, end.y),
  }
}

function outputBounds(output: ProjectionMappingOutput): NormalizedRect {
  return output.corners.reduce(
    (acc, corner) => ({
      minX: Math.min(acc.minX, corner.x),
      minY: Math.min(acc.minY, corner.y),
      maxX: Math.max(acc.maxX, corner.x),
      maxY: Math.max(acc.maxY, corner.y),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    }
  )
}

function rectsIntersect(a: NormalizedRect, b: NormalizedRect): boolean {
  return a.maxX >= b.minX && a.minX <= b.maxX && a.maxY >= b.minY && a.minY <= b.maxY
}

function pointInPolygon(
  point: NormalizedPoint,
  corners: ProjectionMappingOutput['corners']
): boolean {
  let inside = false
  for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
    const xi = corners[i].x
    const yi = corners[i].y
    const xj = corners[j].x
    const yj = corners[j].y
    const intersects =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 1e-9) + xi
    if (intersects) inside = !inside
  }
  return inside
}

function cloneProjectionMapping(config: ProjectionMappingConfig): ProjectionMappingConfig {
  return {
    enabled: config.enabled,
    showAlignmentGrid: config.showAlignmentGrid,
    showKeystoneGrid: config.showKeystoneGrid,
    showSelectedOutputGrid: config.showSelectedOutputGrid,
    activeOutputId: config.activeOutputId,
    outputs: config.outputs.map((output) => ({
      ...output,
      sourceRect: { ...output.sourceRect },
      corners: [
        { ...output.corners[0] },
        { ...output.corners[1] },
        { ...output.corners[2] },
        { ...output.corners[3] },
      ],
    })),
  }
}

function makeOutputId() {
  return `pm-out-${Math.random().toString(36).slice(2, 8)}`
}

function split2x2(output: ProjectionMappingOutput): ProjectionMappingOutput[] {
  const next: ProjectionMappingOutput[] = []
  const halfW = output.sourceRect.width * 0.5
  const halfH = output.sourceRect.height * 0.5
  const warp = homographyFromCorners(output.corners)
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      const u0 = col * 0.5
      const u1 = (col + 1) * 0.5
      const v0 = row * 0.5
      const v1 = (row + 1) * 0.5
      next.push({
        id: `pm-out-${Math.random().toString(36).slice(2, 8)}`,
        name: `${output.name} ${row * 2 + col + 1}`,
        enabled: true,
        sourceRect: {
          x: output.sourceRect.x + col * halfW,
          y: output.sourceRect.y + row * halfH,
          width: halfW,
          height: halfH,
        },
        corners: [
          projectNormalizedPoint(warp, output.corners, u0, v0),
          projectNormalizedPoint(warp, output.corners, u1, v0),
          projectNormalizedPoint(warp, output.corners, u1, v1),
          projectNormalizedPoint(warp, output.corners, u0, v1),
        ],
      })
    }
  }
  return next
}

export default function Visualizer({ viewportOnly = false }: VisualizerProps) {
  const dispatch = useDispatch()
  const visualizerDiv = useRef<null | HTMLDivElement>(null)
  const viewportFrameRef = useRef<null | HTMLDivElement>(null)
  const sourceHostRef = useRef<null | HTMLDivElement>(null)
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null)
  /** 2D copy of the visualizer frame, taken in the same turn as the WebGL render. */
  const frameSnapshotRef = useRef<HTMLCanvasElement | null>(null)
  const traceConfigRef = useRef<HeliosTraceConfig>({
    enabled: false,
    effect: 'edges',
    armed: false,
  })
  const traceWarpRef = useRef<TraceWarp | null>(null)
  const onTraceConfig = useCallback((config: HeliosTraceConfig) => {
    traceConfigRef.current = config
  }, [])
  const outputCanvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({})
  const mappingGpuCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const mappingGpuRef = useRef<ProjectionMappingGpuCompositor | null>(null)
  const [gpuMappingActive, setGpuMappingActive] = useState(false)
  const dt = useRef<number>(60)
  const cleanStateRef = useRef(getCleanReduxState(store.getState()))
  const realtimeStateRef = useRef(realtimeStore.getState())
  const framePayloadRef = useRef<{
    rt: ReturnType<typeof realtimeStore.getState>
    state: ReturnType<typeof getCleanReduxState>
  }>({
    rt: realtimeStore.getState(),
    state: getCleanReduxState(store.getState()),
  })
  const lastFpsCommitRef = useRef(0)
  const perfSampleRef = useRef({
    lastPerfSampleMs: 0,
    lastLiveSampleMs: 0,
    fpsEma: 60,
    updateMsEma: 3,
    heapMbLast: 0,
    geometryLast: 0,
    textureLast: 0,
    growthWarnCooldownUntilMs: 0,
  })
  const [streamingOpen, setStreamingOpen] = useState(false)
  const [viewportSize, setViewportSize] = useState({ width: 1600, height: 900 })
  const [fpsDt, setFpsDt] = useState(16.67)
  const [mappingMessage, setMappingMessage] = useState('')
  const [boxSelectEnabled, setBoxSelectEnabled] = useState(false)
  const [selectedOutputIds, setSelectedOutputIds] = useState<string[]>([])
  const [selectedGrabPoint, setSelectedGrabPoint] = useState<SelectedGrabPoint | null>(null)
  const [marqueeRect, setMarqueeRect] = useState<NormalizedRect | null>(null)
  const visualSceneConfig = useActiveVisualScene((scene) => scene.config)
  const projectionMapping = sanitizeProjectionMapping(visualSceneConfig.projectionMapping)
  const [mappingDraft, setMappingDraft] = useState<ProjectionMappingConfig>(projectionMapping)
  const mappingDraftRef = useRef<ProjectionMappingConfig>(projectionMapping)
  const mappingClipboardRef = useRef<ProjectionMappingConfig | null>(null)
  const messageTimeoutRef = useRef<number | null>(null)
  const dragStateRef = useRef<DragState | null>(null)

  const activeOutput = useMemo(() => {
    return (
      mappingDraft.outputs.find((output) => output.id === mappingDraft.activeOutputId) ??
      mappingDraft.outputs[0] ??
      null
    )
  }, [mappingDraft.activeOutputId, mappingDraft.outputs])

  traceWarpRef.current =
    mappingDraft.enabled && activeOutput
      ? {
          corners: activeOutput.corners,
          sourceRect: activeOutput.sourceRect,
        }
      : null

  useEffect(() => {
    setSelectedOutputIds((current) => {
      const valid = current.filter((id) =>
        mappingDraft.outputs.some((output) => output.id === id)
      )
      if (valid.length > 0) {
        return valid
      }
      return activeOutput ? [activeOutput.id] : []
    })
  }, [activeOutput, mappingDraft.outputs])

  useEffect(() => {
    setSelectedGrabPoint((current) => {
      if (!current) return null
      const exists = mappingDraft.outputs.some(
        (output) => output.id === current.outputId
      )
      if (!exists) return null
      if (current.cornerIndex < 0 || current.cornerIndex > 3) return null
      return current
    })
  }, [mappingDraft.outputs])

  useEffect(() => {
    if (!selectedGrabPoint || !activeOutput) return
    if (selectedGrabPoint.outputId !== activeOutput.id) {
      setSelectedGrabPoint(null)
    }
  }, [activeOutput, selectedGrabPoint])

  useEffect(() => {
    cleanStateRef.current = getCleanReduxState(store.getState())
    realtimeStateRef.current = realtimeStore.getState()
    framePayloadRef.current = {
      rt: realtimeStateRef.current,
      state: cleanStateRef.current,
    }
    const unsubscribeRedux = store.subscribe(() => {
      cleanStateRef.current = getCleanReduxState(store.getState())
      framePayloadRef.current = {
        rt: realtimeStateRef.current,
        state: cleanStateRef.current,
      }
    })
    const unsubscribeRealtime = realtimeStore.subscribe(() => {
      realtimeStateRef.current = realtimeStore.getState()
      framePayloadRef.current = {
        rt: realtimeStateRef.current,
        state: cleanStateRef.current,
      }
    })
    return () => {
      unsubscribeRedux()
      unsubscribeRealtime()
    }
  }, [])

  const patchProjectionMapping = useCallback(
    (
      patch:
        | Partial<ProjectionMappingConfig>
        | ((current: ProjectionMappingConfig) => Partial<ProjectionMappingConfig>)
    ) => {
      const latestVisual = cleanStateRef.current.control.visual
      const latestScene = latestVisual.byId[latestVisual.active]
      const latestConfig = latestScene?.config ?? visualSceneConfig
      const persisted = sanitizeProjectionMapping(latestConfig.projectionMapping)
      const draft = sanitizeProjectionMapping(mappingDraftRef.current)
      const partial = typeof patch === 'function' ? patch(draft) : patch
      const next = sanitizeProjectionMapping({ ...draft, ...partial })
      const same = JSON.stringify(persisted) === JSON.stringify(next)
      if (same) {
        setMappingDraft(next)
        mappingDraftRef.current = next
        return
      }
      dispatch(
        setVisualSceneConfig({
          ...latestConfig,
          projectionMapping: cloneProjectionMapping(next),
        })
      )
      setMappingDraft(next)
      mappingDraftRef.current = next
    },
    [dispatch, visualSceneConfig]
  )

  const postMappingMessage = useCallback((message: string) => {
    setMappingMessage(message)
    if (messageTimeoutRef.current !== null) {
      window.clearTimeout(messageTimeoutRef.current)
    }
    messageTimeoutRef.current = window.setTimeout(() => {
      setMappingMessage('')
      messageTimeoutRef.current = null
    }, 1800)
  }, [])

  useEffect(() => {
    if (dragStateRef.current !== null) return
    setMappingDraft(projectionMapping)
    mappingDraftRef.current = projectionMapping
  }, [projectionMapping])

  useEffect(() => {
    const validIds = new Set(mappingDraft.outputs.map((output) => output.id))
    Object.keys(outputCanvasRefs.current).forEach((id) => {
      if (!validIds.has(id)) {
        delete outputCanvasRefs.current[id]
      }
    })
  }, [mappingDraft.outputs])

  useEffect(() => {
    if (boxSelectEnabled) return
    setMarqueeRect(null)
    if (dragStateRef.current?.type === 'marquee') {
      dragStateRef.current = null
    }
  }, [boxSelectEnabled])

  useEffect(() => {
    return () => {
      if (messageTimeoutRef.current !== null) {
        window.clearTimeout(messageTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragStateRef.current
      const frame = viewportFrameRef.current
      if (drag === null || frame === null) return
      const rect = frame.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      if (drag.type === 'marquee') {
        const end = {
          x: clamp01((event.clientX - rect.left) / rect.width),
          y: clamp01((event.clientY - rect.top) / rect.height),
        }
        const nextDrag: DragState = {
          type: 'marquee',
          start: drag.start,
          end,
        }
        dragStateRef.current = nextDrag
        setMarqueeRect(pointToRect(drag.start, end))
        return
      }
      setMappingDraft((current) => {
        const next = cloneProjectionMapping(current)
        const index = next.outputs.findIndex((output) => output.id === drag.outputId)
        if (index < 0) return current
        if (drag.type === 'corner') {
          const nextCorner = {
            x: clamp01((event.clientX - rect.left) / rect.width),
            y: clamp01((event.clientY - rect.top) / rect.height),
          }
          next.outputs[index].corners[drag.cornerIndex] = nextCorner
        } else {
          const pointer = {
            x: clamp01((event.clientX - rect.left) / rect.width),
            y: clamp01((event.clientY - rect.top) / rect.height),
          }
          const deltaXRaw = pointer.x - drag.start.x
          const deltaYRaw = pointer.y - drag.start.y
          const minX = Math.min(...drag.initialCorners.map((corner) => corner.x))
          const maxX = Math.max(...drag.initialCorners.map((corner) => corner.x))
          const minY = Math.min(...drag.initialCorners.map((corner) => corner.y))
          const maxY = Math.max(...drag.initialCorners.map((corner) => corner.y))
          const deltaX = Math.max(-minX, Math.min(1 - maxX, deltaXRaw))
          const deltaY = Math.max(-minY, Math.min(1 - maxY, deltaYRaw))
          next.outputs[index].corners = drag.initialCorners.map((corner) => ({
            x: clamp01(corner.x + deltaX),
            y: clamp01(corner.y + deltaY),
          })) as OutputCorners
        }
        const sanitized = sanitizeProjectionMapping(next)
        mappingDraftRef.current = sanitized
        return sanitized
      })
    }
    const onPointerUp = () => {
      const drag = dragStateRef.current
      if (drag === null) return
      if (drag.type === 'marquee') {
        const selectionRect = pointToRect(drag.start, drag.end)
        const ids = mappingDraftRef.current.outputs
          .filter((output) => rectsIntersect(outputBounds(output), selectionRect))
          .map((output) => output.id)
        setSelectedOutputIds(ids)
        setSelectedGrabPoint(null)
        setMarqueeRect(null)
        if (ids.length > 0) {
          patchProjectionMapping({ activeOutputId: ids[0] })
          postMappingMessage(
            ids.length === 1
              ? '1 output selected'
              : `${ids.length} outputs selected`
          )
        } else {
          postMappingMessage('No outputs in selection')
        }
        dragStateRef.current = null
        return
      }
      dragStateRef.current = null
      patchProjectionMapping(() => mappingDraftRef.current)
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [patchProjectionMapping, postMappingMessage])

  const startCornerDrag = useCallback(
    (
      outputId: string,
      cornerIndex: CornerIndex,
      event: ReactPointerEvent<HTMLButtonElement>
    ) => {
      if (!mappingDraft.enabled) return
      if (event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()
      setSelectedOutputIds([outputId])
      setSelectedGrabPoint({ outputId, cornerIndex })
      dragStateRef.current = { type: 'corner', outputId, cornerIndex }
    },
    [mappingDraft.enabled]
  )

  const startMarqueeSelection = useCallback(
    (
      event:
        | ReactPointerEvent<SVGSVGElement>
        | ReactPointerEvent<SVGPolygonElement>
    ) => {
      if (!mappingDraft.enabled || !boxSelectEnabled) return
      if (event.button !== 0) return
      const frame = viewportFrameRef.current
      if (frame === null) return
      const rect = frame.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      event.preventDefault()
      event.stopPropagation()
      setSelectedGrabPoint(null)
      const start = {
        x: clamp01((event.clientX - rect.left) / rect.width),
        y: clamp01((event.clientY - rect.top) / rect.height),
      }
      dragStateRef.current = {
        type: 'marquee',
        start,
        end: start,
      }
      setMarqueeRect(pointToRect(start, start))
    },
    [boxSelectEnabled, mappingDraft.enabled]
  )

  const startOutputDrag = useCallback(
    (
      output: ProjectionMappingOutput,
      event: ReactPointerEvent<SVGPolygonElement>
    ) => {
      if (!mappingDraft.enabled) return
      if (event.button !== 0) return
      if (boxSelectEnabled) {
        startMarqueeSelection(event)
        return
      }
      const frame = viewportFrameRef.current
      if (frame === null) return
      const rect = frame.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.setPointerCapture?.(event.pointerId)
      setSelectedOutputIds([output.id])
      setSelectedGrabPoint(null)
      const pointer = {
        x: clamp01((event.clientX - rect.left) / rect.width),
        y: clamp01((event.clientY - rect.top) / rect.height),
      }
      dragStateRef.current = {
        type: 'output',
        outputId: output.id,
        start: pointer,
        initialCorners: output.corners.map((corner) => ({
          x: corner.x,
          y: corner.y,
        })) as OutputCorners,
      }
      patchProjectionMapping({ activeOutputId: output.id })
    },
    [
      boxSelectEnabled,
      mappingDraft.enabled,
      patchProjectionMapping,
      startMarqueeSelection,
    ]
  )

  const onOverlayPointerDown = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (!mappingDraft.enabled || event.button !== 0) return
      if (boxSelectEnabled) {
        startMarqueeSelection(event)
        return
      }
      const frame = viewportFrameRef.current
      if (frame === null) return
      const rect = frame.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const pointer = {
        x: clamp01((event.clientX - rect.left) / rect.width),
        y: clamp01((event.clientY - rect.top) / rect.height),
      }
      // Prefer currently selected outputs first, then remaining outputs.
      const ordered = [
        ...mappingDraft.outputs.filter((output) =>
          selectedOutputIds.includes(output.id)
        ),
        ...mappingDraft.outputs.filter(
          (output) => !selectedOutputIds.includes(output.id)
        ),
      ].reverse()
      const hit = ordered.find((output) => pointInPolygon(pointer, output.corners))
      if (hit) {
        event.preventDefault()
        event.stopPropagation()
        setSelectedOutputIds([hit.id])
        setSelectedGrabPoint(null)
        dragStateRef.current = {
          type: 'output',
          outputId: hit.id,
          start: pointer,
          initialCorners: hit.corners.map((corner) => ({
            x: corner.x,
            y: corner.y,
          })) as OutputCorners,
        }
        patchProjectionMapping({ activeOutputId: hit.id })
      }
    },
    [
      boxSelectEnabled,
      mappingDraft.enabled,
      mappingDraft.outputs,
      patchProjectionMapping,
      selectedOutputIds,
      startMarqueeSelection,
    ]
  )

  useEffect(() => {
    const onEditorKey = (event: KeyboardEvent) => {
      if (!mappingDraft.enabled || viewportOnly) return
      const target = event.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      if (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        target?.isContentEditable
      ) {
        return
      }
      const selection =
        selectedOutputIds.length > 0
          ? selectedOutputIds
          : activeOutput
          ? [activeOutput.id]
          : []
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selection.length <= 0) return
        if (mappingDraft.outputs.length <= selection.length) {
          event.preventDefault()
          postMappingMessage('At least one output is required')
          return
        }
        event.preventDefault()
        patchProjectionMapping((cur) => {
          const nextOutputs = cur.outputs.filter((o) => !selection.includes(o.id))
          if (nextOutputs.length <= 0) {
            return {}
          }
          return { activeOutputId: nextOutputs[0]?.id ?? null, outputs: nextOutputs }
        })
        setSelectedOutputIds([])
        setSelectedGrabPoint(null)
        postMappingMessage(
          selection.length === 1
            ? 'Output deleted'
            : `${selection.length} outputs deleted`
        )
        return
      }
      if (
        event.key === 'ArrowLeft' ||
        event.key === 'ArrowRight' ||
        event.key === 'ArrowUp' ||
        event.key === 'ArrowDown'
      ) {
        event.preventDefault()
        const stepPixels = event.shiftKey ? 8 : 1
        const dxPixels =
          event.key === 'ArrowLeft'
            ? -stepPixels
            : event.key === 'ArrowRight'
            ? stepPixels
            : 0
        const dyPixels =
          event.key === 'ArrowUp'
            ? -stepPixels
            : event.key === 'ArrowDown'
            ? stepPixels
            : 0
        const dx = dxPixels / Math.max(1, viewportSize.width)
        const dy = dyPixels / Math.max(1, viewportSize.height)
        if (selectedGrabPoint !== null) {
          patchProjectionMapping((cur) => {
            const outputIndex = cur.outputs.findIndex(
              (output) => output.id === selectedGrabPoint.outputId
            )
            if (outputIndex < 0) return {}
            const output = cur.outputs[outputIndex]
            const corner = output.corners[selectedGrabPoint.cornerIndex]
            if (!corner) return {}
            const nextCorner = {
              x: clamp01(corner.x + dx),
              y: clamp01(corner.y + dy),
            }
            if (
              Math.abs(nextCorner.x - corner.x) < 1e-8 &&
              Math.abs(nextCorner.y - corner.y) < 1e-8
            ) {
              return {}
            }
            const outputs = [...cur.outputs]
            outputs[outputIndex] = {
              ...output,
              corners: output.corners.map((value, index) =>
                index === selectedGrabPoint.cornerIndex ? nextCorner : value
              ) as OutputCorners,
            }
            return { outputs }
          })
          return
        }
        if (selection.length <= 0) return
        patchProjectionMapping((cur) => {
          const selectedSet = new Set(selection)
          const selectedOutputs = cur.outputs.filter((o) => selectedSet.has(o.id))
          if (selectedOutputs.length <= 0) return {}
          const allCorners = selectedOutputs.flatMap((output) => output.corners)
          const minX = Math.min(...allCorners.map((corner) => corner.x))
          const maxX = Math.max(...allCorners.map((corner) => corner.x))
          const minY = Math.min(...allCorners.map((corner) => corner.y))
          const maxY = Math.max(...allCorners.map((corner) => corner.y))
          const clampedDx = Math.max(-minX, Math.min(1 - maxX, dx))
          const clampedDy = Math.max(-minY, Math.min(1 - maxY, dy))
          if (Math.abs(clampedDx) < 1e-8 && Math.abs(clampedDy) < 1e-8) {
            return {}
          }
          const outputs = cur.outputs.map((output) => {
            if (!selectedSet.has(output.id)) return output
            return {
              ...output,
              corners: output.corners.map((corner) => ({
                x: clamp01(corner.x + clampedDx),
                y: clamp01(corner.y + clampedDy),
              })) as OutputCorners,
            }
          })
          return { outputs }
        })
      }
    }
    window.addEventListener('keydown', onEditorKey)
    return () => window.removeEventListener('keydown', onEditorKey)
  }, [
    activeOutput,
    mappingDraft.enabled,
    mappingDraft.outputs.length,
    patchProjectionMapping,
    postMappingMessage,
    selectedGrabPoint,
    selectedOutputIds,
    viewportSize.height,
    viewportSize.width,
    viewportOnly,
  ])

  useEffect(() => {
    const host = visualizerDiv.current
    if (host === null) return
    const targetAspect = visualSceneConfig.previewAspectRatio === '4:3' ? 4 / 3 : 16 / 9
    const updateViewport = () => {
      const width = host.clientWidth
      const height = host.clientHeight
      if (width <= 0 || height <= 0) return
      let nextWidth = width
      let nextHeight = Math.round(nextWidth / targetAspect)
      if (nextHeight > height) {
        nextHeight = height
        nextWidth = Math.round(nextHeight * targetAspect)
      }
      setViewportSize((current) =>
        current.width === nextWidth && current.height === nextHeight
          ? current
          : { width: nextWidth, height: nextHeight }
      )
    }
    const observer = new ResizeObserver(updateViewport)
    observer.observe(host)
    updateViewport()
    return () => observer.disconnect()
  }, [visualSceneConfig.previewAspectRatio])

  useEffect(() => {
    const maxFrameMs = 1000 / 60
    let lastUpdateTime: number | null = null
    let frameHandle: number | null = null
    let disposed = false
    const host = sourceHostRef.current
    if (host === null) return
    const vm = new VisualizerManager()
    const sourceCanvas = vm.getElement()
    sourceCanvasRef.current = sourceCanvas
    host.appendChild(sourceCanvas)

    const resize = () => vm.resize(host.clientWidth, host.clientHeight)
    const schedule = () => {
      if (disposed || frameHandle !== null) return
      frameHandle = requestAnimationFrame(animate)
    }
    const cancel = () => {
      if (frameHandle === null) return
      cancelAnimationFrame(frameHandle)
      frameHandle = null
    }
    let lastTraceAt = 0
    let traceWasLive = false
    const copyVisualizerFrame = (source: HTMLCanvasElement) => {
      if (source.width < 2 || source.height < 2) return
      let snap = frameSnapshotRef.current
      if (snap === null) {
        snap = document.createElement('canvas')
        frameSnapshotRef.current = snap
      }
      if (snap.width !== source.width || snap.height !== source.height) {
        snap.width = source.width
        snap.height = source.height
      }
      const ctx = snap.getContext('2d')
      if (!ctx) return
      ctx.drawImage(source, 0, 0)
    }
    const publishHeliosTrace = (source: HTMLCanvasElement) => {
      const cfg = traceConfigRef.current
      if (!cfg.armed || !cfg.enabled) {
        if (traceWasLive) {
          traceWasLive = false
          void heliosSetPoints([])
        }
        return
      }
      const tracedAt = performance.now()
      if (tracedAt - lastTraceAt < 70) return
      lastTraceAt = tracedAt
      const placed = placeTracePoints(
        traceVisualizerFrame(source, cfg.effect),
        traceWarpRef.current
      )
      if (placed.length === 0) {
        if (traceWasLive) {
          traceWasLive = false
          void heliosSetPoints([])
        }
        return
      }
      traceWasLive = true
      void heliosSetPoints(placed)
    }

    const animate = () => {
      frameHandle = null
      if (disposed || document.visibilityState !== 'visible') return
      const now = performance.now()
      if (lastUpdateTime === null) lastUpdateTime = now
      const elapsed = now - lastUpdateTime
      if (elapsed < maxFrameMs) {
        schedule()
        return
      }
      dt.current = elapsed
      if (now - lastFpsCommitRef.current >= 200) {
        setFpsDt(Math.max(0.0001, elapsed))
        lastFpsCommitRef.current = now
      }
      lastUpdateTime = now
      framePayloadRef.current.rt = realtimeStateRef.current
      framePayloadRef.current.state = cleanStateRef.current
      const updateStartMs = performance.now()
      vm.update(dt.current, framePayloadRef.current)
      const updateDurationMs = Math.max(0, performance.now() - updateStartMs)
      // Copy and trace before this turn yields. A later animation frame sees
      // a cleared WebGL drawing buffer, so the projection and the laser go blank.
      if (mappingDraftRef.current.enabled) {
        copyVisualizerFrame(sourceCanvas)
      }
      publishHeliosTrace(sourceCanvas)

      const perf = perfSampleRef.current
      const fps = elapsed > 0 ? 1000 / elapsed : 0
      perf.fpsEma += (fps - perf.fpsEma) * 0.08
      perf.updateMsEma += (updateDurationMs - perf.updateMsEma) * 0.1
      if (now - perf.lastPerfSampleMs >= PERF_SAMPLE_MS) {
        perf.lastPerfSampleMs = now
        const stats = vm.getRuntimeStats()
        const memory = (performance as Performance & {
          memory?: { usedJSHeapSize?: number; totalJSHeapSize?: number }
        }).memory
        const heapUsedMb = Number(memory?.usedJSHeapSize ?? 0) / (1024 * 1024)
        const heapTotalMb = Number(memory?.totalJSHeapSize ?? 0) / (1024 * 1024)

        sendTelemetryMark({
          source: 'visualizer-renderer',
          subsystem: 'visualizer.performance',
          metric: 'raf_fps',
          type: 'gauge',
          value: perf.fpsEma,
          unit: 'fps',
        })
        sendTelemetryMark({
          source: 'visualizer-renderer',
          subsystem: 'visualizer.performance',
          metric: 'update_dt_ms',
          type: 'gauge',
          value: perf.updateMsEma,
          unit: 'ms',
        })
        sendTelemetryMark({
          source: 'visualizer-renderer',
          subsystem: 'visualizer.performance',
          metric: 'renderer_memory_geometries',
          type: 'gauge',
          value: stats.memoryGeometries,
        })
        sendTelemetryMark({
          source: 'visualizer-renderer',
          subsystem: 'visualizer.performance',
          metric: 'renderer_memory_textures',
          type: 'gauge',
          value: stats.memoryTextures,
        })
        sendTelemetryMark({
          source: 'visualizer-renderer',
          subsystem: 'visualizer.performance',
          metric: 'renderer_render_calls',
          type: 'gauge',
          value: stats.renderCalls,
        })
        if (stats.shaderPrograms !== null) {
          sendTelemetryMark({
            source: 'visualizer-renderer',
            subsystem: 'visualizer.performance',
            metric: 'renderer_shader_programs',
            type: 'gauge',
            value: stats.shaderPrograms,
          })
        }
        if (heapUsedMb > 0) {
          sendTelemetryMark({
            source: 'visualizer-renderer',
            subsystem: 'visualizer.performance',
            metric: 'js_heap_used_mb',
            type: 'gauge',
            value: heapUsedMb,
            unit: 'MB',
          })
          sendTelemetryMark({
            source: 'visualizer-renderer',
            subsystem: 'visualizer.performance',
            metric: 'js_heap_total_mb',
            type: 'gauge',
            value: heapTotalMb,
            unit: 'MB',
          })
        }

        const nowMs = Date.now()
        const heapDelta = heapUsedMb > 0 ? heapUsedMb - perf.heapMbLast : 0
        const geometryDelta = stats.memoryGeometries - perf.geometryLast
        const textureDelta = stats.memoryTextures - perf.textureLast
        if (
          nowMs >= perf.growthWarnCooldownUntilMs &&
          (heapDelta >= 128 || geometryDelta >= 24 || textureDelta >= 16)
        ) {
          perf.growthWarnCooldownUntilMs = nowMs + 45000
          sendDiagnosticsEvent({
            source: 'visualizer-renderer',
            area: 'visualizer',
            event: 'renderer-growth-spike',
            level: 'warn',
            message: 'Visualizer resource growth spike detected',
            data: {
              heapDeltaMb: heapDelta,
              geometryDelta,
              textureDelta,
              heapUsedMb,
              memoryGeometries: stats.memoryGeometries,
              memoryTextures: stats.memoryTextures,
            },
          })
        }
        perf.heapMbLast = heapUsedMb > 0 ? heapUsedMb : perf.heapMbLast
        perf.geometryLast = stats.memoryGeometries
        perf.textureLast = stats.memoryTextures

        if (nowMs - perf.lastLiveSampleMs >= LIVE_SAMPLE_MS) {
          perf.lastLiveSampleMs = nowMs
          sendDiagnosticsEvent({
            source: 'visualizer-renderer',
            area: 'visualizer',
            event: 'live-sample',
            level: 'info',
            message: 'Visualizer live sample',
            data: {
              fpsEma: perf.fpsEma,
              updateMsEma: perf.updateMsEma,
              heapUsedMb,
              heapTotalMb,
              memoryGeometries: stats.memoryGeometries,
              memoryTextures: stats.memoryTextures,
              renderCalls: stats.renderCalls,
              renderTriangles: stats.renderTriangles,
              renderPoints: stats.renderPoints,
              renderLines: stats.renderLines,
              shaderPrograms: stats.shaderPrograms,
              transitionActive: stats.transitionActive,
            },
          })
        }
      }
      schedule()
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        lastUpdateTime = null
        lastFpsCommitRef.current = 0
        schedule()
      } else {
        cancel()
      }
    }

    const observer = new ResizeObserver(resize)
    observer.observe(host)
    document.addEventListener('visibilitychange', onVisibility)
    sendTelemetryMark({
      source: 'visualizer-renderer',
      subsystem: 'visualizer',
      metric: 'started',
      type: 'counter',
      by: 1,
    })
    resize()
    onVisibility()

    return () => {
      disposed = true
      cancel()
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      vm.dispose()
      mappingGpuRef.current?.dispose()
      mappingGpuRef.current = null
      if (sourceCanvasRef.current === sourceCanvas) sourceCanvasRef.current = null
      if (traceWasLive) {
        traceWasLive = false
        void heliosSetPoints([])
      }
      sendTelemetryMark({
        source: 'visualizer-renderer',
        subsystem: 'visualizer',
        metric: 'stopped',
        type: 'counter',
        by: 1,
      })
    }
  }, [])

  useEffect(() => {
    if (!mappingDraft.enabled) {
      setGpuMappingActive(false)
      mappingGpuRef.current?.dispose()
      mappingGpuRef.current = null
      return
    }

    let disposed = false
    let frameHandle: number | null = null
    const gpuCanvas = mappingGpuCanvasRef.current
    if (gpuCanvas !== null && mappingGpuRef.current === null) {
      mappingGpuRef.current = new ProjectionMappingGpuCompositor(gpuCanvas)
    }
    const gpu = mappingGpuRef.current
    const useGpu = gpu !== null && gpu.ok
    setGpuMappingActive(useGpu)

    const draw = () => {
      frameHandle = null
      if (disposed || document.visibilityState !== 'visible') return
      const source = frameSnapshotRef.current ?? sourceCanvasRef.current
      if (source !== null && source.width > 0 && source.height > 0) {
        if (useGpu && gpu !== null) {
          gpu.resize(viewportSize.width, viewportSize.height)
          const ok = gpu.draw(source, mappingDraft.outputs)
          if (!ok) {
            setGpuMappingActive(false)
          }
        } else {
          // Canvas2D fallback when WebGL compositor is unavailable.
          for (const output of mappingDraft.outputs) {
            if (!output.enabled) continue
            const canvas = outputCanvasRefs.current[output.id]
            if (!canvas) continue
            if (
              canvas.width !== viewportSize.width ||
              canvas.height !== viewportSize.height
            ) {
              canvas.width = viewportSize.width
              canvas.height = viewportSize.height
            }
            const ctx = canvas.getContext('2d')
            if (!ctx) continue
            const sr = output.sourceRect
            const sx = Math.round(sr.x * source.width)
            const sy = Math.round(sr.y * source.height)
            const sw = Math.max(1, Math.round(sr.width * source.width))
            const sh = Math.max(1, Math.round(sr.height * source.height))
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
          }
        }
      }
      frameHandle = requestAnimationFrame(draw)
    }
    frameHandle = requestAnimationFrame(draw)
    return () => {
      disposed = true
      if (frameHandle !== null) cancelAnimationFrame(frameHandle)
    }
  }, [mappingDraft.enabled, mappingDraft.outputs, viewportSize.height, viewportSize.width])

  const keystoneH = useMemo(() => {
    if (!activeOutput) return []
    const warp = homographyFromCorners(activeOutput.corners)
    const lines: string[] = []
    for (let i = 0; i <= KEYSTONE_DIV; i++) {
      const v = i / KEYSTONE_DIV
      const points: string[] = []
      for (let j = 0; j <= KEYSTONE_DIV; j++) {
        const u = j / KEYSTONE_DIV
        const p = projectNormalizedPoint(warp, activeOutput.corners, u, v)
        points.push(`${p.x * 100},${p.y * 100}`)
      }
      lines.push(points.join(' '))
    }
    return lines
  }, [activeOutput])

  const keystoneV = useMemo(() => {
    if (!activeOutput) return []
    const warp = homographyFromCorners(activeOutput.corners)
    const lines: string[] = []
    for (let i = 0; i <= KEYSTONE_DIV; i++) {
      const u = i / KEYSTONE_DIV
      const points: string[] = []
      for (let j = 0; j <= KEYSTONE_DIV; j++) {
        const v = j / KEYSTONE_DIV
        const p = projectNormalizedPoint(warp, activeOutput.corners, u, v)
        points.push(`${p.x * 100},${p.y * 100}`)
      }
      lines.push(points.join(' '))
    }
    return lines
  }, [activeOutput])

  return (
    <Root ref={visualizerDiv}>
      <CanvasViewport>
        <ViewportFrame ref={viewportFrameRef} style={{ width: `${viewportSize.width}px`, height: `${viewportSize.height}px` }}>
          <SourceStage ref={sourceHostRef} style={{ opacity: mappingDraft.enabled ? 0 : 1 }} />
          {mappingDraft.enabled ? (
            <>
              <MappingGpuCanvas
                ref={mappingGpuCanvasRef}
                style={{ display: gpuMappingActive ? 'block' : 'none' }}
              />
              {!gpuMappingActive ? (
                <OutputHost>
                  {mappingDraft.outputs.filter((o) => o.enabled).map((output) => (
                    <OutputSurface
                      key={output.id}
                      style={{
                        transform:
                          cssMatrix3dFromCorners(
                            output.corners,
                            viewportSize.width,
                            viewportSize.height
                          ) ?? 'none',
                      }}
                    >
                      <OutputCanvas
                        ref={(node) => {
                          outputCanvasRefs.current[output.id] = node
                        }}
                      />
                      {mappingDraft.showSelectedOutputGrid &&
                      activeOutput?.id === output.id ? (
                        <OutputGridOverlay />
                      ) : null}
                    </OutputSurface>
                  ))}
                </OutputHost>
              ) : mappingDraft.showSelectedOutputGrid && activeOutput ? (
                <OutputHost>
                  <OutputGridOverlay
                    style={{
                      clipPath: `polygon(${activeOutput.corners
                        .map((c) => `${c.x * 100}% ${c.y * 100}%`)
                        .join(', ')})`,
                    }}
                  />
                </OutputHost>
              ) : null}
            </>
          ) : null}

          {mappingDraft.enabled && !viewportOnly ? (
            <ProjectionOverlay onPointerDown={onOverlayPointerDown}>
              {mappingDraft.showAlignmentGrid && Array.from({ length: GRID_DIV + 1 }).map((_, i) => {
                const t = (i / GRID_DIV) * 100
                return <GridLine key={`v-${i}`} x1={`${t}%`} y1="0%" x2={`${t}%`} y2="100%" />
              })}
              {mappingDraft.showAlignmentGrid && Array.from({ length: GRID_DIV + 1 }).map((_, i) => {
                const t = (i / GRID_DIV) * 100
                return <GridLine key={`h-${i}`} x1="0%" y1={`${t}%`} x2="100%" y2={`${t}%`} />
              })}
              {mappingDraft.outputs.map((o) => (
                <ProjectionQuad
                  key={o.id}
                  $active={activeOutput?.id === o.id}
                  $selected={selectedOutputIds.includes(o.id)}
                  points={o.corners.map((c) => `${c.x * 100},${c.y * 100}`).join(' ')}
                  onPointerDown={(event) => startOutputDrag(o, event)}
                />
              ))}
              {mappingDraft.showKeystoneGrid ? keystoneH.map((p, i) => <KeystoneLine key={`kh-${i}`} points={p} />) : null}
              {mappingDraft.showKeystoneGrid ? keystoneV.map((p, i) => <KeystoneLine key={`kv-${i}`} points={p} />) : null}
              {marqueeRect ? (
                <MarqueeRect
                  x={`${marqueeRect.minX * 100}%`}
                  y={`${marqueeRect.minY * 100}%`}
                  width={`${(marqueeRect.maxX - marqueeRect.minX) * 100}%`}
                  height={`${(marqueeRect.maxY - marqueeRect.minY) * 100}%`}
                />
              ) : null}
            </ProjectionOverlay>
          ) : null}

          {mappingDraft.enabled && !viewportOnly && activeOutput
            ? activeOutput.corners.map((corner, index) => (
                <CornerHandle
                  key={`c-${index}`}
                  type="button"
                  $selected={
                    selectedGrabPoint?.outputId === activeOutput.id &&
                    selectedGrabPoint?.cornerIndex === index
                  }
                  style={{ left: `${corner.x * 100}%`, top: `${corner.y * 100}%` }}
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setSelectedGrabPoint({
                      outputId: activeOutput.id,
                      cornerIndex: index as CornerIndex,
                    })
                  }}
                  onPointerDown={(event) => startCornerDrag(activeOutput.id, index as CornerIndex, event)}
                />
              ))
            : null}
        </ViewportFrame>
      </CanvasViewport>

      {!viewportOnly ? <FPS dt={fpsDt} /> : null}

      {!viewportOnly && mappingDraft.enabled ? (
        <TopLeftButtons>
          <>
              <ProjectionSmallButton type="button" $active={mappingDraft.showAlignmentGrid} onClick={() => patchProjectionMapping((cur) => ({ showAlignmentGrid: !cur.showAlignmentGrid }))}>Align Grid</ProjectionSmallButton>
              <ProjectionSmallButton type="button" $active={mappingDraft.showKeystoneGrid} onClick={() => patchProjectionMapping((cur) => ({ showKeystoneGrid: !cur.showKeystoneGrid }))}>Keystone</ProjectionSmallButton>
              <ProjectionSmallButton
                type="button"
                $active={mappingDraft.showSelectedOutputGrid}
                onClick={() =>
                  patchProjectionMapping((cur) => ({
                    showSelectedOutputGrid: !cur.showSelectedOutputGrid,
                  }))
                }
                title="Show grid overlay on selected output in projection"
              >
                Output Grid
              </ProjectionSmallButton>
              <ProjectionSmallButton
                type="button"
                $active={boxSelectEnabled}
                onClick={() => setBoxSelectEnabled((current) => !current)}
                title="Enable marquee selection mode"
              >
                Box Select {boxSelectEnabled ? 'On' : 'Off'}
              </ProjectionSmallButton>
              <OutputSelect
                value={activeOutput?.id ?? ''}
                onChange={(event) => {
                  const nextId = event.target.value
                  setSelectedOutputIds([nextId])
                  setSelectedGrabPoint(null)
                  patchProjectionMapping({ activeOutputId: nextId })
                }}
              >
                {mappingDraft.outputs.map((o, i) => <option key={o.id} value={o.id}>{o.name || `Output ${i + 1}`}</option>)}
              </OutputSelect>
              <ProjectionSmallButton
                type="button"
                $active={false}
                onClick={() => {
                  patchProjectionMapping((cur) => {
                    const nextIndex = cur.outputs.length + 1
                    const output: ProjectionMappingOutput = {
                      id: makeOutputId(),
                      name: `Output ${nextIndex}`,
                      enabled: true,
                      sourceRect: { x: 0, y: 0, width: 1, height: 1 },
                      corners: [
                        { x: 0, y: 0 },
                        { x: 1, y: 0 },
                        { x: 1, y: 1 },
                        { x: 0, y: 1 },
                      ],
                    }
                    return {
                      activeOutputId: output.id,
                      outputs: [...cur.outputs, output],
                    }
                  })
                }}
              >
                Add
              </ProjectionSmallButton>
              <ProjectionSmallButton type="button" $active={false} onClick={() => {
                if (!activeOutput) return
                const copy = { ...activeOutput, id: makeOutputId(), name: `${activeOutput.name} Copy`, corners: activeOutput.corners.map((c) => ({ x: clamp01(c.x + 0.04), y: clamp01(c.y + 0.04) })) as ProjectionMappingOutput['corners'] }
                patchProjectionMapping((cur) => ({ activeOutputId: copy.id, outputs: [...cur.outputs, copy] }))
              }}>Duplicate</ProjectionSmallButton>
              <ProjectionSmallButton type="button" $active={false} onClick={() => {
                if (!activeOutput) return
                const split = split2x2(activeOutput)
                patchProjectionMapping((cur) => {
                  const index = cur.outputs.findIndex((o) => o.id === activeOutput.id)
                  if (index < 0) return {}
                  const outputs = [...cur.outputs]
                  outputs.splice(index, 1, ...split)
                  return { activeOutputId: split[0].id, outputs }
                })
              }}>Split 2x2</ProjectionSmallButton>
              <ProjectionSmallButton type="button" $active={false} onClick={() => {
                const selection =
                  selectedOutputIds.length > 0
                    ? selectedOutputIds
                    : activeOutput
                    ? [activeOutput.id]
                    : []
                if (selection.length <= 0) return
                const canDelete = mappingDraft.outputs.length > selection.length
                if (!canDelete) {
                  postMappingMessage('At least one output is required')
                  return
                }
                patchProjectionMapping((cur) => {
                  const outputs = cur.outputs.filter((o) => !selection.includes(o.id))
                  return { activeOutputId: outputs[0]?.id ?? null, outputs }
                })
                setSelectedOutputIds([])
                setSelectedGrabPoint(null)
                postMappingMessage(
                  selection.length === 1
                    ? 'Output deleted'
                    : `${selection.length} outputs deleted`
                )
              }}>Delete</ProjectionSmallButton>
              <ProjectionSmallButton type="button" $active={false} onClick={() => {
                mappingClipboardRef.current = cloneProjectionMapping(mappingDraftRef.current)
                postMappingMessage('Mapping copied')
              }}>Copy</ProjectionSmallButton>
              <ProjectionSmallButton type="button" $active={false} onClick={() => {
                if (!mappingClipboardRef.current) { postMappingMessage('No copied mapping yet'); return }
                patchProjectionMapping(cloneProjectionMapping(mappingClipboardRef.current))
                postMappingMessage('Mapping pasted')
              }}>Paste</ProjectionSmallButton>
              <ProjectionSmallButton type="button" $active={false} onClick={() => {
                dispatch(setAllVisualScenesProjectionMapping(sanitizeProjectionMapping(mappingDraftRef.current)))
                postMappingMessage('Copied mapping to all visual scenes')
              }}>Copy To All</ProjectionSmallButton>
          </>
        </TopLeftButtons>
      ) : null}

      {!viewportOnly && mappingMessage.trim().length > 0 ? <MappingToast>{mappingMessage}</MappingToast> : null}

      {!viewportOnly ? (
        <TopRightButtons>
          <IconButton title="Streaming Settings" onClick={() => setStreamingOpen(true)}>
            <CastConnectedIcon />
          </IconButton>
          <OpenVisualizerButton />
        </TopRightButtons>
      ) : null}

      {!viewportOnly ? (
        <VisualizerStreamingModal open={streamingOpen} onClose={() => setStreamingOpen(false)} />
      ) : null}

      {!viewportOnly ? <HeliosOutputPanel onTraceConfig={onTraceConfig} /> : null}
    </Root>
  )
}

const Root = styled.div`position: relative; flex: 1 0 0; height: 100%; overflow: hidden;`
const CanvasViewport = styled.div`position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; overflow: hidden;`
const ViewportFrame = styled.div`position: relative;`
const SourceStage = styled.div`position: absolute; inset: 0; background: #000; transition: opacity 140ms linear;`
const MappingGpuCanvas = styled.canvas`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 2;
  background: #000;
`
const OutputHost = styled.div`position: absolute; inset: 0; pointer-events: none; z-index: 2;`
const OutputSurface = styled.div`position: absolute; inset: 0; transform-origin: 0 0; will-change: transform;`
const OutputCanvas = styled.canvas`position: absolute; inset: 0; width: 100%; height: 100%;`
const OutputGridOverlay = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(to right, rgba(255, 255, 255, 0.28) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255, 255, 255, 0.28) 1px, transparent 1px);
  background-size: calc(100% / ${GRID_DIV}) calc(100% / ${GRID_DIV});
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35);
`
const ProjectionOverlay = styled.svg`position: absolute; inset: 0; width: 100%; height: 100%; z-index: 3; pointer-events: auto;`
const GridLine = styled.line`stroke: #ffffff28; stroke-width: 0.22; pointer-events: none;`
const KeystoneLine = styled.polyline`fill: none; stroke: #67d4ff66; stroke-width: 0.26; pointer-events: none;`
const ProjectionQuad = styled.polygon<{ $active: boolean; $selected: boolean }>`
  fill: rgba(0, 0, 0, 0.001);
  stroke: ${(props) =>
    props.$active
      ? '#7fe6ff'
      : props.$selected
      ? '#9dd0ffcc'
      : '#4f8da755'};
  stroke-width: ${(props) => (props.$active ? 0.46 : props.$selected ? 0.38 : 0.3)};
  pointer-events: auto;
  cursor: pointer;
`
const MarqueeRect = styled.rect`
  fill: rgba(111, 212, 255, 0.12);
  stroke: #80dcff;
  stroke-width: 0.32;
  stroke-dasharray: 0.7 0.45;
  pointer-events: none;
`
const CornerHandle = styled.button<{ $selected: boolean }>`
  position: absolute;
  z-index: 4;
  width: 16px;
  height: 16px;
  margin-left: -8px;
  margin-top: -8px;
  border-radius: 999px;
  border: 1px solid ${(props) => (props.$selected ? '#ffffff' : '#d8f5ff')};
  background: ${(props) => (props.$selected ? '#13a9ff' : '#2ec8ff')};
  box-shadow: ${(props) =>
    props.$selected
      ? '0 0 0 2px #57ceff66, 0 0 0 1px #000000aa'
      : '0 0 0 1px #000000aa'};
  cursor: grab;
  padding: 0;
  &:active {
    cursor: grabbing;
  }
`
const TopLeftButtons = styled.div`position: absolute; left: 1rem; top: 2.6rem; display: flex; align-items: center; gap: 0.35rem; z-index: 5; flex-wrap: wrap; max-width: calc(100% - 10rem);`
const ProjectionSmallButton = styled.button<{ $active: boolean }>`border: 1px solid ${(props) => (props.$active ? '#67d4ff' : '#ffffff3a')}; background: ${(props) => (props.$active ? '#12394a' : '#0f1724cc')}; color: #dbe8ff; border-radius: 0.28rem; padding: 0.2rem 0.44rem; font-size: 0.68rem; cursor: pointer;`
const OutputSelect = styled.select`border: 1px solid #ffffff3a; background: #0f1724cc; color: #dbe8ff; border-radius: 0.28rem; padding: 0.2rem 0.44rem; font-size: 0.68rem; max-width: 10rem;`
const MappingToast = styled.div`position: absolute; left: 1rem; bottom: 0.9rem; z-index: 5; border: 1px solid #ffffff3f; background: #0f1726df; color: #e5eeff; border-radius: 0.3rem; padding: 0.2rem 0.45rem; font-size: 0.7rem; pointer-events: none;`
const TopRightButtons = styled.div`position: absolute; right: 1rem; top: 1rem; display: flex; align-items: center; gap: 0.25rem; z-index: 5;`
