import {
  HELIOS_MAX_POINTS,
  type HeliosPoint,
} from '../../shared/heliosOutput'
import {
  homographyFromCorners,
  projectNormalizedPoint,
  type PlanePoint,
} from '../../shared/projectionHomography'

export type HeliosTraceEffect = 'edges' | 'dots'

export interface TraceWarp {
  corners: readonly PlanePoint[]
  sourceRect: { x: number; y: number; width: number; height: number }
}

const SAMPLE_W = 80
const SAMPLE_H = 45
const EDGE_MAG = 46
const DOT_LUMA = 32

let sampleCanvas: HTMLCanvasElement | null = null

function luma(data: Uint8ClampedArray, index: number): number {
  return (
    data[index]! * 0.2126 +
    data[index + 1]! * 0.7152 +
    data[index + 2]! * 0.0722
  )
}

function lumaAt(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number
): number {
  return luma(data, (y * width + x) * 4)
}

function withTravelBlanks(lit: HeliosPoint[]): HeliosPoint[] {
  const out: HeliosPoint[] = []
  let prev: HeliosPoint | null = null
  for (const point of lit) {
    if (out.length >= HELIOS_MAX_POINTS) break
    if (prev) {
      const dx = point.x - prev.x
      const dy = point.y - prev.y
      if (dx * dx + dy * dy > 0.0035 && out.length < HELIOS_MAX_POINTS) {
        out.push({ x: point.x, y: point.y, r: 0, g: 0, b: 0, blank: true })
      }
    }
    if (out.length >= HELIOS_MAX_POINTS) break
    out.push(point)
    prev = point
  }
  return out
}

function colorAt(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number
): Pick<HeliosPoint, 'r' | 'g' | 'b'> {
  const i = (y * width + x) * 4
  return {
    r: data[i]! / 255,
    g: data[i + 1]! / 255,
    b: data[i + 2]! / 255,
  }
}

function edgePoints(image: ImageData): HeliosPoint[] {
  const { data, width, height } = image
  const lit: HeliosPoint[] = []
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const gx =
        -lumaAt(data, width, x - 1, y - 1) +
        lumaAt(data, width, x + 1, y - 1) +
        -2 * lumaAt(data, width, x - 1, y) +
        2 * lumaAt(data, width, x + 1, y) +
        -lumaAt(data, width, x - 1, y + 1) +
        lumaAt(data, width, x + 1, y + 1)
      const gy =
        -lumaAt(data, width, x - 1, y - 1) -
        2 * lumaAt(data, width, x, y - 1) -
        lumaAt(data, width, x + 1, y - 1) +
        lumaAt(data, width, x - 1, y + 1) +
        2 * lumaAt(data, width, x, y + 1) +
        lumaAt(data, width, x + 1, y + 1)
      if (Math.hypot(gx, gy) < EDGE_MAG) continue
      lit.push({
        x: width <= 1 ? 0 : x / (width - 1),
        y: height <= 1 ? 0 : y / (height - 1),
        ...colorAt(data, width, x, y),
      })
      if (lit.length >= HELIOS_MAX_POINTS) {
        return withTravelBlanks(lit)
      }
    }
  }
  return withTravelBlanks(lit)
}

function dotPoints(image: ImageData): HeliosPoint[] {
  const { data, width, height } = image
  const lit: HeliosPoint[] = []
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4
      if (luma(data, i) < DOT_LUMA) continue
      lit.push({
        x: width <= 1 ? 0 : x / (width - 1),
        y: height <= 1 ? 0 : y / (height - 1),
        r: data[i]! / 255,
        g: data[i + 1]! / 255,
        b: data[i + 2]! / 255,
      })
      if (lit.length >= HELIOS_MAX_POINTS) break
    }
    if (lit.length >= HELIOS_MAX_POINTS) break
  }
  return withTravelBlanks(lit)
}

/** One downscale of the visualizer canvas the projection compositor already draws. */
export function traceVisualizerFrame(
  source: HTMLCanvasElement,
  effect: HeliosTraceEffect
): HeliosPoint[] {
  if (source.width < 2 || source.height < 2) return []
  if (sampleCanvas === null) {
    sampleCanvas = document.createElement('canvas')
    sampleCanvas.width = SAMPLE_W
    sampleCanvas.height = SAMPLE_H
  }
  const ctx = sampleCanvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return []
  ctx.drawImage(source, 0, 0, SAMPLE_W, SAMPLE_H)
  const image = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H)
  return effect === 'edges' ? edgePoints(image) : dotPoints(image)
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/**
 * Full-frame points stay normalized when mapping is off.
 * When mapping is on, points in the active output's source rect are run
 * through that output's keystone.
 */
export function placeTracePoints(
  points: HeliosPoint[],
  warp: TraceWarp | null
): HeliosPoint[] {
  if (!warp || warp.corners.length < 4) return points
  const width = warp.sourceRect.width
  const height = warp.sourceRect.height
  if (!(width > 0) || !(height > 0)) return points
  const homography = homographyFromCorners(warp.corners)
  const placed: HeliosPoint[] = []
  for (const point of points) {
    const u = (point.x - warp.sourceRect.x) / width
    const v = (point.y - warp.sourceRect.y) / height
    if (u < -0.02 || v < -0.02 || u > 1.02 || v > 1.02) continue
    const q = projectNormalizedPoint(
      homography,
      warp.corners,
      clamp01(u),
      clamp01(v)
    )
    placed.push({
      ...point,
      x: clamp01(q.x),
      y: clamp01(q.y),
    })
  }
  return placed
}
