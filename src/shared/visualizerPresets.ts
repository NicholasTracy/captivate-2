import type { VisualScene_t, VisualSceneTransitionConfig } from './Scenes'
import { initLayerConfig } from '../visualizer/threejs/layers/LayerConfig'
import {
  createBuiltinCameraEffect,
  createBuiltinEffect,
  createBuiltinLayer,
  initBuiltinVisualizerConfig,
  type BuiltinBlendMode,
  type BuiltinCameraEffectType,
  type BuiltinEffectType,
  type BuiltinGeneratorType,
  type BuiltinLayerItem,
} from '../visualizer/threejs/layers/BuiltinVisualizer'

/**
 * Starter visual scenes, ordered from calm to peak so auto energy matching
 * has a ladder. Each one is a normal scene: layers, effects, and camera
 * moves can be edited, duplicated, or deleted.
 *
 * Slider links are left manual on purpose. The numbers below are the look.
 * Link Visual Slider 1–8 in the layer editor when a control should be ridden live.
 */

interface LookSpec {
  name: string
  epicness: number
  transition: VisualSceneTransitionConfig
  layers: BuiltinLayerItem[]
  effects: ReturnType<typeof createBuiltinEffect>[]
  camera?: ReturnType<typeof createBuiltinCameraEffect>[]
}

function fade(durationMs: number): VisualSceneTransitionConfig {
  return { type: 'fade', durationMs }
}

function dissolve(durationMs: number): VisualSceneTransitionConfig {
  return { type: 'dissolve', durationMs }
}

function flash(durationMs: number): VisualSceneTransitionConfig {
  return { type: 'flash', durationMs }
}

function cut(): VisualSceneTransitionConfig {
  return { type: 'cut', durationMs: 0 }
}

function layer(
  generator: BuiltinGeneratorType,
  index: number,
  patch: Partial<BuiltinLayerItem> = {}
): BuiltinLayerItem {
  const base = createBuiltinLayer(generator, index)
  return {
    ...base,
    blend: (index === 0 ? 'alpha' : 'add') as BuiltinBlendMode,
    ...patch,
    id: base.id,
    generator,
  }
}

function fx(type: BuiltinEffectType, amount: number) {
  const effect = createBuiltinEffect(type)
  effect.amount = amount
  return effect
}

function cam(type: BuiltinCameraEffectType, durationBeats: number) {
  const effect = createBuiltinCameraEffect(type)
  effect.durationBeats = durationBeats
  return effect
}

function look(spec: LookSpec): VisualScene_t {
  const config = initLayerConfig('builtin')
  config.builtin = {
    ...initBuiltinVisualizerConfig(),
    preset: spec.name,
    shuffleCameraEffects: false,
    layers: spec.layers,
    effects: spec.effects,
    cameraEffects: spec.camera ?? [],
  }
  return {
    name: spec.name,
    epicness: spec.epicness,
    autoEnabled: true,
    config,
    transition: spec.transition,
  }
}

/** About thirty starter looks. Names are stable so adding the bank twice does not duplicate them. */
export function createVjLookScenes(): VisualScene_t[] {
  const scenes = [
    look({
      name: 'Slow Sky',
      epicness: 0.06,
      transition: fade(1400),
      layers: [
        layer('clouds', 0, { density: 0.35, speed: 0.22, scale: 0.62, variety: 0.4, hueShift: 0.58, mix: 1 }),
      ],
      effects: [fx('bloom', 0.28), fx('filmGrain', 0.16), fx('vignette', 0.42)],
    }),
    look({
      name: 'Oil Slick',
      epicness: 0.1,
      transition: fade(1100),
      layers: [
        layer('oilWater', 0, { density: 0.45, speed: 0.28, scale: 0.5, variety: 0.55, hueShift: 0.72, mix: 1 }),
      ],
      effects: [fx('bloom', 0.34), fx('vignette', 0.3)],
    }),
    look({
      name: 'Still Water',
      epicness: 0.14,
      transition: fade(1200),
      layers: [
        layer('fluid', 0, { density: 0.25, speed: 0.32, scale: 0.45, variety: 0.7, hueShift: 0.55, mix: 1 }),
      ],
      effects: [fx('bloom', 0.22), fx('vignette', 0.36)],
    }),
    look({
      name: 'Deep Spiral',
      epicness: 0.18,
      transition: fade(1600),
      layers: [
        layer('fractal', 0, { density: 0.62, speed: 0.28, scale: 0.48, variety: 0.35, hueShift: 0.08, mix: 1 }),
      ],
      effects: [fx('bloom', 0.4), fx('vignette', 0.34)],
    }),
    look({
      name: 'Nebula Drift',
      epicness: 0.22,
      transition: fade(1000),
      layers: [
        layer('nebula', 0, { density: 0.5, speed: 0.24, scale: 0.7, variety: 0.45, hueShift: 0.62, mix: 1 }),
        layer('stars', 1, { density: 0.35, speed: 0.18, scale: 0.8, variety: 0.3, hueShift: 0.6, mix: 0.45, blend: 'screen' }),
      ],
      effects: [fx('bloom', 0.36), fx('filmGrain', 0.12), fx('vignette', 0.28)],
    }),
    look({
      name: 'Aurora',
      epicness: 0.26,
      transition: fade(900),
      layers: [
        layer('aurora', 0, { density: 0.48, speed: 0.3, scale: 0.55, variety: 0.6, hueShift: 0.38, mix: 1 }),
        layer('rays', 1, { density: 0.2, speed: 0.16, scale: 0.4, variety: 0.2, hueShift: 0.42, mix: 0.22, blend: 'screen' }),
      ],
      effects: [fx('bloom', 0.38), fx('vignette', 0.32)],
    }),
    look({
      name: 'Soft Body',
      epicness: 0.3,
      transition: fade(700),
      layers: [
        layer('oilWater', 0, { density: 0.4, speed: 0.26, scale: 0.5, variety: 0.4, hueShift: 0.78, mix: 0.85 }),
        layer('solid', 1, { density: 0.45, speed: 0.34, scale: 0.62, variety: 0.55, hueShift: 0.82, mix: 0.8 }),
      ],
      effects: [fx('bloom', 0.42), fx('vignette', 0.22)],
      camera: [cam('dolly', 8)],
    }),
    look({
      name: 'Honeycomb',
      epicness: 0.34,
      transition: dissolve(640),
      layers: [
        layer('hexGrid', 0, { density: 0.42, speed: 0.3, scale: 0.5, variety: 0.28, hueShift: 0.12, mix: 1 }),
      ],
      effects: [fx('bloom', 0.3), fx('beatFlash', 0.18), fx('vignette', 0.24)],
    }),
    look({
      name: 'Color Wash',
      epicness: 0.38,
      transition: dissolve(700),
      layers: [
        layer('plasma', 0, { density: 0.55, speed: 0.36, scale: 0.48, variety: 0.5, hueShift: 0.02, mix: 1 }),
      ],
      effects: [fx('bloom', 0.26), fx('chromaShift', 0.16), fx('vignette', 0.2)],
    }),
    look({
      name: 'Folded Room',
      epicness: 0.42,
      transition: fade(560),
      layers: [
        layer('kaleidoscope', 0, { density: 0.58, speed: 0.4, scale: 0.52, variety: 0.72, hueShift: 0.7, mix: 1 }),
      ],
      effects: [fx('bloom', 0.32), fx('mirror', 0.22)],
    }),
    look({
      name: 'Wave Field',
      epicness: 0.46,
      transition: dissolve(520),
      layers: [
        layer('waves', 0, { density: 0.5, speed: 0.42, scale: 0.58, variety: 0.35, hueShift: 0.52, mix: 1 }),
        layer('particles', 1, { density: 0.4, speed: 0.48, scale: 0.45, quantity: 0.35, variety: 0.4, hueShift: 0.56, mix: 0.4 }),
      ],
      effects: [fx('bloom', 0.34), fx('audioReact', 0.45)],
      camera: [cam('handheld', 8)],
    }),
    look({
      name: 'Title',
      epicness: 0.4,
      transition: fade(480),
      layers: [
        layer('rays', 0, { density: 0.22, speed: 0.2, scale: 0.35, variety: 0.15, hueShift: 0.08, mix: 0.55 }),
        layer('text', 1, { text: 'LIVE', scale: 0.72, hueShift: 0.1, mix: 0.95, blend: 'add', speed: 0.2 }),
      ],
      effects: [fx('bloom', 0.4), fx('vignette', 0.38)],
    }),
    look({
      name: 'Audio Halo',
      epicness: 0.5,
      transition: fade(420),
      layers: [
        layer('audioRing', 0, { density: 0.55, speed: 0.4, scale: 0.6, variety: 0.35, hueShift: 0.48, mix: 1 }),
        layer('spectrograph', 1, { density: 0.62, scale: 0.55, hueShift: 0.52, mix: 0.42, blend: 'screen' }),
        layer('audioTunnel', 2, { density: 0.4, speed: 0.36, scale: 0.5, hueShift: 0.5, mix: 0.28 }),
      ],
      effects: [fx('bloom', 0.36), fx('audioReact', 0.7), fx('vignette', 0.18)],
      camera: [cam('dolly', 8)],
    }),
    look({
      name: 'Scope',
      epicness: 0.54,
      transition: fade(360),
      layers: [
        layer('oscilloscope3D', 0, { density: 0.6, speed: 0.45, scale: 0.58, variety: 0.3, hueShift: 0.33, mix: 1 }),
      ],
      effects: [fx('bloom', 0.3), fx('scanlines', 0.28), fx('vignette', 0.22)],
    }),
    look({
      name: 'Ribbon',
      epicness: 0.58,
      transition: dissolve(400),
      layers: [
        layer('fftRibbon', 0, { density: 0.58, speed: 0.46, scale: 0.62, variety: 0.4, hueShift: 0.15, mix: 1 }),
      ],
      effects: [fx('bloom', 0.4), fx('chromaShift', 0.2)],
      camera: [cam('orbit', 8)],
    }),
    look({
      name: 'Knot',
      epicness: 0.62,
      transition: dissolve(380),
      layers: [
        layer('torusKnot', 0, { density: 0.5, speed: 0.48, scale: 0.66, variety: 0.35, hueShift: 0.88, mix: 1 }),
      ],
      effects: [fx('bloom', 0.45), fx('rimLight', 0.55), fx('chromaShift', 0.18)],
      camera: [cam('orbit', 16)],
    }),
    look({
      name: 'Cube Field',
      epicness: 0.66,
      transition: dissolve(320),
      layers: [
        layer('cubes', 0, { density: 0.55, speed: 0.52, scale: 0.5, quantity: 0.45, variety: 0.4, hueShift: 0.58, mix: 1 }),
        layer('spheres', 1, { density: 0.35, speed: 0.4, scale: 0.42, quantity: 0.22, variety: 0.3, hueShift: 0.62, mix: 0.35, blend: 'screen' }),
      ],
      effects: [fx('bloom', 0.38), fx('beatFlash', 0.28)],
      camera: [cam('beatPunch', 4)],
    }),
    look({
      name: 'Triangle Swarm',
      epicness: 0.68,
      transition: dissolve(300),
      layers: [
        layer('triangles', 0, { density: 0.6, speed: 0.55, scale: 0.48, quantity: 0.5, variety: 0.45, hueShift: 0.05, mix: 1 }),
      ],
      effects: [fx('bloom', 0.32), fx('hueShift', 0.2)],
      camera: [cam('handheld', 4)],
    }),
    look({
      name: 'Ray Cathedral',
      epicness: 0.7,
      transition: dissolve(280),
      layers: [
        layer('rays', 0, { density: 0.62, speed: 0.4, scale: 0.55, variety: 0.35, hueShift: 0.1, mix: 1 }),
        layer('beatGrid', 1, { density: 0.48, speed: 0.5, scale: 0.6, hueShift: 0.12, mix: 0.38, blend: 'add' }),
      ],
      effects: [fx('bloom', 0.42), fx('beatFlash', 0.36), fx('colorSync', 0.8)],
    }),
    look({
      name: 'Vortex',
      epicness: 0.74,
      transition: dissolve(260),
      layers: [
        layer('vortex', 0, { density: 0.55, speed: 0.58, scale: 0.5, variety: 0.65, hueShift: 0.74, mix: 1 }),
        layer('particles', 1, { density: 0.5, speed: 0.62, scale: 0.4, quantity: 0.4, variety: 0.5, hueShift: 0.78, mix: 0.45 }),
      ],
      effects: [fx('bloom', 0.36), fx('radialBlur', 0.22)],
      camera: [cam('spiral', 8)],
    }),
    look({
      name: 'Tunnel Rush',
      epicness: 0.76,
      transition: dissolve(240),
      layers: [
        layer('lightTunnel', 0, { density: 0.58, speed: 0.66, scale: 0.52, variety: 0.45, hueShift: 0.55, mix: 1 }),
        layer('legacySpaceTunnel', 1, { density: 0.4, speed: 0.7, scale: 0.55, hueShift: 0.58, mix: 0.32 }),
        layer('stars', 2, { density: 0.45, speed: 0.72, scale: 0.7, hueShift: 0.56, mix: 0.28, blend: 'screen' }),
      ],
      effects: [fx('bloom', 0.34), fx('beatFlash', 0.32)],
      camera: [cam('beatPunch', 2)],
    }),
    look({
      name: 'Milkdrop',
      epicness: 0.6,
      transition: fade(360),
      layers: [
        layer('plasma', 0, {
          sourceType: 'projectM',
          source: '',
          mediaFit: 'fill',
          mix: 1,
          blend: 'alpha',
          hueShift: 0.5,
        }),
      ],
      effects: [fx('bloom', 0.3), fx('audioReact', 0.55), fx('vignette', 0.16)],
    }),
    look({
      name: 'Voxel',
      epicness: 0.8,
      transition: dissolve(220),
      layers: [
        layer('voxelPulse', 0, { density: 0.62, speed: 0.58, scale: 0.55, variety: 0.4, hueShift: 0.48, mix: 1 }),
      ],
      effects: [fx('bloom', 0.4), fx('beatFlash', 0.34)],
      camera: [cam('beatPunch', 4)],
    }),
    look({
      name: 'Spike',
      epicness: 0.84,
      transition: flash(200),
      layers: [
        layer('spikeBall', 0, { density: 0.55, speed: 0.6, scale: 0.7, variety: 0.45, hueShift: 0, mix: 1 }),
        layer('geodesic', 1, { speed: 0.42, scale: 0.85, hueShift: 0.04, mix: 0.4, blend: 'screen' }),
      ],
      effects: [fx('bloom', 0.48), fx('rimLight', 0.7), fx('beatFlash', 0.3)],
      camera: [cam('orbit', 8)],
    }),
    look({
      name: 'Warp Stars',
      epicness: 0.86,
      transition: dissolve(180),
      layers: [
        layer('stars', 0, { density: 0.7, speed: 0.82, scale: 0.75, variety: 0.4, hueShift: 0.58, mix: 1 }),
      ],
      effects: [fx('radialBlur', 0.4), fx('bloom', 0.28)],
      camera: [cam('shake', 2)],
    }),
    look({
      name: 'Glitch Grid',
      epicness: 0.9,
      transition: cut(),
      layers: [
        layer('beatGrid', 0, { density: 0.65, speed: 0.7, scale: 0.55, variety: 0.5, hueShift: 0.85, mix: 1 }),
      ],
      effects: [fx('glitch', 0.55), fx('pixelate', 0.28), fx('chromaShift', 0.34)],
      camera: [cam('whip', 2)],
    }),
    look({
      name: 'Afterimage',
      epicness: 0.88,
      transition: dissolve(200),
      layers: [
        layer('vortex', 0, { density: 0.5, speed: 0.64, scale: 0.48, variety: 0.7, hueShift: 0.92, mix: 1 }),
      ],
      effects: [fx('afterImage', 0.62), fx('bloom', 0.3), fx('radialBlur', 0.18)],
    }),
    look({
      name: 'Edge Cut',
      epicness: 0.92,
      transition: cut(),
      layers: [
        layer('particles', 0, { density: 0.7, speed: 0.75, scale: 0.5, quantity: 0.6, variety: 0.55, hueShift: 0.15, mix: 1 }),
      ],
      effects: [fx('edge', 0.7), fx('invert', 0.22), fx('bloom', 0.2)],
      camera: [cam('shake', 2)],
    }),
    look({
      name: 'Strobe Tunnel',
      epicness: 0.95,
      transition: flash(140),
      layers: [
        layer('lightTunnel', 0, { density: 0.7, speed: 0.85, scale: 0.48, variety: 0.6, hueShift: 0, mix: 1 }),
      ],
      effects: [fx('strobe', 0.48), fx('beatFlash', 0.55), fx('bloom', 0.25)],
      camera: [cam('beatPunch', 1)],
    }),
    look({
      name: 'Drop',
      epicness: 1,
      transition: flash(120),
      layers: [
        layer('rays', 0, { density: 0.8, speed: 0.78, scale: 0.42, variety: 0.5, hueShift: 0.08, mix: 1 }),
        layer('text', 1, { text: 'DROP', scale: 0.8, hueShift: 0.1, mix: 0.9, blend: 'add' }),
      ],
      effects: [fx('strobe', 0.4), fx('beatFlash', 0.7), fx('bloom', 0.45)],
      camera: [cam('beatPunch', 1)],
    }),
  ]
  scenes.sort((a, b) => a.epicness - b.epicness || a.name.localeCompare(b.name))
  return scenes
}
