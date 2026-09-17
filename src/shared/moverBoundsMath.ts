import {
  DMX_MAX_VALUE,
  DMX_MIN_VALUE,
  initMoverBounds,
  type MoverBoundCorner,
  type MoverBounds,
} from './dmxFixtures'

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function clampDmxValue(value: number, fallback: number = DMX_MIN_VALUE): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(DMX_MAX_VALUE, Math.max(DMX_MIN_VALUE, Math.round(value)))
}

function getMoverBoundValue(
  bounds: MoverBounds,
  corner: keyof MoverBounds,
  axis: 'pan' | 'tilt',
  fallback: number
): number {
  const rawValue = Number(bounds[corner][axis])
  return clampDmxValue(Number.isFinite(rawValue) ? rawValue : fallback)
}

/** Bilinear pad UV → pan/tilt DMX from calibrated floor corners. */
export function interpolateBounds(
  bounds: MoverBounds,
  x: number,
  y: number
): { pan: number; tilt: number } {
  const clampedX = clamp01(x)
  const clampedY = clamp01(y)

  const topPan =
    getMoverBoundValue(bounds, 'topLeft', 'pan', DMX_MIN_VALUE) +
    (getMoverBoundValue(bounds, 'topRight', 'pan', DMX_MAX_VALUE) -
      getMoverBoundValue(bounds, 'topLeft', 'pan', DMX_MIN_VALUE)) *
      clampedX
  const bottomPan =
    getMoverBoundValue(bounds, 'bottomLeft', 'pan', DMX_MIN_VALUE) +
    (getMoverBoundValue(bounds, 'bottomRight', 'pan', DMX_MAX_VALUE) -
      getMoverBoundValue(bounds, 'bottomLeft', 'pan', DMX_MIN_VALUE)) *
      clampedX
  const pan = topPan + (bottomPan - topPan) * clampedY

  const topTilt =
    getMoverBoundValue(bounds, 'topLeft', 'tilt', DMX_MAX_VALUE) +
    (getMoverBoundValue(bounds, 'topRight', 'tilt', DMX_MAX_VALUE) -
      getMoverBoundValue(bounds, 'topLeft', 'tilt', DMX_MAX_VALUE)) *
      clampedX
  const bottomTilt =
    getMoverBoundValue(bounds, 'bottomLeft', 'tilt', DMX_MIN_VALUE) +
    (getMoverBoundValue(bounds, 'bottomRight', 'tilt', DMX_MIN_VALUE) -
      getMoverBoundValue(bounds, 'bottomLeft', 'tilt', DMX_MIN_VALUE)) *
      clampedX
  const tilt = topTilt + (bottomTilt - topTilt) * clampedY

  return { pan, tilt }
}

export function estimateSpotFromBounds(
  bounds: MoverBounds,
  panDmx: number,
  tiltDmx: number
): { x: number; y: number; confidence: number } {
  let centerX = 0.5
  let centerY = 0.5
  let span = 1
  let bestX = 0.5
  let bestY = 0.5
  let bestError = Number.POSITIVE_INFINITY

  for (let pass = 0; pass < 4; pass++) {
    const samples = pass === 0 ? 13 : 9
    for (let yi = 0; yi < samples; yi++) {
      for (let xi = 0; xi < samples; xi++) {
        const relX = samples <= 1 ? 0.5 : xi / (samples - 1)
        const relY = samples <= 1 ? 0.5 : yi / (samples - 1)
        const x = clamp01(centerX + (relX - 0.5) * span)
        const y = clamp01(centerY + (relY - 0.5) * span)
        const estimate = interpolateBounds(bounds, x, y)
        const panError = estimate.pan - panDmx
        const tiltError = estimate.tilt - tiltDmx
        const score = panError * panError + tiltError * tiltError
        if (score < bestError) {
          bestError = score
          bestX = x
          bestY = y
        }
      }
    }
    centerX = bestX
    centerY = bestY
    span *= 0.38
  }

  const normalizedError = Math.sqrt(bestError) / 255
  return {
    x: bestX,
    y: bestY,
    confidence: clamp01(1 - normalizedError),
  }
}

function cornerDiffers(
  corner: MoverBoundCorner,
  defaults: MoverBoundCorner,
  epsilon = 0.5
): boolean {
  return (
    Math.abs(Number(corner.pan) - Number(defaults.pan)) > epsilon ||
    Math.abs(Number(corner.tilt) - Number(defaults.tilt)) > epsilon
  )
}

/** True when bounds look calibrated (not still init defaults). */
export function moverBoundsLookCalibrated(bounds: MoverBounds | undefined): boolean {
  if (bounds === undefined) {
    return false
  }
  const defaults = initMoverBounds()
  return (
    cornerDiffers(bounds.topLeft, defaults.topLeft) ||
    cornerDiffers(bounds.topRight, defaults.topRight) ||
    cornerDiffers(bounds.bottomLeft, defaults.bottomLeft) ||
    cornerDiffers(bounds.bottomRight, defaults.bottomRight)
  )
}

export function clampMoverBoundCorner(corner: MoverBoundCorner): MoverBoundCorner {
  return {
    pan: clampDmxValue(corner.pan),
    tilt: clampDmxValue(corner.tilt),
  }
}
