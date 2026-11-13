/** One Helios DAC. Points are normalized 0..1. Output stays blank until armed. */

export const HELIOS_VID = 0x1209
export const HELIOS_PID = 0xe500
/** Conservative frame cap. The DAC protocol itself allows 4095. */
export const HELIOS_MAX_POINTS = 3000
export const HELIOS_POINT_RATE_PPS = 30000

export interface HeliosPoint {
  x: number
  y: number
  r: number
  g: number
  b: number
  blank?: boolean
}

export interface HeliosDeviceChoice {
  index: number
  label: string
}

export interface HeliosScanResult {
  devices: HeliosDeviceChoice[]
  error?: string
}

export interface HeliosStatus {
  connected: boolean
  armed: boolean
  deviceIndex: number | null
  deviceLabel: string | null
  lastError: string | null
  pointCount: number
  sendingTestPattern: boolean
}

function clamp01(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

/** Drop invalid samples and cap the frame. Does not touch a DAC. */
export function clampHeliosPoints(points: unknown): HeliosPoint[] {
  if (!Array.isArray(points)) return []
  const out: HeliosPoint[] = []
  const n = Math.min(points.length, HELIOS_MAX_POINTS)
  for (let i = 0; i < n; i++) {
    const raw = points[i]
    if (!raw || typeof raw !== 'object') continue
    const p = raw as Partial<HeliosPoint>
    const x = clamp01(p.x)
    const y = clamp01(p.y)
    out.push({
      x,
      y,
      r: clamp01(p.r),
      g: clamp01(p.g),
      b: clamp01(p.b),
      blank: p.blank === true,
    })
  }
  return out
}

export function heliosTestPatternPoints(): HeliosPoint[] {
  const points: HeliosPoint[] = []
  const x0 = 0.32
  const y0 = 0.32
  const x1 = 0.68
  const y1 = 0.68
  const edge = 48
  const pushLine = (
    ax: number,
    ay: number,
    bx: number,
    by: number,
    blank: boolean
  ) => {
    for (let i = 0; i < edge; i++) {
      const t = i / edge
      points.push({
        x: ax + (bx - ax) * t,
        y: ay + (by - ay) * t,
        r: 0,
        g: blank ? 0 : 1,
        b: 0,
        blank,
      })
    }
  }
  pushLine(x0, y0, x0, y0, true)
  pushLine(x0, y0, x1, y0, false)
  pushLine(x1, y0, x1, y1, false)
  pushLine(x1, y1, x0, y1, false)
  pushLine(x0, y1, x0, y0, false)
  return points
}

export function emptyHeliosStatus(lastError: string | null = null): HeliosStatus {
  return {
    connected: false,
    armed: false,
    deviceIndex: null,
    deviceLabel: null,
    lastError,
    pointCount: 0,
    sendingTestPattern: false,
  }
}
