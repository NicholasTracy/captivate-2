export type DefaultParam =
  | 'hue'
  | 'saturation'
  | 'brightness'
  | 'white'
  | 'warmWhite'
  | 'amber'
  | 'uv'
  | 'x'
  | 'width'
  | 'y'
  | 'height'
  | 'positionFeather'
  | 'z'
  | 'depth'
  | 'intensity'
  | 'strobe'
  | 'strobeRgb'
  | 'strobeWhite'
  | 'strobeWarmWhite'
  | 'strobeAmber'
  | 'strobeUv'
  | 'randomize'
  | 'chase'
  | 'xAxis'
  | 'yAxis'
  | 'xMirror'
  | 'moverSpread'
  | 'moverPhase'
  | 'moverPhasePan'
  | 'moverPhaseTilt'
  | 'moverMirrorX'
  | 'moverMirrorY'
  | 'moverMode'
  | 'atmosFxtrOnOff'
  | 'atmosFxtrLevel'
  | 'visSlider1'
  | 'visSlider2'
  | 'visSlider3'
  | 'visSlider4'
  | 'visSlider5'
  | 'visSlider6'
  | 'visSlider7'
  | 'visSlider8'
  | 'visStageMapMix'

export type Params = { [key: string]: number | undefined }

export const visualSliderParams: readonly DefaultParam[] = [
  'visSlider1',
  'visSlider2',
  'visSlider3',
  'visSlider4',
  'visSlider5',
  'visSlider6',
  'visSlider7',
  'visSlider8',
]

export function initBaseParams(): Params {
  return {
    hue: 0.5,
    saturation: 0.5,
    brightness: 0.5,
    white: 0.0,
    warmWhite: 0.0,
    amber: 0.0,
    uv: 0.0,
    strobeRgb: 1.0,
    strobeWhite: 1.0,
    strobeWarmWhite: 1.0,
    strobeAmber: 1.0,
    strobeUv: 1.0,
  }
}

// Params as they
export function initParams(): { [key in DefaultParam]: number } {
  return {
    hue: 0.5,
    saturation: 0.5,
    brightness: 0.5,
    white: 0.0,
    warmWhite: 0.0,
    amber: 0.0,
    uv: 0.0,
    x: 0.5,
    width: 1.0,
    y: 0.5,
    height: 1.0,
    positionFeather: 0.0,
    z: 1.0,
    depth: 1.0,
    intensity: 1.0,
    strobe: 0.0,
    strobeRgb: 1.0,
    strobeWhite: 1.0,
    strobeWarmWhite: 1.0,
    strobeAmber: 1.0,
    strobeUv: 1.0,
    randomize: 1.0,
    chase: 1.0,
    xAxis: 0.5,
    yAxis: 0.5,
    xMirror: 0.0,
    moverSpread: 0.0,
    moverPhase: 0.0,
    moverPhasePan: 0.0,
    moverPhaseTilt: 0.0,
    moverMirrorX: 0.0,
    moverMirrorY: 0.0,
    moverMode: 0.0,
    atmosFxtrOnOff: 0.5,
    atmosFxtrLevel: 1.0,
    visSlider1: 0.5,
    visSlider2: 0.5,
    visSlider3: 0.5,
    visSlider4: 0.5,
    visSlider5: 0.5,
    visSlider6: 0.5,
    visSlider7: 0.5,
    visSlider8: 0.5,
    visStageMapMix: 0,
  }
}

const defaultParams: { [key in DefaultParam]: number } = {
  hue: 0.5,
  saturation: 0.5,
  brightness: 0.5,
  white: 0.0,
  warmWhite: 0.0,
  amber: 0.0,
  uv: 0.0,
  x: 0.5,
  width: 1.0,
  y: 0.5,
  height: 1.0,
  positionFeather: 0.0,
  z: 1.0,
  depth: 1.0,
  intensity: 1.0,
  strobe: 0.0,
  strobeRgb: 1.0,
  strobeWhite: 1.0,
  strobeWarmWhite: 1.0,
  strobeAmber: 1.0,
  strobeUv: 1.0,
  randomize: 0.0,
  chase: 0.0,
  xAxis: 0.5,
  yAxis: 0.5,
  xMirror: 0.0,
  moverSpread: 0.0,
  moverPhase: 0.0,
  moverPhasePan: 0.0,
  moverPhaseTilt: 0.0,
  moverMirrorX: 0.0,
  moverMirrorY: 0.0,
  moverMode: 0.0,
  atmosFxtrOnOff: 0.5,
  atmosFxtrLevel: 1.0,
  visSlider1: 0.5,
  visSlider2: 0.5,
  visSlider3: 0.5,
  visSlider4: 0.5,
  visSlider5: 0.5,
  visSlider6: 0.5,
  visSlider7: 0.5,
  visSlider8: 0.5,
  visStageMapMix: 0,
}

export function getParam(params: Params, param: DefaultParam): number {
  return params[param] ?? defaultParams[param]
}

/** Max sequential stagger in degrees for moverPhasePan / moverPhaseTilt (param 1.0 = this). */
export const MOVER_PHASE_MAX_DEG = 45

/**
 * Read pan/tilt phase amounts (0–1 → 0..MOVER_PHASE_MAX_DEG).
 * Prefer explicit moverPhasePan / moverPhaseTilt when present on the split;
 * else fall back to legacy combined moverPhase for both axes.
 */
export function getMoverPhaseParams(params: Params): {
  phasePan: number
  phaseTilt: number
} {
  const hasPan = params.moverPhasePan !== undefined
  const hasTilt = params.moverPhaseTilt !== undefined
  const hasLegacy = params.moverPhase !== undefined
  if (!hasPan && !hasTilt && !hasLegacy) {
    return { phasePan: 0, phaseTilt: 0 }
  }
  const legacy = hasLegacy ? clampPhase01(Number(params.moverPhase)) : 0
  return {
    phasePan: hasPan ? clampPhase01(Number(params.moverPhasePan)) : legacy,
    phaseTilt: hasTilt ? clampPhase01(Number(params.moverPhaseTilt)) : legacy,
  }
}

function clampPhase01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

/** Degrees for phase param 0–1 (display + engine). */
export function moverPhaseParamToDegrees(normalized: number): number {
  return clampPhase01(normalized) * MOVER_PHASE_MAX_DEG
}

export function defaultOutputParams(): Params {
  return {
    hue: 0.5,
    saturation: 0.5,
    brightness: 0.5,
    white: 0.0,
    warmWhite: 0.0,
    amber: 0.0,
    uv: 0.0,
    strobeRgb: 1.0,
    strobeWhite: 1.0,
    strobeWarmWhite: 1.0,
    strobeAmber: 1.0,
    strobeUv: 1.0,
    // x: 0.5,
    // width: 1.0,
    // y: 0.5,
    // height: 1.0,
    // intensity: 1.0,
    // strobe: 0.0,
    // randomize: 0.0,
    // xAxis: 0.5,
    // yAxis: 0.5,
    // xMirror: 0.0,
  }
}

export const defaultParamsList: DefaultParam[] = [
  'hue',
  'saturation',
  'brightness',
  'white',
  'warmWhite',
  'amber',
  'uv',
  'x',
  'width',
  'y',
  'height',
  'positionFeather',
  'z',
  'depth',
  'intensity',
  'strobe',
  'randomize',
  'chase',
  'xAxis',
  'yAxis',
  'moverSpread',
  'moverPhasePan',
  'moverPhaseTilt',
  'moverMirrorX',
  'moverMirrorY',
  'moverMode',
  'atmosFxtrOnOff',
  'atmosFxtrLevel',
  'visSlider1',
  'visSlider2',
  'visSlider3',
  'visSlider4',
  'visSlider5',
  'visSlider6',
  'visSlider7',
  'visSlider8',
  'visStageMapMix',
]

const paramDisplayNames: { [key: string]: string } = {
  gobo: 'Gobo',
  focus: 'Focus',
  prism: 'Prism',
  colorWheel: 'Color wheel',
  white: 'White',
  warmWhite: 'Warm White',
  amber: 'Amber',
  uv: 'UV',
  z: 'Z',
  depth: 'Depth',
  positionFeather: 'Feather',
  randomize: 'Randomize',
  chase: 'Chase',
  xAxis: 'Pan',
  yAxis: 'Tilt',
  xMirror: 'Pan Mirror',
  moverSpread: 'Tandem Spread',
  moverPhase: 'Mover Phase (legacy)',
  moverPhasePan: 'Pan Phase',
  moverPhaseTilt: 'Tilt Phase',
  moverMirrorX: 'Mirror Left/Right',
  moverMirrorY: 'Mirror Top/Bottom',
  moverMode: 'Mover Mode',
  atmosFxtrOnOff: 'Atmosphere on/off',
  atmosFxtrLevel: 'Atmosphere level',
  visSlider1: 'Visual Slider 1',
  visSlider2: 'Visual Slider 2',
  visSlider3: 'Visual Slider 3',
  visSlider4: 'Visual Slider 4',
  visSlider5: 'Visual Slider 5',
  visSlider6: 'Visual Slider 6',
  visSlider7: 'Visual Slider 7',
  visSlider8: 'Visual Slider 8',
  visStageMapMix: 'Stage light map',
  laserDotDensity: 'Dot density',
  laserScanPath: 'Scan path',
  laserPlaybackSpeed: 'Playback speed',
  laserAnimProgress: 'Animation progress',
  laserBeamHue: 'Beam color (solid)',
}

export function paramDisplayName(param: DefaultParam | string): string {
  return paramDisplayNames[param] ?? param
}
export type Modulation = Params

export function initModulation(): Modulation {
  return {}
}
