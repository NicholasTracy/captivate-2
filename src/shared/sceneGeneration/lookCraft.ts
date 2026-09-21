import type { Params } from '../params'
import type { SeededRng } from './rng'

/**
 * Professional look craft for scene generation.
 *
 * Console programmers build looks as intentional cues — one job per look,
 * a tight color family, and few competing drivers — not stacked randomness.
 */

export type LookFamily =
  | 'cool'
  | 'warm'
  | 'magenta'
  | 'amber'
  | 'cyan'
  | 'lime'
  | 'red'
  | 'violet'

/** Center hues for common stage palettes (0–1 wheel). */
export const LOOK_FAMILY_HUE: Record<LookFamily, number> = {
  cool: 0.58,
  warm: 0.07,
  magenta: 0.86,
  amber: 0.1,
  cyan: 0.48,
  lime: 0.3,
  red: 0.0,
  violet: 0.75,
}

/** Tiny variance so seeds differ without leaving the family. */
export function paletteHue(
  rng: SeededRng,
  family: LookFamily,
  spread = 0.03
): number {
  const base = LOOK_FAMILY_HUE[family]
  return wrapHue(base + rng.float(-spread, spread))
}

export function wrapHue(hue: number): number {
  return ((hue % 1) + 1) % 1
}

/** Analogous / complementary partner within a controlled offset. */
export function hueShift(hue: number, amount: number): number {
  return wrapHue(hue + amount)
}

export type WashIntent = 'dim' | 'wash' | 'groove' | 'accent' | 'peak'

/** Base levels by look intent — mimics how LDs set intensity architecture. */
export function washLevels(
  intent: WashIntent,
  epicness: number
): { brightness: number; saturation: number; width: number } {
  switch (intent) {
    case 'dim':
      return {
        brightness: 0.18 + epicness * 0.06,
        saturation: 0.42,
        width: 0.92,
      }
    case 'wash':
      return {
        brightness: 0.3 + epicness * 0.08,
        saturation: 0.58,
        width: 0.88,
      }
    case 'groove':
      return {
        brightness: 0.26 + epicness * 0.08,
        saturation: 0.72,
        width: 0.78,
      }
    case 'accent':
      return {
        brightness: 0.22 + epicness * 0.1,
        saturation: 0.85,
        width: 0.55,
      }
    case 'peak':
      return {
        brightness: 0.16 + epicness * 0.08,
        saturation: 0.95,
        width: 0.62,
      }
  }
}

export function washParams(
  hue: number,
  intent: WashIntent,
  epicness: number,
  patch: Params = {}
): Params {
  const levels = washLevels(intent, epicness)
  return {
    hue,
    saturation: levels.saturation,
    brightness: levels.brightness,
    x: 0.5,
    y: 0.5,
    width: levels.width,
    height: 1,
    positionFeather: 0.06,
    ...patch,
  }
}

/** Pick a family for a ladder rung so adjacent looks don't all share one hue. */
export function familyForLadderIndex(index: number): LookFamily {
  const cycle: LookFamily[] = [
    'cool',
    'warm',
    'amber',
    'cool',
    'cyan',
    'magenta',
    'lime',
    'red',
    'violet',
    'cool',
    'warm',
    'cyan',
    'magenta',
    'amber',
    'lime',
    'red',
    'cool',
    'cyan',
    'warm',
    'magenta',
    'violet',
    'lime',
    'red',
    'cool',
    'magenta',
    'warm',
    'cyan',
    'red',
    'violet',
    'magenta',
    'red',
  ]
  return cycle[Math.min(index, cycle.length - 1)] ?? 'cool'
}
