/**
 * One keystone homography for projection mapping.
 * Corner order matches `ProjectionMappingOutput.corners`:
 * 0 top-left, 1 top-right, 2 bottom-right, 3 bottom-left.
 * A normalized source point in the unit square maps to an output point
 * in the same space as those corners.
 */

export interface PlanePoint {
  x: number
  y: number
}

/** 3×3 homography with h33 fixed at 1. */
export interface Homography {
  h11: number
  h12: number
  h13: number
  h21: number
  h22: number
  h23: number
  h31: number
  h32: number
}

const UNIT_SQUARE: readonly PlanePoint[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
]

function solve8x8(matrix: number[][], vector: number[]): number[] | null {
  const n = 8
  for (let p = 0; p < n; p++) {
    let max = p
    for (let r = p + 1; r < n; r++) {
      if (Math.abs(matrix[r]![p]!) > Math.abs(matrix[max]![p]!)) max = r
    }
    if (Math.abs(matrix[max]![p]!) < 1e-9) return null
    if (max !== p) {
      const tr = matrix[p]!
      matrix[p] = matrix[max]!
      matrix[max] = tr
      const tv = vector[p]!
      vector[p] = vector[max]!
      vector[max] = tv
    }
    const pv = matrix[p]![p]!
    for (let c = p; c < n; c++) matrix[p]![c] = matrix[p]![c]! / pv
    vector[p] = vector[p]! / pv
    for (let r = 0; r < n; r++) {
      if (r === p) continue
      const f = matrix[r]![p]!
      if (Math.abs(f) < 1e-9) continue
      for (let c = p; c < n; c++) matrix[r]![c] = matrix[r]![c]! - f * matrix[p]![c]!
      vector[r] = vector[r]! - f * vector[p]!
    }
  }
  return vector
}

/** Four source points → four destination points. Returns null if the quad is degenerate. */
export function solveHomography(
  src: readonly PlanePoint[],
  dst: readonly PlanePoint[]
): Homography | null {
  if (src.length < 4 || dst.length < 4) return null
  const m: number[][] = []
  const v: number[] = []
  for (let i = 0; i < 4; i++) {
    const x = src[i]!.x
    const y = src[i]!.y
    const u = dst[i]!.x
    const w = dst[i]!.y
    m.push([x, y, 1, 0, 0, 0, -u * x, -u * y])
    v.push(u)
    m.push([0, 0, 0, x, y, 1, -w * x, -w * y])
    v.push(w)
  }
  const s = solve8x8(m, v)
  if (s === null) return null
  const [h11, h12, h13, h21, h22, h23, h31, h32] = s
  if (
    h11 === undefined ||
    h12 === undefined ||
    h13 === undefined ||
    h21 === undefined ||
    h22 === undefined ||
    h23 === undefined ||
    h31 === undefined ||
    h32 === undefined
  ) {
    return null
  }
  return { h11, h12, h13, h21, h22, h23, h31, h32 }
}

export function applyHomography(h: Homography, point: PlanePoint): PlanePoint {
  const w = h.h31 * point.x + h.h32 * point.y + 1
  if (!Number.isFinite(w) || Math.abs(w) < 1e-12) {
    return { x: point.x, y: point.y }
  }
  const x = (h.h11 * point.x + h.h12 * point.y + h.h13) / w
  const y = (h.h21 * point.x + h.h22 * point.y + h.h23) / w
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { x: point.x, y: point.y }
  }
  return { x, y }
}

/** Normalized unit square → output corners. */
export function homographyFromCorners(
  corners: readonly PlanePoint[]
): Homography | null {
  if (corners.length < 4) return null
  return solveHomography(UNIT_SQUARE, [
    corners[0]!,
    corners[1]!,
    corners[2]!,
    corners[3]!,
  ])
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function bilinearQuad(
  corners: readonly PlanePoint[],
  u: number,
  v: number
): PlanePoint {
  const c0 = corners[0] ?? { x: 0, y: 0 }
  const c1 = corners[1] ?? { x: 1, y: 0 }
  const c2 = corners[2] ?? { x: 1, y: 1 }
  const c3 = corners[3] ?? { x: 0, y: 1 }
  const topX = lerp(c0.x, c1.x, u)
  const topY = lerp(c0.y, c1.y, u)
  const botX = lerp(c3.x, c2.x, u)
  const botY = lerp(c3.y, c2.y, u)
  return { x: lerp(topX, botX, v), y: lerp(topY, botY, v) }
}

/**
 * Map a normalized source point through the corner homography.
 * A singular quad falls back to bilinear so the mesh still draws.
 */
export function projectNormalizedPoint(
  homography: Homography | null,
  corners: readonly PlanePoint[],
  u: number,
  v: number
): PlanePoint {
  if (homography) return applyHomography(homography, { x: u, y: v })
  return bilinearQuad(corners, u, v)
}

/**
 * CSS `matrix3d` for the Canvas2D fallback. Solved in pixel space so the
 * element box (0..width, 0..height) lands on the output corners.
 */
export function cssMatrix3dFromCorners(
  corners: readonly PlanePoint[],
  width: number,
  height: number
): string | null {
  if (width <= 0 || height <= 0 || corners.length < 4) return null
  const src: PlanePoint[] = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ]
  const dst: PlanePoint[] = [0, 1, 2, 3].map((i) => ({
    x: corners[i]!.x * width,
    y: corners[i]!.y * height,
  }))
  const h = solveHomography(src, dst)
  if (!h) return null
  const values = [
    h.h11,
    h.h21,
    0,
    h.h31,
    h.h12,
    h.h22,
    0,
    h.h32,
    0,
    0,
    1,
    0,
    h.h13,
    h.h23,
    0,
    1,
  ]
  return `matrix3d(${values.map((x) => Number(x.toFixed(8))).join(',')})`
}
