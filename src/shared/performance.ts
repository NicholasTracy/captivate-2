import { nanoid } from 'nanoid'

export type PerformanceControlKind = 'pad' | 'slider'

/** Snap-grid cell placement (integer cells). */
export interface PerformanceGridCell {
  x: number
  y: number
  w: number
  h: number
}

export interface PerformanceControl {
  id: string
  kind: PerformanceControlKind
  /** Display name (user or auto from first destination). */
  label: string
  /** When true, rebinding destinations must not overwrite `label`. */
  manuallyRenamed: boolean
  grid: PerformanceGridCell
  /** Live 0..1 value (sliders continuous; pads pulse 0/1). */
  value: number
  /** Accent color (CSS hex) for the pad/slider chrome. */
  color: string
}

export interface PerformanceBank {
  /** Grid width in cells. */
  cols: number
  /** Grid height in cells. */
  rows: number
  /**
   * When true, canvas allows add / remove / drag.
   * When false (default), controls are performance-only.
   */
  editUnlocked: boolean
  controls: { [id: string]: PerformanceControl }
  order: string[]
}

/** ~25% smaller cells than the original 8×8 when filling the same area. */
export const PERFORMANCE_DEFAULT_COLS = 11
export const PERFORMANCE_DEFAULT_ROWS = 11
export const PERFORMANCE_PAD_SIZE = { w: 2, h: 2 } as const
/** One cell wide, tall enough for a usable vertical fader. */
export const PERFORMANCE_SLIDER_SIZE = { w: 1, h: 4 } as const

export const PERFORMANCE_COLOR_PRESETS = [
  '#5b8def',
  '#5ecf8a',
  '#f0c14a',
  '#e86a5c',
  '#c084fc',
  '#38bdf8',
  '#fb923c',
  '#f472b6',
] as const

export const PERFORMANCE_DEFAULT_COLOR = PERFORMANCE_COLOR_PRESETS[0]

const HEX_COLOR_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/

export function normalizePerformanceColor(raw: unknown): string {
  if (typeof raw !== 'string') return PERFORMANCE_DEFAULT_COLOR
  const trimmed = raw.trim()
  if (!HEX_COLOR_RE.test(trimmed)) return PERFORMANCE_DEFAULT_COLOR
  if (trimmed.length === 4) {
    const r = trimmed[1]!
    const g = trimmed[2]!
    const b = trimmed[3]!
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  return trimmed.toLowerCase()
}

export function initPerformanceBank(): PerformanceBank {
  return {
    cols: PERFORMANCE_DEFAULT_COLS,
    rows: PERFORMANCE_DEFAULT_ROWS,
    editUnlocked: false,
    controls: {},
    order: [],
  }
}

export function defaultPerformanceLabel(kind: PerformanceControlKind): string {
  return kind === 'pad' ? 'Pad' : 'Slider'
}

export function createPerformanceControl(
  kind: PerformanceControlKind,
  grid: PerformanceGridCell,
  label?: string,
  color?: string
): PerformanceControl {
  return {
    id: nanoid(),
    kind,
    label: label?.trim() || defaultPerformanceLabel(kind),
    manuallyRenamed: false,
    grid: normalizeGridCell(grid, kind),
    value: 0,
    color: normalizePerformanceColor(color ?? PERFORMANCE_DEFAULT_COLOR),
  }
}

export function normalizeGridCell(
  grid: Partial<PerformanceGridCell> | undefined,
  kind: PerformanceControlKind
): PerformanceGridCell {
  const size = kind === 'pad' ? PERFORMANCE_PAD_SIZE : PERFORMANCE_SLIDER_SIZE
  const x = Number.isFinite(grid?.x) ? Math.max(0, Math.round(grid!.x!)) : 0
  const y = Number.isFinite(grid?.y) ? Math.max(0, Math.round(grid!.y!)) : 0
  return { x, y, w: size.w, h: size.h }
}

export function clampGridToBank(
  cell: PerformanceGridCell,
  cols: number,
  rows: number
): PerformanceGridCell {
  const w = Math.min(cell.w, Math.max(1, cols))
  const h = Math.min(cell.h, Math.max(1, rows))
  const x = Math.min(Math.max(0, cell.x), Math.max(0, cols - w))
  const y = Math.min(Math.max(0, cell.y), Math.max(0, rows - h))
  return { x, y, w, h }
}

export function cellsOverlap(a: PerformanceGridCell, b: PerformanceGridCell): boolean {
  return !(
    a.x + a.w <= b.x ||
    b.x + b.w <= a.x ||
    a.y + a.h <= b.y ||
    b.y + b.h <= a.y
  )
}

/** Find first free top-left for a control of the given kind. */
export function findFreeGridSlot(
  bank: PerformanceBank,
  kind: PerformanceControlKind,
  ignoreId?: string
): PerformanceGridCell | null {
  const size = kind === 'pad' ? PERFORMANCE_PAD_SIZE : PERFORMANCE_SLIDER_SIZE
  const occupied = Object.values(bank.controls).filter(
    (c) => c && c.id !== ignoreId
  )
  for (let y = 0; y <= bank.rows - size.h; y++) {
    for (let x = 0; x <= bank.cols - size.w; x++) {
      const candidate = { x, y, w: size.w, h: size.h }
      const hit = occupied.some((c) => cellsOverlap(candidate, c.grid))
      if (!hit) return candidate
    }
  }
  return null
}

export function normalizePerformanceBank(raw: unknown): PerformanceBank {
  const base = initPerformanceBank()
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Partial<PerformanceBank>
  let cols = Math.min(
    24,
    Math.max(2, Math.round(Number(r.cols) || PERFORMANCE_DEFAULT_COLS))
  )
  let rows = Math.min(
    24,
    Math.max(2, Math.round(Number(r.rows) || PERFORMANCE_DEFAULT_ROWS))
  )
  // Migrate the original 8×8 default up so cells are ~25% smaller when filling.
  if (cols === 8 && rows === 8) {
    cols = PERFORMANCE_DEFAULT_COLS
    rows = PERFORMANCE_DEFAULT_ROWS
  }
  const controls: { [id: string]: PerformanceControl } = {}
  const order: string[] = []
  const rawControls =
    r.controls && typeof r.controls === 'object' ? r.controls : {}
  const rawOrder = Array.isArray(r.order) ? r.order : Object.keys(rawControls)

  for (const id of rawOrder) {
    const c = (rawControls as { [k: string]: Partial<PerformanceControl> })[id]
    if (!c || typeof c !== 'object') continue
    const kind: PerformanceControlKind = c.kind === 'pad' ? 'pad' : 'slider'
    const controlId = typeof c.id === 'string' && c.id.length > 0 ? c.id : id
    const label =
      typeof c.label === 'string' && c.label.trim().length > 0
        ? c.label.trim()
        : defaultPerformanceLabel(kind)
    const size = kind === 'pad' ? PERFORMANCE_PAD_SIZE : PERFORMANCE_SLIDER_SIZE
    const rawGrid = normalizeGridCell(c.grid, kind)
    // Always pin to the canonical footprint (sliders used to be 2-wide).
    const migratedGrid = {
      x: rawGrid.x,
      y: rawGrid.y,
      w: size.w,
      h: size.h,
    }
    controls[controlId] = {
      id: controlId,
      kind,
      label,
      manuallyRenamed: c.manuallyRenamed === true,
      grid: clampGridToBank(migratedGrid, cols, rows),
      value:
        typeof c.value === 'number' && Number.isFinite(c.value)
          ? Math.min(1, Math.max(0, c.value))
          : 0,
      color: normalizePerformanceColor(c.color),
    }
    order.push(controlId)
  }

  // Include any controls missing from order
  for (const id of Object.keys(rawControls)) {
    if (!controls[id]) continue
    if (!order.includes(id)) order.push(id)
  }

  return {
    cols,
    rows,
    editUnlocked: r.editUnlocked === true,
    controls,
    order,
  }
}

/** Label suggestion from a destination action description. */
export function autoLabelFromDestinationHint(hint: string): string {
  const trimmed = hint.trim()
  return trimmed.length > 0 ? trimmed : 'Control'
}
