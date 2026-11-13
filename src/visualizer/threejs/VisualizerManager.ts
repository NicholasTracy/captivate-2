import * as THREE from 'three'
import { RealtimeState } from '../../renderer/redux/realtimeStore'
import { CleanReduxState } from '../../renderer/redux/store'
import equal from 'deep-equal'
import UpdateResource from './UpdateResource'
import { LayerConfig, initLayerConfig } from './layers/LayerConfig'
import constructLayer from './layers/constructLayer'
import LayerBase from './layers/LayerBase'
import { setRandomSource, resetRandomSource } from '../../math/util'
import { TimeState } from '../../shared/TimeState'
import { defaultOutputParams } from '../../shared/params'
import { initLightScene, LightScene_t, SplitScene_t } from '../../shared/Scenes'
import {
  initVisualSceneTransitionConfig,
  VisualSceneTransitionConfig,
} from '../../shared/Scenes'
import { Params } from '../../shared/params'
import { nextBeatBoundaryStrict } from '../../shared/sceneBeatQuantize'
import { stageLightMapGridDimensions, stageLightMapMasterFromEffects } from '../../shared/stageLightMap'
import { sendStageLightMapFrame } from '../ipcHandler'

const MAX_DT = 100 // ms
/**
 * After this, allow the transition timer to run even if async media (e.g. video) is still loading.
 * Does not apply when `activeLayer.blocksTransitionReadinessTimeout()` (ProjectM) is true.
 */
const VISUAL_SCENE_TRANSITION_READY_TIMEOUT_MS = 15000
const BEAT_START_EPS = 1e-4

export interface VisualizerResource {
  rt: RealtimeState
  state: CleanReduxState
}

export interface VisualizerRuntimeStats {
  memoryGeometries: number
  memoryTextures: number
  renderCalls: number
  renderTriangles: number
  renderPoints: number
  renderLines: number
  shaderPrograms: number | null
  transitionActive: boolean
}

const compositeVertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const compositeFragmentShader = `
uniform sampler2D fromTex;
uniform sampler2D toTex;
uniform float mixAmount;
uniform float mode;
uniform float seed;
uniform float negativeAmount;
uniform float timeSec;
uniform float blurAmount;
uniform float glitchAmount;
uniform float vignetteAmount;
uniform float anaglyphAmount;
uniform float parallaxAmount;
uniform float asciiAmount;
uniform sampler2D feedbackTex;
uniform float feedbackAmount;
uniform float posterizeAmount;
uniform float pixelateAmount;
uniform float radialBlurAmount;
uniform float edgeAmount;
uniform float beatFlashAmount;
uniform float beatPulse;
uniform float bloomAmount;
uniform float filmGrainAmount;
uniform float scanlineAmount;
uniform float chromaAmount;
uniform float mirrorAmount;
uniform float hueAmount;
uniform float strobeAmount;
uniform float rimAmount;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

vec4 blendAt(vec2 uv) {
  vec4 fromColor = texture2D(fromTex, uv);
  vec4 toColor = texture2D(toTex, uv);

  if (mode < 0.5) {
    return mix(fromColor, toColor, mixAmount);
  }

  if (mode < 1.5) {
    float n = hash(uv * vec2(230.3, 91.7) + seed);
    float threshold = step(n, clamp(mixAmount, 0.0, 1.0));
    return mix(fromColor, toColor, threshold);
  }

  float flash = sin(clamp(mixAmount, 0.0, 1.0) * 3.14159265);
  vec3 c = mix(fromColor.rgb, toColor.rgb, mixAmount);
  c += vec3(flash * 0.22);
  return vec4(c, 1.0);
}

float segmentMask(vec2 p, vec2 a, vec2 b, float width) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float denom = max(dot(ba, ba), 0.00001);
  float h = clamp(dot(pa, ba) / denom, 0.0, 1.0);
  float d = length(pa - ba * h);
  return 1.0 - smoothstep(width, width + 0.015, d);
}

float dotMask(vec2 p, vec2 c, float radius) {
  float d = length(p - c);
  return 1.0 - smoothstep(radius, radius + 0.08, d);
}

float asciiGlyph(vec2 cellUv, float glyphIndex) {
  float m = 0.0;
  if (glyphIndex < 0.5) {
    m = max(m, dotMask(cellUv, vec2(0.5, 0.5), 0.09));
  } else if (glyphIndex < 1.5) {
    m = max(m, dotMask(cellUv, vec2(0.5, 0.3), 0.09));
    m = max(m, dotMask(cellUv, vec2(0.5, 0.7), 0.09));
  } else if (glyphIndex < 2.5) {
    m = max(m, segmentMask(cellUv, vec2(0.2, 0.5), vec2(0.8, 0.5), 0.045));
    m = max(m, segmentMask(cellUv, vec2(0.5, 0.2), vec2(0.5, 0.8), 0.045));
  } else if (glyphIndex < 3.5) {
    m = max(m, segmentMask(cellUv, vec2(0.2, 0.5), vec2(0.8, 0.5), 0.04));
    m = max(m, segmentMask(cellUv, vec2(0.5, 0.2), vec2(0.5, 0.8), 0.04));
    m = max(m, segmentMask(cellUv, vec2(0.24, 0.24), vec2(0.76, 0.76), 0.034));
    m = max(m, segmentMask(cellUv, vec2(0.24, 0.76), vec2(0.76, 0.24), 0.034));
  } else if (glyphIndex < 4.5) {
    m = max(m, segmentMask(cellUv, vec2(0.26, 0.2), vec2(0.26, 0.8), 0.034));
    m = max(m, segmentMask(cellUv, vec2(0.74, 0.2), vec2(0.74, 0.8), 0.034));
    m = max(m, segmentMask(cellUv, vec2(0.15, 0.34), vec2(0.85, 0.34), 0.034));
    m = max(m, segmentMask(cellUv, vec2(0.15, 0.66), vec2(0.85, 0.66), 0.034));
  } else {
    m = max(m, segmentMask(cellUv, vec2(0.2, 0.5), vec2(0.8, 0.5), 0.03));
    m = max(m, segmentMask(cellUv, vec2(0.5, 0.2), vec2(0.5, 0.8), 0.03));
    m = max(m, segmentMask(cellUv, vec2(0.24, 0.24), vec2(0.76, 0.76), 0.026));
    m = max(m, segmentMask(cellUv, vec2(0.24, 0.76), vec2(0.76, 0.24), 0.026));
    m = max(m, segmentMask(cellUv, vec2(0.12, 0.12), vec2(0.88, 0.88), 0.024));
    m = max(m, segmentMask(cellUv, vec2(0.12, 0.88), vec2(0.88, 0.12), 0.024));
  }
  return clamp(m, 0.0, 1.0);
}

vec3 hueRotate(vec3 color, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  vec3 yiq = mat3(
    0.299, 0.596, 0.211,
    0.587, -0.274, -0.523,
    0.114, -0.322, 0.312
  ) * color;
  yiq.yz = mat2(c, s, -s, c) * yiq.yz;
  return mat3(
    1.0, 1.0, 1.0,
    0.956, -0.272, -1.107,
    0.621, -0.647, 1.705
  ) * yiq;
}

void main() {
  vec2 uv = vUv;
  float mirror = clamp(mirrorAmount, 0.0, 1.0);
  if (mirror > 0.001) {
    float xFolds = mix(1.0, 2.0, mirror);
    vec2 folded = vec2(
      abs(fract(uv.x * xFolds) - 0.5) * 2.0,
      mix(uv.y, abs(fract(uv.y * 2.0) - 0.5) * 2.0, smoothstep(0.45, 1.0, mirror))
    );
    uv = mix(uv, folded, mirror);
  }
  vec4 result = blendAt(uv);
  if (blurAmount > 0.001) {
    vec3 acc = result.rgb;
    float weight = 1.0;
    float radius = blurAmount * 0.05;
    for (int i = 1; i <= 8; i++) {
      float t = float(i) / 8.0;
      float ang = t * 6.2831853;
      vec2 offset = vec2(cos(ang), sin(ang)) * radius * t;
      float w = 1.0 - t * 0.55;
      acc += blendAt(clamp(uv + offset, 0.0, 1.0)).rgb * w;
      weight += w;
    }
    result.rgb = acc / weight;
  }

  if (pixelateAmount > 0.001) {
    float cells = mix(80.0, 5.0, clamp(pixelateAmount, 0.0, 1.0));
    vec2 grid = vec2(cells, cells * 0.5625);
    vec2 cell = (floor(uv * grid) + 0.5) / grid;
    result.rgb = mix(result.rgb, blendAt(clamp(cell, 0.0, 1.0)).rgb, clamp(pixelateAmount * 1.25, 0.0, 1.0));
  }

  if (radialBlurAmount > 0.001) {
    vec3 acc = result.rgb;
    float weight = 1.0;
    for (int i = 1; i <= 8; i++) {
      float t = float(i) / 8.0;
      float zoom = 1.0 - t * radialBlurAmount * 0.7;
      vec2 sampleUv = clamp((uv - 0.5) * zoom + 0.5, 0.0, 1.0);
      float w = 1.0 - t * 0.35;
      acc += blendAt(sampleUv).rgb * w;
      weight += w;
    }
    result.rgb = mix(result.rgb, acc / weight, clamp(radialBlurAmount, 0.0, 1.0));
  }

  if (bloomAmount > 0.001) {
    vec3 glow = vec3(0.0);
    float rad = mix(0.008, 0.045, clamp(bloomAmount, 0.0, 1.0));
    for (int i = 0; i < 8; i++) {
      float ang = float(i) * 0.785398;
      vec3 sampleColor = blendAt(clamp(uv + vec2(cos(ang), sin(ang)) * rad, 0.0, 1.0)).rgb;
      float luma = dot(sampleColor, vec3(0.299, 0.587, 0.114));
      glow += sampleColor * smoothstep(0.22, 0.78, luma);
    }
    result.rgb += (glow / 8.0) * bloomAmount * 1.7;
  }

  if (feedbackAmount > 0.001) {
    vec2 zoomUv = (uv - 0.5) * (1.0 - feedbackAmount * 0.045) + 0.5;
    vec3 prev = texture2D(feedbackTex, clamp(zoomUv, 0.0, 1.0)).rgb;
    prev *= mix(0.88, 0.5, clamp(feedbackAmount, 0.0, 1.0));
    result.rgb = mix(result.rgb, prev, clamp(feedbackAmount * 0.84, 0.0, 0.9));
  }

  float glitch = clamp(glitchAmount, 0.0, 1.0);
  if (glitch > 0.001) {
    float rate = 5.0 + glitch * 22.0;
    float tick = floor(timeSec * rate);
    float burst = step(mix(0.72, 0.18, glitch), hash(vec2(tick, 3.7 + seed)));
    float rows = mix(10.0, 42.0, glitch);
    float row = floor(uv.y * rows);
    float rowRoll = hash(vec2(row, tick + 1.3));
    float rowHit = step(mix(0.7, 0.28, glitch), rowRoll) * burst;
    float slide = (hash(vec2(row * 2.17, tick + 8.2)) - 0.5) * mix(0.12, 0.85, glitch);
    vec2 torn = vec2(fract(uv.x + slide * rowHit), uv.y);
    float split = slide * rowHit * (0.35 + glitch * 0.8);
    vec3 sliced = vec3(
      blendAt(vec2(fract(torn.x + split), torn.y)).r,
      blendAt(torn).g,
      blendAt(vec2(fract(torn.x - split * 1.25), torn.y)).b
    );
    float swapped = step(0.78, hash(vec2(row, tick + 19.0))) * rowHit;
    sliced = mix(sliced, sliced.gbr, swapped);
    float cols = mix(6.0, 22.0, glitch);
    float blockX = floor(uv.x * cols);
    float blockY = floor(uv.y * mix(5.0, 16.0, glitch));
    float blockRoll = hash(vec2(blockX + blockY * 13.0, tick + 27.0));
    float blockHit = step(mix(0.9, 0.62, glitch), blockRoll) * burst;
    vec2 jumped = vec2(
      fract(uv.x + (hash(vec2(blockY, tick + 4.0)) - 0.5) * 0.7),
      fract(uv.y + (hash(vec2(blockX, tick + 6.0)) - 0.5) * 0.22)
    );
    vec3 block = blendAt(jumped).rgb;
    float solid = step(0.55, hash(vec2(blockX, tick + blockY)));
    vec3 chip = vec3(
      hash(vec2(blockY, tick)),
      hash(vec2(blockX, tick + 2.0)) * 0.25,
      hash(vec2(blockX + blockY, tick + 5.0))
    );
    block = mix(block, chip, solid);
    vec3 digital = mix(sliced, block, blockHit);
    float hit = max(rowHit, blockHit);
    result.rgb = mix(result.rgb, digital, hit);
    float snow = hash(vec2(floor(uv.x * 180.0) + floor(uv.y * 90.0), tick));
    result.rgb = mix(result.rgb, vec3(snow), hit * step(0.93, snow) * glitch);
  }

  float vignette = pow(smoothstep(0.2, 1.0, distance(vUv, vec2(0.5)) * 1.414), 1.7);
  result.rgb *= 1.0 - clamp(vignetteAmount, 0.0, 1.0) * vignette * 0.92;

  if (chromaAmount > 0.001) {
    float shift = chromaAmount * 0.042;
    result.r = blendAt(clamp(uv + vec2(shift, 0.0), 0.0, 1.0)).r;
    result.b = blendAt(clamp(uv - vec2(shift, shift * 0.28), 0.0, 1.0)).b;
  }

  if (anaglyphAmount > 0.001) {
    float shift = 0.008 + anaglyphAmount * 0.042;
    vec3 left = blendAt(clamp(uv + vec2(-shift, 0.0), 0.0, 1.0)).rgb;
    vec3 right = blendAt(clamp(uv + vec2(shift, 0.0), 0.0, 1.0)).rgb;
    vec3 ana = vec3(left.r, right.g, right.b);
    result.rgb = mix(result.rgb, ana, clamp(anaglyphAmount, 0.0, 1.0));
  }

  if (parallaxAmount > 0.001) {
    float shift = 0.012 + parallaxAmount * 0.07;
    vec3 left = blendAt(clamp(uv + vec2(-shift, 0.0), 0.0, 1.0)).rgb;
    vec3 right = blendAt(clamp(uv + vec2(shift, 0.0), 0.0, 1.0)).rgb;
    float stripe = step(0.5, fract(gl_FragCoord.x * 0.5));
    vec3 parallax = mix(left, right, stripe);
    result.rgb = mix(result.rgb, parallax, clamp(parallaxAmount, 0.0, 1.0));
  }

  if (asciiAmount > 0.001) {
    float density = mix(72.0, 14.0, clamp(asciiAmount, 0.0, 1.0));
    vec2 grid = vec2(density, density * 0.58);
    vec2 cell = floor(vUv * grid);
    vec2 cellUv = fract(vUv * grid);
    vec2 sampleUv = (cell + 0.5) / grid;
    vec3 cellColor = blendAt(sampleUv).rgb;
    float lum = dot(cellColor, vec3(0.299, 0.587, 0.114));
    float glyphIndex = floor(clamp(lum, 0.0, 0.999) * 6.0);
    float glyph = asciiGlyph(cellUv, glyphIndex);
    vec3 ink = mix(vec3(0.03), cellColor, 0.8);
    vec3 ascii = mix(vec3(0.01), ink, glyph);
    result.rgb = mix(result.rgb, ascii, clamp(asciiAmount * 1.2, 0.0, 1.0));
  }

  if (scanlineAmount > 0.001) {
    float line = step(0.5, fract(gl_FragCoord.y * 0.5));
    float roll = smoothstep(0.12, 0.0, abs(fract(uv.y + timeSec * 0.15) - 0.5));
    result.rgb *= 1.0 - clamp(scanlineAmount, 0.0, 1.0) * (line * 0.72 + roll * 0.4);
  }

  if (filmGrainAmount > 0.001) {
    float grain = hash(gl_FragCoord.xy + vec2(floor(timeSec * 24.0) * 17.0, seed * 30.0));
    result.rgb += (grain - 0.5) * filmGrainAmount * 0.62;
  }

  if (posterizeAmount > 0.001) {
    float levels = mix(8.0, 2.0, clamp(posterizeAmount, 0.0, 1.0));
    result.rgb = floor(result.rgb * levels) / levels;
  }

  if (edgeAmount > 0.001) {
    vec3 luma = vec3(0.299, 0.587, 0.114);
    float px = 0.003 + edgeAmount * 0.014;
    float center = dot(blendAt(uv).rgb, luma);
    float dx = dot(blendAt(clamp(uv + vec2(px, 0.0), 0.0, 1.0)).rgb, luma) - center;
    float dy = dot(blendAt(clamp(uv + vec2(0.0, px), 0.0, 1.0)).rgb, luma) - center;
    float edge = clamp((abs(dx) + abs(dy)) * (8.0 + edgeAmount * 14.0), 0.0, 1.0);
    vec3 ink = mix(result.rgb * 0.06, result.rgb + vec3(edge), edge);
    result.rgb = mix(result.rgb, ink, clamp(edgeAmount, 0.0, 1.0));
  }

  if (hueAmount > 0.001) {
    result.rgb = hueRotate(result.rgb, hueAmount * 6.2831853);
  }

  if (beatFlashAmount > 0.001) {
    float flash = clamp(beatPulse, 0.0, 1.0) * beatFlashAmount;
    result.rgb += vec3(flash * 1.15);
  }

  if (strobeAmount > 0.001) {
    float rate = mix(3.0, 14.0, clamp(strobeAmount, 0.0, 1.0));
    float gate = step(0.5, fract(timeSec * rate));
    gate = max(gate, step(0.42, beatPulse));
    result.rgb *= mix(1.0, gate, clamp(strobeAmount, 0.0, 1.0));
  }

  if (rimAmount > 0.001) {
    float rim = smoothstep(0.18, 1.05, distance(uv, vec2(0.5)) * 1.4);
    result.rgb += rim * rimAmount * vec3(0.72, 0.86, 1.0);
  }

  result.rgb = clamp(result.rgb, 0.0, 1.0);
  result.rgb = mix(result.rgb, vec3(1.0) - result.rgb, clamp(negativeAmount, 0.0, 1.0));
  gl_FragColor = result;
}
`

export default class VisualizerManager {
  private renderer: THREE.WebGLRenderer
  private width = 0
  private height = 0
  private layerConfig: LayerConfig
  private activeLayer: LayerBase
  private activeSceneId: string | null = null
  private updateResource: UpdateResource | null = null
  private lastSharedBeat: number | null = null
  private lastIncomingBeat: number | null = null
  private fallbackBeatAnchor: number | null = null
  private fallbackBeatAnchorMs: number | null = null
  private fallbackBpm: number = 120

  /** When non-null, elapsed crossfade time is measured from this instant. */
  private transitionFadeStartMs: number | null = null
  /** Once the destination is ready, crossfade starts on this beat (strict boundary). */
  private transitionBeatTarget: number | null = null
  private transitionConfig: VisualSceneTransitionConfig =
    initVisualSceneTransitionConfig()
  private transitionFromLayer: LayerBase | null = null
  private transitionFromLayerConfig: LayerConfig | null = null
  private activeRandomSeed = 0
  private transitionRandomSeed: number | null = null
  private fromTarget: THREE.WebGLRenderTarget | null = null
  private toTarget: THREE.WebGLRenderTarget | null = null
  private compositeScene: THREE.Scene
  private compositeCamera: THREE.OrthographicCamera
  private compositeMaterial: THREE.ShaderMaterial
  private transitionSeed = Math.random()
  private transitionDestinationReadyDeadlineMs: number | null = null
  private lightMapReadTarget: THREE.WebGLRenderTarget | null = null
  private lightMapReadBuffer: Uint8Array | null = null
  private lightMapFrameTick = 0
  private feedbackRead: THREE.WebGLRenderTarget | null = null
  private feedbackWrite: THREE.WebGLRenderTarget | null = null
  private blankFeedback: THREE.DataTexture
  private presentScene: THREE.Scene
  private presentMaterial: THREE.ShaderMaterial

  constructor() {
    this.renderer = new THREE.WebGLRenderer()
    this.layerConfig = initLayerConfig('builtin')
    this.activeRandomSeed = this.computeRandomSeed(this.layerConfig)
    this.activeLayer = constructLayer(this.layerConfig)

    this.compositeScene = new THREE.Scene()
    this.compositeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.compositeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        fromTex: { value: null },
        toTex: { value: null },
        mixAmount: { value: 1 },
        mode: { value: 0 },
        seed: { value: 0 },
        negativeAmount: { value: 0 },
        timeSec: { value: 0 },
        blurAmount: { value: 0 },
        glitchAmount: { value: 0 },
        vignetteAmount: { value: 0 },
        anaglyphAmount: { value: 0 },
        parallaxAmount: { value: 0 },
        asciiAmount: { value: 0 },
        feedbackTex: { value: null },
        feedbackAmount: { value: 0 },
        posterizeAmount: { value: 0 },
        pixelateAmount: { value: 0 },
        radialBlurAmount: { value: 0 },
        edgeAmount: { value: 0 },
        beatFlashAmount: { value: 0 },
        beatPulse: { value: 0 },
        bloomAmount: { value: 0 },
        filmGrainAmount: { value: 0 },
        scanlineAmount: { value: 0 },
        chromaAmount: { value: 0 },
        mirrorAmount: { value: 0 },
        hueAmount: { value: 0 },
        strobeAmount: { value: 0 },
        rimAmount: { value: 0 },
      },
      vertexShader: compositeVertexShader,
      fragmentShader: compositeFragmentShader,
      depthWrite: false,
      depthTest: false,
    })
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this.compositeMaterial
    )
    this.compositeScene.add(quad)
    this.blankFeedback = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
    this.blankFeedback.needsUpdate = true
    this.presentMaterial = new THREE.ShaderMaterial({
      uniforms: { tex: { value: null } },
      vertexShader: compositeVertexShader,
      fragmentShader: `
        uniform sampler2D tex;
        varying vec2 vUv;
        void main() {
          gl_FragColor = texture2D(tex, vUv);
        }
      `,
      depthWrite: false,
      depthTest: false,
    })
    this.presentScene = new THREE.Scene()
    this.presentScene.add(
      new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.presentMaterial)
    )
  }

  getElement() {
    return this.renderer.domElement
  }

  getRuntimeStats(): VisualizerRuntimeStats {
    const info = this.renderer.info
    const programs = (this.renderer as unknown as { info?: { programs?: unknown[] } }).info?.programs
    return {
      memoryGeometries: Number(info.memory?.geometries ?? 0),
      memoryTextures: Number(info.memory?.textures ?? 0),
      renderCalls: Number(info.render?.calls ?? 0),
      renderTriangles: Number(info.render?.triangles ?? 0),
      renderPoints: Number(info.render?.points ?? 0),
      renderLines: Number(info.render?.lines ?? 0),
      shaderPrograms: Array.isArray(programs) ? programs.length : null,
      transitionActive: this.isTransitionActive(),
    }
  }

  update(dt: number, res: VisualizerResource) {
    const control = res.state.control
    const visualSceneId = control.visual.active
    const visualScene = control.visual.byId[visualSceneId]
    const layerConfig = visualScene?.config ?? initLayerConfig('builtin')
    const transition = visualScene?.transition ?? initVisualSceneTransitionConfig()
    const renderTime = this.getRenderTime(res.rt.time)
    const activeLightScene =
      control.light.byId[control.light.active] ?? initLightScene()
    const visualizerSplitIndex = this.findVisualizerSplitIndex(activeLightScene)

    const sharedDt = this.getSharedDtMs(renderTime.beats, renderTime.bpm, dt)
    const stuff = {
      dt: Math.min(sharedDt, MAX_DT),
      params:
        res.rt.splitStates[visualizerSplitIndex]?.outputParams ??
        res.rt.splitStates[0]?.outputParams ??
        defaultOutputParams(),
      time: renderTime,
      scene: activeLightScene,
      master: control.master,
      size: {
        width: this.width,
        height: this.height,
      },
      audio: res.rt.audio,
    }
    if (this.updateResource === null) {
      this.updateResource = new UpdateResource(stuff)
    } else {
      this.updateResource.update(stuff)
    }

    if (this.updateResource === null) {
      return
    }

    const sceneChanged =
      this.activeSceneId !== null && visualSceneId !== this.activeSceneId
    const configChanged =
      layerConfig !== this.layerConfig && !equal(layerConfig, this.layerConfig)

    if (sceneChanged || configChanged) {
      if (sceneChanged) {
        const transitioning = this.beginSceneTransition(transition)
        const previousLayer = this.activeLayer
        const previousLayerConfig = this.layerConfig
        const previousLayerSeed = this.activeRandomSeed
        this.rebuildActiveLayer(layerConfig, false)
        if (transitioning) {
          this.transitionFromLayer?.dispose()
          this.transitionFromLayer = previousLayer
          this.transitionFromLayerConfig = previousLayerConfig
          this.transitionRandomSeed = previousLayerSeed
          this.transitionFromLayer.resize(this.width, this.height)
        } else {
          previousLayer.dispose()
          this.transitionFromLayer?.dispose()
          this.transitionFromLayer = null
          this.transitionFromLayerConfig = null
          this.transitionRandomSeed = null
          this.transitionDestinationReadyDeadlineMs = null
          this.transitionFadeStartMs = null
          this.transitionBeatTarget = null
        }
      } else {
        this.transitionFadeStartMs = null
        this.transitionBeatTarget = null
        this.transitionFromLayer?.dispose()
        this.transitionFromLayer = null
        this.transitionFromLayerConfig = null
        this.transitionRandomSeed = null
        this.transitionDestinationReadyDeadlineMs = null
        if (!this.applyLayerConfigInPlace(layerConfig)) {
          this.rebuildActiveLayer(layerConfig, true)
        }
      }
    }

    this.activeSceneId = visualSceneId
    this.transitionConfig = transition

    this.applyRandomSeed(this.activeRandomSeed)
    this.activeLayer.update(this.updateResource)
    if (
      this.transitionFromLayer !== null &&
      this.transitionFromLayerConfig !== null
    ) {
      this.applyRandomSeed(this.transitionRandomSeed ?? this.activeRandomSeed)
      this.transitionFromLayer.update(this.updateResource)
    }
    const negativeAmount = this.getGlobalNegativeAmount(layerConfig, stuff.params)
    const overlayFx = this.getGlobalOverlayEffects(layerConfig, stuff.params)
    const beatPulse = effectBeatPulse(
      Number(res.rt.audio?.beatPulse ?? 0),
      renderTime.beats
    )
    const stageLightMapStrength = stageLightMapMasterFromEffects(
      layerConfig.builtin.effects,
      stuff.params
    )
    const stageLightMapGrid = stageLightMapGridDimensions(layerConfig.previewAspectRatio)
    this.ensureRenderTargets(this.width, this.height)
    if (this.toTarget === null) {
      const [scene, camera] = this.activeLayer.getRenderInputs()
      this.renderer.setRenderTarget(null)
      this.renderer.render(scene, camera)
      return
    }

    const activeLayerReady = this.activeLayer.isFrameReady()
    if (activeLayerReady) {
      this.transitionDestinationReadyDeadlineMs = null
    }

    this.renderLayerToTarget(this.activeLayer, this.toTarget)

    if (this.fromTarget !== null && this.transitionFromLayer !== null) {
      if (!activeLayerReady) {
        if (this.transitionDestinationReadyDeadlineMs === null) {
          this.transitionDestinationReadyDeadlineMs = Date.now()
        }
      }
      const readinessTimeoutAllowed =
        !this.activeLayer.blocksTransitionReadinessTimeout()
      const destinationAcceptable =
        activeLayerReady ||
        (readinessTimeoutAllowed &&
          this.transitionDestinationReadyDeadlineMs !== null &&
          Date.now() - this.transitionDestinationReadyDeadlineMs >=
            VISUAL_SCENE_TRANSITION_READY_TIMEOUT_MS)

      if (!destinationAcceptable) {
        // Hold at the outgoing scene until async media (projectM, video, streams, images) is ready,
        // so fade/dissolve never starts into a black destination.
        this.transitionFadeStartMs = null
        this.transitionBeatTarget = null
      } else {
        if (this.transitionBeatTarget === null) {
          this.transitionBeatTarget = nextBeatBoundaryStrict(renderTime.beats)
        }
        const pastBeat =
          renderTime.beats + BEAT_START_EPS >= this.transitionBeatTarget
        if (!pastBeat) {
          this.transitionFadeStartMs = null
        } else if (this.transitionFadeStartMs === null) {
          this.transitionFadeStartMs = Date.now()
        }
      }
      this.renderLayerToTarget(this.transitionFromLayer, this.fromTarget)
      const progress = this.getTransitionProgress()
      this.renderComposite(
        progress,
        this.fromTarget.texture,
        this.toTarget.texture,
        toCompositeMode(this.transitionConfig.type),
        negativeAmount,
        overlayFx,
        (Date.now() % 60000) / 1000,
        beatPulse,
        stageLightMapStrength,
        stageLightMapGrid
      )
      if (progress >= 1) {
        this.transitionFadeStartMs = null
        this.transitionBeatTarget = null
        this.transitionDestinationReadyDeadlineMs = null
        this.transitionFromLayer.dispose()
        this.transitionFromLayer = null
        this.transitionFromLayerConfig = null
        this.transitionRandomSeed = null
      }
      return
    }

    if (this.transitionFromLayer !== null) {
      this.transitionDestinationReadyDeadlineMs = null
      this.transitionFadeStartMs = null
      this.transitionBeatTarget = null
      this.transitionFromLayer.dispose()
      this.transitionFromLayer = null
      this.transitionFromLayerConfig = null
      this.transitionRandomSeed = null
    }

    this.renderComposite(
      1,
      this.toTarget.texture,
      this.toTarget.texture,
      0,
      negativeAmount,
      overlayFx,
      (Date.now() % 60000) / 1000,
      beatPulse,
      stageLightMapStrength,
      stageLightMapGrid
    )
  }

  private findVisualizerSplitIndex(lightScene: LightScene_t) {
    for (let i = 0; i < lightScene.splitScenes.length; i++) {
      const groups = lightScene.splitScenes[i]?.groups ?? {}
      if (groups['Visualizer'] === true) {
        return i
      }
    }

    for (let i = 0; i < lightScene.splitScenes.length; i++) {
      const groups = lightScene.splitScenes[i]?.groups ?? {}
      if (this.groupFilterMatchesVisualizer(groups)) {
        return i
      }
    }

    return 0
  }

  private groupFilterMatchesVisualizer(splitGroups: SplitScene_t['groups']) {
    const entries = Object.entries(splitGroups)
    if (entries.length === 0) return false

    const visualizerGroups = ['Visualizer']
    const groups = entries
      .filter(([_, include]) => include === true)
      .map(([group]) => group)
    const notGroups = entries
      .filter(([_, include]) => include === false)
      .map(([group]) => group)

    if (groups.find((group) => visualizerGroups.includes(group))) return true
    if (notGroups.find((group) => !visualizerGroups.includes(group))) return true
    return false
  }

  resize(width: number, height: number) {
    this.width = width
    this.height = height
    this.renderer.setSize(width, height)
    this.activeLayer.resize(width, height)
    if (this.transitionFromLayer !== null) {
      this.transitionFromLayer.resize(width, height)
    }
    this.ensureRenderTargets(width, height)
  }

  dispose() {
    this.activeLayer.dispose()
    this.transitionFromLayer?.dispose()
    this.transitionFromLayer = null
    this.transitionFromLayerConfig = null
    this.transitionRandomSeed = null
    this.fromTarget?.dispose()
    this.toTarget?.dispose()
    this.lightMapReadTarget?.dispose()
    this.lightMapReadTarget = null
    this.lightMapReadBuffer = null
    this.feedbackRead?.dispose()
    this.feedbackWrite?.dispose()
    this.feedbackRead = null
    this.feedbackWrite = null
    this.blankFeedback.dispose()
    this.presentMaterial.dispose()
    this.presentScene.clear()
    this.compositeMaterial.dispose()
    this.compositeScene.clear()
    this.renderer.renderLists.dispose()
    try {
      this.renderer.forceContextLoss()
    } catch (_error) {
      // Some platforms may not expose WEBGL_lose_context.
    }
    this.renderer.dispose()
    const canvas = this.renderer.domElement
    if (canvas.parentElement !== null) {
      canvas.parentElement.removeChild(canvas)
    }
    this.updateResource = null
    this.lastSharedBeat = null
    this.lastIncomingBeat = null
    this.fallbackBeatAnchor = null
    this.fallbackBeatAnchorMs = null
    this.fallbackBpm = 120
    this.transitionFadeStartMs = null
    this.transitionBeatTarget = null
    this.transitionDestinationReadyDeadlineMs = null
    resetRandomSource()
  }

  ruthlessly_nuke_all_memory_I_dont_even_care_kill_it_with_fire() {
    this.dispose()
  }

  private rebuildActiveLayer(layerConfig: LayerConfig, disposePrevious = true) {
    this.activeRandomSeed = this.computeRandomSeed(layerConfig)
    const previous = this.activeLayer
    this.activeLayer = constructLayer(layerConfig)
    this.layerConfig = layerConfig
    this.activeLayer.resize(this.width, this.height)
    if (disposePrevious) {
      previous.dispose()
    }
  }

  private beginSceneTransition(transition: VisualSceneTransitionConfig) {
    const safeType =
      transition.type === 'cut' ||
      transition.type === 'fade' ||
      transition.type === 'dissolve' ||
      transition.type === 'flash'
        ? transition.type
        : 'fade'
    const durationMs = Math.max(80, Math.min(6000, transition.durationMs))

    if (safeType === 'cut' || this.width <= 1 || this.height <= 1) {
      this.transitionFadeStartMs = null
      this.transitionBeatTarget = null
      return false
    }

    this.ensureRenderTargets(this.width, this.height)
    if (this.fromTarget === null || this.toTarget === null) {
      this.transitionFadeStartMs = null
      this.transitionBeatTarget = null
      return false
    }

    this.transitionConfig = {
      type: safeType,
      durationMs,
    }
    this.transitionSeed = Math.random() * 1000
    this.transitionDestinationReadyDeadlineMs = null
    this.transitionFadeStartMs = null
    this.transitionBeatTarget = null
    return true
  }

  private isTransitionActive() {
    return this.transitionFromLayer !== null
  }

  private getTransitionProgress() {
    if (this.transitionFromLayer === null) return 1
    if (this.transitionFadeStartMs === null) return 0
    const elapsed = Date.now() - this.transitionFadeStartMs
    const duration = Math.max(80, this.transitionConfig.durationMs)
    return Math.min(1, Math.max(0, elapsed / duration))
  }

  private renderComposite(
    progress: number,
    fromTexture: THREE.Texture,
    toTexture: THREE.Texture,
    mode: number,
    negativeAmount: number,
    overlayFx: {
      blur: number
      glitch: number
      vignette: number
      anaglyph: number
      parallaxBarrier: number
      ascii: number
      afterImage: number
      posterize: number
      pixelate: number
      radialBlur: number
      edge: number
      beatFlash: number
      bloom: number
      filmGrain: number
      scanlines: number
      chromaShift: number
      mirror: number
      hueShift: number
      strobe: number
      rimLight: number
    },
    beatTime: number,
    beatPulse: number,
    _stageLightMapStrength: number,
    stageLightMapGrid: { width: number; height: number }
  ) {
    void _stageLightMapStrength
    this.compositeMaterial.uniforms.fromTex.value = fromTexture
    this.compositeMaterial.uniforms.toTex.value = toTexture
    this.compositeMaterial.uniforms.mixAmount.value = progress
    this.compositeMaterial.uniforms.mode.value = mode
    this.compositeMaterial.uniforms.seed.value = this.transitionSeed
    this.compositeMaterial.uniforms.negativeAmount.value = Math.min(
      1,
      Math.max(0, negativeAmount)
    )
    this.compositeMaterial.uniforms.timeSec.value = beatTime
    this.compositeMaterial.uniforms.blurAmount.value = overlayFx.blur
    this.compositeMaterial.uniforms.glitchAmount.value = overlayFx.glitch
    this.compositeMaterial.uniforms.vignetteAmount.value = overlayFx.vignette
    this.compositeMaterial.uniforms.anaglyphAmount.value = overlayFx.anaglyph
    this.compositeMaterial.uniforms.parallaxAmount.value = overlayFx.parallaxBarrier
    this.compositeMaterial.uniforms.asciiAmount.value = overlayFx.ascii
    this.compositeMaterial.uniforms.feedbackAmount.value = overlayFx.afterImage
    this.compositeMaterial.uniforms.feedbackTex.value =
      this.feedbackRead?.texture ?? this.blankFeedback
    this.compositeMaterial.uniforms.posterizeAmount.value = overlayFx.posterize
    this.compositeMaterial.uniforms.pixelateAmount.value = overlayFx.pixelate
    this.compositeMaterial.uniforms.radialBlurAmount.value = overlayFx.radialBlur
    this.compositeMaterial.uniforms.edgeAmount.value = overlayFx.edge
    this.compositeMaterial.uniforms.beatFlashAmount.value = overlayFx.beatFlash
    this.compositeMaterial.uniforms.beatPulse.value = beatPulse
    this.compositeMaterial.uniforms.bloomAmount.value = overlayFx.bloom
    this.compositeMaterial.uniforms.filmGrainAmount.value = overlayFx.filmGrain
    this.compositeMaterial.uniforms.scanlineAmount.value = overlayFx.scanlines
    this.compositeMaterial.uniforms.chromaAmount.value = overlayFx.chromaShift
    this.compositeMaterial.uniforms.mirrorAmount.value = overlayFx.mirror
    this.compositeMaterial.uniforms.hueAmount.value = overlayFx.hueShift
    this.compositeMaterial.uniforms.strobeAmount.value = overlayFx.strobe
    this.compositeMaterial.uniforms.rimAmount.value = overlayFx.rimLight

    if (overlayFx.afterImage > 0.001 && this.feedbackWrite !== null) {
      this.renderer.setRenderTarget(this.feedbackWrite)
      this.renderer.clear()
      this.renderer.render(this.compositeScene, this.compositeCamera)
      this.renderer.setRenderTarget(null)
      this.renderer.clear()
      this.presentMaterial.uniforms.tex.value = this.feedbackWrite.texture
      this.renderer.render(this.presentScene, this.compositeCamera)
      const previous = this.feedbackRead
      this.feedbackRead = this.feedbackWrite
      this.feedbackWrite = previous
    } else {
      this.renderer.setRenderTarget(null)
      this.renderer.clear()
      this.renderer.render(this.compositeScene, this.compositeCamera)
    }
    // Always capture the downsampled composite for UI preview + DMX sampling cache.
    // (DMX still gates *application* by stage light map effect strength × visStageMapMix.)
    this.captureStageLightMapFrame(stageLightMapGrid)
  }

  private captureStageLightMapFrame(grid: { width: number; height: number }) {
    if (++this.lightMapFrameTick % 2 !== 0) return
    const w = grid.width
    const h = grid.height
    if (this.lightMapReadTarget === null) {
      this.lightMapReadTarget = new THREE.WebGLRenderTarget(w, h, {
        depthBuffer: false,
        stencilBuffer: false,
      })
    } else {
      this.lightMapReadTarget.setSize(w, h)
    }
    const prevTarget = this.renderer.getRenderTarget()
    this.renderer.setRenderTarget(this.lightMapReadTarget)
    this.renderer.clear(true, true, true)
    this.renderer.render(this.compositeScene, this.compositeCamera)
    this.renderer.setRenderTarget(prevTarget)

    const expected = w * h * 4
    if (this.lightMapReadBuffer === null || this.lightMapReadBuffer.length !== expected) {
      this.lightMapReadBuffer = new Uint8Array(expected)
    }
    this.renderer.readRenderTargetPixels(
      this.lightMapReadTarget,
      0,
      0,
      w,
      h,
      this.lightMapReadBuffer
    )
    sendStageLightMapFrame({
      width: w,
      height: h,
      data: this.lightMapReadBuffer.slice(),
    })
  }

  private renderLayerToTarget(
    layer: LayerBase,
    target: THREE.WebGLRenderTarget | null
  ) {
    const [scene, camera] = layer.getRenderInputs()
    this.renderer.setRenderTarget(target)
    this.renderer.clear()
    this.renderer.render(scene, camera)
  }

  private applyLayerConfigInPlace(layerConfig: LayerConfig) {
    if (layerConfig.container !== this.layerConfig.container) {
      return false
    }
    const configurable = this.activeLayer as LayerBase & {
      applyConfig?: (nextConfig: LayerConfig) => boolean
    }
    if (typeof configurable.applyConfig !== 'function') {
      return false
    }
    const applied = configurable.applyConfig(layerConfig)
    if (applied) {
      this.layerConfig = layerConfig
      this.activeRandomSeed = this.computeRandomSeed(layerConfig)
    }
    return applied
  }

  private ensureRenderTargets(width: number, height: number) {
    const w = Math.max(1, Math.round(width))
    const h = Math.max(1, Math.round(height))
    if (w <= 1 || h <= 1) {
      return
    }

    if (this.fromTarget === null) {
      this.fromTarget = new THREE.WebGLRenderTarget(w, h)
    } else {
      this.fromTarget.setSize(w, h)
    }

    if (this.toTarget === null) {
      this.toTarget = new THREE.WebGLRenderTarget(w, h)
    } else {
      this.toTarget.setSize(w, h)
    }

    const feedbackOptions = { depthBuffer: false, stencilBuffer: false }
    if (this.feedbackRead === null || this.feedbackWrite === null) {
      this.feedbackRead?.dispose()
      this.feedbackWrite?.dispose()
      this.feedbackRead = new THREE.WebGLRenderTarget(w, h, feedbackOptions)
      this.feedbackWrite = new THREE.WebGLRenderTarget(w, h, feedbackOptions)
    } else {
      this.feedbackRead.setSize(w, h)
      this.feedbackWrite.setSize(w, h)
    }
  }

  private getSharedDtMs(currentBeats: number, bpm: number, fallbackDt: number) {
    if (!Number.isFinite(currentBeats) || !Number.isFinite(bpm) || bpm <= 0) {
      return Math.max(0, fallbackDt)
    }

    if (this.lastSharedBeat === null) {
      this.lastSharedBeat = currentBeats
      return 0
    }

    const deltaBeats = Math.max(0, currentBeats - this.lastSharedBeat)
    this.lastSharedBeat = currentBeats
    const dtFromBeats = (deltaBeats * 60000) / bpm

    if (!Number.isFinite(dtFromBeats)) {
      return Math.max(0, fallbackDt)
    }

    return Math.max(0, dtFromBeats)
  }

  private getRenderTime(source: TimeState): TimeState {
    const now = Date.now()
    const safeBpm =
      Number.isFinite(source.bpm) && source.bpm > 0 ? source.bpm : this.fallbackBpm
    const incomingBeat = Number.isFinite(source.beats) ? source.beats : 0

    const beatAdvanced =
      this.lastIncomingBeat === null || incomingBeat > this.lastIncomingBeat + 1e-6
    this.lastIncomingBeat = incomingBeat

    if (source.isPlaying && beatAdvanced) {
      this.fallbackBeatAnchor = incomingBeat
      this.fallbackBeatAnchorMs = now
      this.fallbackBpm = safeBpm
      return source
    }

    if (this.fallbackBeatAnchor === null || this.fallbackBeatAnchorMs === null) {
      this.fallbackBeatAnchor = incomingBeat
      this.fallbackBeatAnchorMs = now
      this.fallbackBpm = safeBpm
    } else if (Math.abs(safeBpm - this.fallbackBpm) > 0.0001) {
      const elapsedAtOldBpm = now - this.fallbackBeatAnchorMs
      this.fallbackBeatAnchor += (elapsedAtOldBpm * this.fallbackBpm) / 60000
      this.fallbackBeatAnchorMs = now
      this.fallbackBpm = safeBpm
    }

    const elapsedMs = now - this.fallbackBeatAnchorMs
    const renderBeats = this.fallbackBeatAnchor + (elapsedMs * this.fallbackBpm) / 60000
    return {
      ...source,
      beats: renderBeats,
      phase: toPhase(renderBeats, source.quantum),
    }
  }

  private computeRandomSeed(layerConfig: LayerConfig) {
    const seedInput = JSON.stringify({ layerConfig })
    return hashString(seedInput)
  }

  private applyRandomSeed(seed: number) {
    setRandomSource(createSeededRandom(seed))
  }

  private getGlobalNegativeAmount(layerConfig: LayerConfig, params: Params) {
    if (layerConfig.container !== 'builtin') {
      return 0
    }

    let amount = 0
    for (const effect of layerConfig.builtin.effects) {
      if (!effect.enabled || effect.type !== 'invert') {
        continue
      }
      const linkValue = getBuiltinEffectLinkValue(effect.linkSource, params)
      amount += (effect.amount ?? 0) * linkValue
    }
    return Math.min(1, Math.max(0, amount))
  }

  private getGlobalOverlayEffects(layerConfig: LayerConfig, params: Params) {
    if (layerConfig.container !== 'builtin') {
      return {
        blur: 0,
        glitch: 0,
        vignette: 0,
        anaglyph: 0,
        parallaxBarrier: 0,
        ascii: 0,
        afterImage: 0,
        posterize: 0,
        pixelate: 0,
        radialBlur: 0,
        edge: 0,
        beatFlash: 0,
        bloom: 0,
        filmGrain: 0,
        scanlines: 0,
        chromaShift: 0,
        mirror: 0,
        hueShift: 0,
        strobe: 0,
        rimLight: 0,
      }
    }

    let blur = 0
    let glitch = 0
    let vignette = 0
    let anaglyph = 0
    let parallaxBarrier = 0
    let ascii = 0
    let afterImage = 0
    let posterize = 0
    let pixelate = 0
    let radialBlur = 0
    let edge = 0
    let beatFlash = 0
    let bloom = 0
    let filmGrain = 0
    let scanlines = 0
    let chromaShift = 0
    let mirror = 0
    let hueShift = 0
    let strobe = 0
    let rimLight = 0
    for (const effect of layerConfig.builtin.effects) {
      if (!effect.enabled) continue
      const linkValue = getBuiltinEffectLinkValue(effect.linkSource, params)
      const weighted = Math.min(1, Math.max(0, (effect.amount ?? 0) * linkValue))
      if (effect.type === 'blur') {
        blur += weighted
      } else if (effect.type === 'glitch') {
        glitch += weighted
      } else if (effect.type === 'vignette') {
        vignette += weighted
      } else if (effect.type === 'afterImage') {
        afterImage += weighted
      } else if (effect.type === 'posterize') {
        posterize += weighted
      } else if (effect.type === 'anaglyph') {
        anaglyph += weighted
      } else if (effect.type === 'parallaxBarrier') {
        parallaxBarrier += weighted
      } else if (effect.type === 'ascii') {
        ascii += weighted
      } else if (effect.type === 'pixelate') {
        pixelate += weighted
      } else if (effect.type === 'radialBlur') {
        radialBlur += weighted
      } else if (effect.type === 'edge') {
        edge += weighted
      } else if (effect.type === 'beatFlash') {
        beatFlash += weighted
      } else if (effect.type === 'bloom') {
        bloom += weighted
      } else if (effect.type === 'filmGrain') {
        filmGrain += weighted
      } else if (effect.type === 'scanlines') {
        scanlines += weighted
      } else if (effect.type === 'chromaShift') {
        chromaShift += weighted
      } else if (effect.type === 'mirror') {
        mirror += weighted
      } else if (effect.type === 'hueShift') {
        hueShift += weighted
      } else if (effect.type === 'strobe') {
        strobe += weighted
      } else if (effect.type === 'rimLight') {
        rimLight += weighted
      }
    }

    return {
      blur: Math.min(1, Math.max(0, blur)),
      glitch: Math.min(1, Math.max(0, glitch)),
      vignette: Math.min(1, Math.max(0, vignette)),
      anaglyph: Math.min(1, Math.max(0, anaglyph)),
      parallaxBarrier: Math.min(1, Math.max(0, parallaxBarrier)),
      ascii: Math.min(1, Math.max(0, ascii)),
      afterImage: Math.min(1, Math.max(0, afterImage)),
      posterize: Math.min(1, Math.max(0, posterize)),
      pixelate: Math.min(1, Math.max(0, pixelate)),
      radialBlur: Math.min(1, Math.max(0, radialBlur)),
      edge: Math.min(1, Math.max(0, edge)),
      beatFlash: Math.min(1, Math.max(0, beatFlash)),
      bloom: Math.min(1, Math.max(0, bloom)),
      filmGrain: Math.min(1, Math.max(0, filmGrain)),
      scanlines: Math.min(1, Math.max(0, scanlines)),
      chromaShift: Math.min(1, Math.max(0, chromaShift)),
      mirror: Math.min(1, Math.max(0, mirror)),
      hueShift: Math.min(1, Math.max(0, hueShift)),
      strobe: Math.min(1, Math.max(0, strobe)),
      rimLight: Math.min(1, Math.max(0, rimLight)),
    }
  }
}

function effectBeatPulse(audioPulse: number, beats: number) {
  const audio = Math.min(1, Math.max(0, Number.isFinite(audioPulse) ? audioPulse : 0))
  const phase = ((beats % 1) + 1) % 1
  const clock = Math.pow(1 - phase, 5)
  return Math.min(1, Math.max(audio, clock))
}

function toCompositeMode(type: VisualSceneTransitionConfig['type']) {
  if (type === 'dissolve') return 1
  if (type === 'flash') return 2
  return 0
}

function toPhase(beats: number, quantum: number) {
  const safeQuantum = Number.isFinite(quantum) && quantum > 0 ? quantum : 4
  const phase = beats % safeQuantum
  return phase < 0 ? phase + safeQuantum : phase
}

function hashString(input: string) {
  let hash = 2166136261 >>> 0
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function createSeededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function getBuiltinEffectLinkValue(linkSource: string, params: Params) {
  const match = /^visSlider([1-8])$/.exec(linkSource)
  if (match === null) {
    return 1
  }
  const key = `visSlider${match[1]}`
  return clamp01(params[key], 0.5)
}

function clamp01(value: unknown, fallback: number) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(1, Math.max(0, numeric))
}
