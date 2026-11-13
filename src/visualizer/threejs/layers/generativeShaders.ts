import * as THREE from 'three'
import type { BuiltinGeneratorType } from './BuiltinVisualizer'

export const generativeFieldGenerators: BuiltinGeneratorType[] = [
  'fractal',
  'kaleidoscope',
  'oilWater',
  'fluid',
  'solid',
]

const PLATE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  // The plane is larger than the camera so the edges stay covered.
  // Map pattern space to the resting view so the detail stays on screen.
  vUv = vec2(position.x / 10.0, position.y / 5.6) + 0.5;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const HSL = /* glsl */ `
vec3 hsl2rgb(float h, float s, float l) {
  vec3 rgb = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return l + s * (rgb - 0.5) * (1.0 - abs(2.0 * l - 1.0));
}
`

const NOISE = /* glsl */ `
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.02 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}
`

const COMMON_UNIFORMS = /* glsl */ `
uniform float uTime;
uniform float uHue;
uniform float uDensity;
uniform float uSpeed;
uniform float uScale;
uniform float uVariety;
uniform float uBeat;
uniform float uMix;
`

const FRACTAL_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
${COMMON_UNIFORMS}
uniform float uTravel;
${HSL}

// 60-bit fixed point, 10 bits per limb, binary point at 2^-50.
// Plain double-float collapses on the GPU once the dive is this deep,
// and neighboring pixels turn into the same block.
struct Fx {
  vec4 d;
  vec2 e;
};

Fx fxCarry(Fx p) {
  float L0 = p.d.x;
  float L1 = p.d.y;
  float L2 = p.d.z;
  float L3 = p.d.w;
  float L4 = p.e.x;
  float L5 = p.e.y;
  float c;
  c = floor(L0 / 1024.0); L0 -= c * 1024.0; L1 += c;
  c = floor(L1 / 1024.0); L1 -= c * 1024.0; L2 += c;
  c = floor(L2 / 1024.0); L2 -= c * 1024.0; L3 += c;
  c = floor(L3 / 1024.0); L3 -= c * 1024.0; L4 += c;
  c = floor(L4 / 1024.0); L4 -= c * 1024.0; L5 += c;
  c = floor(L5 / 1024.0); L5 -= c * 1024.0;
  if (L5 < 0.0) L5 += 1024.0;
  return Fx(vec4(L0, L1, L2, L3), vec2(L4, L5));
}

Fx fxNeg(Fx a) {
  return fxCarry(Fx(
    vec4(1024.0 - a.d.x, 1023.0 - a.d.y, 1023.0 - a.d.z, 1023.0 - a.d.w),
    vec2(1023.0 - a.e.x, 1023.0 - a.e.y)
  ));
}

Fx fxAdd(Fx a, Fx b) {
  return fxCarry(Fx(a.d + b.d, a.e + b.e));
}

Fx fxMul(Fx a, Fx b) {
  bool na = a.e.y >= 512.0;
  bool nb = b.e.y >= 512.0;
  if (na) a = fxNeg(a);
  if (nb) b = fxNeg(b);
  float A0 = a.d.x, A1 = a.d.y, A2 = a.d.z, A3 = a.d.w, A4 = a.e.x, A5 = a.e.y;
  float B0 = b.d.x, B1 = b.d.y, B2 = b.d.z, B3 = b.d.w, B4 = b.e.x, B5 = b.e.y;
  float p0 = A0 * B0;
  float p1 = A0 * B1 + A1 * B0;
  float p2 = A0 * B2 + A1 * B1 + A2 * B0;
  float p3 = A0 * B3 + A1 * B2 + A2 * B1 + A3 * B0;
  float p4 = A0 * B4 + A1 * B3 + A2 * B2 + A3 * B1 + A4 * B0;
  float p5 = A0 * B5 + A1 * B4 + A2 * B3 + A3 * B2 + A4 * B1 + A5 * B0;
  float p6 = A1 * B5 + A2 * B4 + A3 * B3 + A4 * B2 + A5 * B1;
  float p7 = A2 * B5 + A3 * B4 + A4 * B3 + A5 * B2;
  float p8 = A3 * B5 + A4 * B4 + A5 * B3;
  float p9 = A4 * B5 + A5 * B4;
  float p10 = A5 * B5;
  float c;
  c = floor(p0 / 1024.0); p0 -= c * 1024.0; p1 += c;
  c = floor(p1 / 1024.0); p1 -= c * 1024.0; p2 += c;
  c = floor(p2 / 1024.0); p2 -= c * 1024.0; p3 += c;
  c = floor(p3 / 1024.0); p3 -= c * 1024.0; p4 += c;
  c = floor(p4 / 1024.0); p4 -= c * 1024.0; p5 += c;
  c = floor(p5 / 1024.0); p5 -= c * 1024.0; p6 += c;
  c = floor(p6 / 1024.0); p6 -= c * 1024.0; p7 += c;
  c = floor(p7 / 1024.0); p7 -= c * 1024.0; p8 += c;
  c = floor(p8 / 1024.0); p8 -= c * 1024.0; p9 += c;
  c = floor(p9 / 1024.0); p9 -= c * 1024.0; p10 += c;
  c = floor(p10 / 1024.0); p10 -= c * 1024.0;
  Fx r = Fx(vec4(p5, p6, p7, p8), vec2(p9, p10));
  if (na != nb) r = fxNeg(r);
  return r;
}

Fx fxSmall(float x) {
  float n = round(x * 1125899906842624.0);
  float s = n < 0.0 ? -1.0 : 1.0;
  n = abs(n);
  float L0 = mod(n, 1024.0); n = floor(n / 1024.0);
  float L1 = mod(n, 1024.0); n = floor(n / 1024.0);
  float L2 = mod(n, 1024.0); n = floor(n / 1024.0);
  float L3 = mod(n, 1024.0); n = floor(n / 1024.0);
  float L4 = mod(n, 1024.0); n = floor(n / 1024.0);
  float L5 = mod(n, 1024.0);
  Fx r = Fx(vec4(L0, L1, L2, L3), vec2(L4, L5));
  if (s < 0.0) r = fxNeg(r);
  return r;
}

float fxMag(Fx a) {
  float s = a.e.y >= 512.0 ? a.e.y - 1024.0 : a.e.y;
  return s + a.e.x / 1024.0 + a.d.w / 1048576.0;
}

float escape(vec2 dc, float maxIter) {
  Fx zr = Fx(vec4(0.0), vec2(0.0));
  Fx zi = Fx(vec4(0.0), vec2(0.0));
  Fx cr = fxAdd(Fx(vec4(827.0, 797.0, 393.0, 700.0), vec2(218.0, 1023.0)), fxSmall(dc.x));
  Fx ci = fxAdd(Fx(vec4(528.0, 422.0, 496.0, 854.0), vec2(169.0, 0.0)), fxSmall(dc.y));
  int i = 0;
  while (i < 320) {
    if (float(i) >= maxIter) return maxIter;
    Fx zr2 = fxMul(zr, zr);
    Fx zi2 = fxMul(zi, zi);
    Fx zri = fxMul(zr, zi);
    zr = fxAdd(fxAdd(zr2, fxNeg(zi2)), cr);
    zi = fxAdd(fxAdd(zri, zri), ci);
    float mag = fxMag(zr) * fxMag(zr) + fxMag(zi) * fxMag(zi);
    if (mag > 256.0) {
      return float(i) + 1.0 - log2(log2(max(mag, 1.01)));
    }
    i++;
  }
  return maxIter;
}

vec3 arms(float it, float maxIter, float depth) {
  if (it >= maxIter - 0.5) {
    return hsl2rgb(uHue, 0.7, 0.015);
  }
  float t = it - depth;
  float stripes = t * mix(0.16, 0.42, uVariety);
  float f = fract(stripes);
  float edge = smoothstep(0.0, 0.07, f) * smoothstep(0.4, 0.1, f);
  float body = pow(clamp(sin(stripes * 3.14159265), 0.0, 1.0), 1.35);
  float hue = fract(uHue + t * 0.015);
  float light = 0.02 + body * 0.36 + edge * 0.6 + uBeat * 0.04;
  return hsl2rgb(hue, 0.9, light);
}

void main() {
  // One turn of a self-similar spiral. At the end of the turn the picture
  // matches the start, so the zoom wraps instead of going deeper. Arms that
  // have left the frame are not carried into the next turn.
  float phase = fract(uTravel / 3.2941452);
  float shrink = pow(6.9645177, -phase);
  float ang = phase * 0.9455003;
  float halfH = mix(4.14e-10, 1.86e-10, uScale);
  vec2 p = vec2((vUv.x - 0.5) * 1.7857143, vUv.y - 0.5) * (2.0 * halfH);
  vec2 d = p + vec2(-5.2357392e-10, -6.9549389e-11);
  float cs = cos(ang);
  float sn = sin(ang);
  vec2 o = vec2(cs * d.x - sn * d.y, sn * d.x + cs * d.y) * shrink;
  float maxIter = mix(190.0, 260.0, uDensity);
  float it = escape(o, maxIter);
  vec3 rgb = it >= maxIter - 0.5
    ? hsl2rgb(uHue, 0.7, 0.015)
    : arms(it - phase * 3.0, maxIter + 8.0, 0.0);
  gl_FragColor = vec4(rgb, uMix);
}
`

const KALEIDOSCOPE_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
${COMMON_UNIFORMS}
${HSL}
${NOISE}
void main() {
  vec2 p = vUv - 0.5;
  float r = length(p);
  float ang = atan(p.y, p.x);
  float sides = floor(mix(3.0, 14.0, uVariety));
  float slice = 6.2831853 / sides;
  ang = mod(ang, slice);
  ang = abs(ang - slice * 0.5);
  vec2 q = vec2(cos(ang), sin(ang)) * r;
  float spin = uTime * (0.15 + uSpeed);
  q += vec2(cos(spin), sin(spin * 0.7)) * 0.08;
  float freq = mix(12.0, 34.0, uDensity);
  float band = sin(q.x * freq + uTime * (0.6 + uSpeed * 2.0));
  band *= sin(q.y * freq * 0.65 - uTime * 0.8);
  float n = fbm(q * (3.0 + uDensity * 6.0) + uTime * 0.15);
  float v = clamp(band * 0.5 + 0.5 + (n - 0.5) * 0.65 + uBeat * 0.2, 0.0, 1.0);
  float hue = fract(uHue + ang * 0.15 + v * 0.12);
  vec3 col = hsl2rgb(hue, 0.72, 0.12 + v * 0.62);
  float mask = smoothstep(0.72, 0.15, r);
  gl_FragColor = vec4(col, mask * uMix);
}
`

const OIL_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
${COMMON_UNIFORMS}
${HSL}
${NOISE}
void main() {
  vec2 uv = vUv * mix(2.8, 6.0, uDensity);
  float t = uTime * (0.05 + uSpeed * 0.14);
  vec2 warp = vec2(fbm(uv + t), fbm(uv.yx - t * 0.8 + uVariety * 3.0));
  float oil = fbm(uv + warp * (0.8 + uVariety * 0.6));
  float water = fbm(uv * 1.7 - warp - t);
  float detail = fbm(uv * 2.6 + warp * 1.4);
  float edge = smoothstep(0.1, 0.0, abs(oil - water)) * (0.45 + detail);
  vec3 oilCol = hsl2rgb(uHue, 0.9, 0.28 + oil * 0.25);
  vec3 waterCol = hsl2rgb(fract(uHue + 0.52), 0.4, 0.42 + water * 0.2);
  vec3 col = mix(waterCol, oilCol, smoothstep(0.32, 0.68, oil + uBeat * 0.08));
  col += edge * vec3(1.0, 0.95, 0.8) * 0.85;
  gl_FragColor = vec4(col, uMix);
}
`

const PLASMA_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
${COMMON_UNIFORMS}
${HSL}
void main() {
  vec2 p = (vUv - 0.5) * mix(2.2, 1.45, uScale);
  float t = uTime * (0.35 + uSpeed * 1.5);
  float freq = mix(8.0, 16.0, uDensity);
  float v = sin(p.x * freq + t);
  v += sin(p.y * (freq + 2.0) - t * 0.85);
  v += sin((p.x + p.y) * mix(6.0, 14.0, uVariety) + t * 0.55);
  v += sin(length(p) * freq * 1.6 - t * 1.3);
  float fine = sin(p.x * freq * 3.1 + t * 1.8) * sin(p.y * freq * 2.4 - t * 1.3);
  v = clamp((v + fine * 0.85) * 0.2 + 0.5 + uBeat * 0.08, 0.0, 1.0);
  float hue = fract(uHue + v * 0.38);
  vec3 col = hsl2rgb(hue, 0.84, 0.16 + v * 0.58);
  gl_FragColor = vec4(col, uMix);
}
`

const LIGHT_TUNNEL_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
${COMMON_UNIFORMS}
${HSL}
void main() {
  vec2 p = vUv - 0.5;
  p.x *= mix(1.15, 1.8, uScale);
  float r = length(p);
  float ang = atan(p.y, p.x);
  float t = uTime * (0.45 + uSpeed * 1.8);
  float z = 1.0 / max(r, 0.02);
  float ribs = sin(z * mix(10.0, 24.0, uDensity) - t * 3.2);
  float spokes = sin(ang * floor(mix(8.0, 22.0, uVariety)) + z * 0.35 + t * 0.6);
  float v = clamp(ribs * 0.5 + 0.5 + spokes * 0.32 + uBeat * 0.1, 0.0, 1.0);
  float hue = fract(uHue + z * 0.02 + ang * 0.05);
  vec3 col = hsl2rgb(hue, 0.78, 0.1 + v * 0.55);
  col += hsl2rgb(fract(uHue + 0.08), 0.4, 0.8) * smoothstep(0.07, 0.0, r) * 0.45;
  gl_FragColor = vec4(col, uMix);
}
`

const AURORA_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
${COMMON_UNIFORMS}
${HSL}
${NOISE}
void main() {
  vec2 p = vUv;
  float t = uTime * (0.06 + uSpeed * 0.22);
  float n = fbm(vec2(p.x * mix(1.2, 4.5, uDensity) + t, p.y * mix(0.3, 1.1, uScale) - t));
  float curtain = sin(p.x * mix(6.0, 16.0, uVariety) + n * 6.0 + t * 2.4);
  float streaks = 0.5 + 0.5 * sin(p.x * mix(22.0, 54.0, uDensity) + n * 9.0 + t * 3.0);
  float height = smoothstep(0.0, 0.35, p.y) * smoothstep(1.0, 0.25, p.y);
  float v = clamp((curtain * 0.5 + 0.5) * 0.45 + streaks * height * 0.55 + n * 0.25 + uBeat * 0.08, 0.0, 1.0);
  vec3 sky = hsl2rgb(fract(uHue + 0.58), 0.62, 0.07 + n * 0.08);
  vec3 sheet = hsl2rgb(fract(uHue + 0.38 + n * 0.18), 0.72, 0.28 + v * 0.4);
  vec3 col = mix(sky, sheet, smoothstep(0.28, 0.82, v));
  gl_FragColor = vec4(col, uMix);
}
`

const HEX_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
${COMMON_UNIFORMS}
${HSL}
${NOISE}
void main() {
  // Equal steps on screen, so the cells stay regular hexes in a 16:9 frame.
  vec2 p = vec2((vUv.x - 0.5) * 1.7857143, vUv.y - 0.5);
  p *= mix(4.5, 14.0, uDensity);
  p *= mix(1.35, 0.7, uScale);
  p.x += uTime * (0.03 + uSpeed * 0.14);
  vec2 r = vec2(1.0, 1.7320508);
  vec2 h = r * 0.5;
  vec2 a = mod(p, r) - h;
  vec2 b = mod(p - h, r) - h;
  vec2 gv = dot(a, a) < dot(b, b) ? a : b;
  vec2 id = p - gv;
  vec2 q = abs(gv);
  // 0 on the shared wall, larger toward the middle of the hex.
  float inside = 0.5 - max(q.x, 0.5 * q.x + 0.8660254 * q.y);
  float wallW = mix(0.018, 0.055, uVariety);
  float wall = 1.0 - smoothstep(0.0, wallW, inside);
  float pulse = 0.5 + 0.5 * sin(uTime * (0.8 + uSpeed * 2.2) + hash(id) * 6.2831 + uBeat * 4.0);
  float body = smoothstep(0.0, 0.16, inside) * (0.45 + pulse * 0.55);
  float hue = fract(uHue + hash(id) * 0.22 * (0.25 + uVariety));
  vec3 fillCol = hsl2rgb(hue, 0.78, 0.05 + body * 0.32);
  vec3 wallCol = hsl2rgb(fract(hue + 0.06), 0.28, 0.62 + pulse * 0.16 + uBeat * 0.18);
  vec3 col = mix(fillCol, wallCol, clamp(wall + uBeat * 0.15, 0.0, 1.0));
  gl_FragColor = vec4(col, uMix);
}
`

const VORTEX_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
${COMMON_UNIFORMS}
${HSL}
void main() {
  vec2 p = vUv - 0.5;
  p *= mix(1.6, 0.7, uScale);
  float r = length(p);
  float ang = atan(p.y, p.x);
  float t = uTime * (0.3 + uSpeed * 1.4);
  float arms = floor(mix(2.0, 9.0, uVariety));
  float twist = mix(10.0, 26.0, uDensity);
  float spiral = sin(ang * arms - log(max(r, 0.001)) * twist + t * 3.0);
  float v = clamp(pow(spiral * 0.5 + 0.5, 0.85) + uBeat * 0.16, 0.0, 1.0);
  float hue = fract(uHue + ang * 0.1 + r * 0.35);
  vec3 col = hsl2rgb(hue, 0.8, 0.08 + v * 0.62);
  gl_FragColor = vec4(col, uMix);
}
`

const CLOUDS_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
${COMMON_UNIFORMS}
${HSL}
${NOISE}
void main() {
  vec2 uv = vUv * mix(2.6, 5.2, uDensity);
  uv *= mix(1.25, 0.85, uScale);
  float t = uTime * (0.04 + uSpeed * 0.14);
  float n = fbm(uv + vec2(t, t * 0.35));
  float n2 = fbm(uv * (2.2 + uVariety) - vec2(t * 0.7, t));
  float grain = fbm(uv * 4.5 + n2);
  float v = clamp(n * 0.4 + n2 * 0.35 + grain * 0.35 + uBeat * 0.06, 0.0, 1.0);
  vec3 low = hsl2rgb(fract(uHue + 0.55), 0.62, 0.12);
  vec3 high = hsl2rgb(uHue, 0.4, 0.62);
  vec3 col = mix(low, high, smoothstep(0.34, 0.7, v));
  col += (grain - 0.5) * 0.16;
  gl_FragColor = vec4(col, uMix);
}
`

const RAYS_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
${COMMON_UNIFORMS}
${HSL}
void main() {
  vec2 p = vUv - 0.5;
  p *= mix(1.5, 0.75, uScale);
  float r = length(p);
  float ang = atan(p.y, p.x);
  float t = uTime * (0.15 + uSpeed * 0.9);
  float count = floor(mix(10.0, 36.0, uDensity));
  float beams = pow(abs(sin(ang * count + t)), mix(1.6, 6.0, uVariety));
  float glow = exp(-r * 7.0);
  float rings = 0.5 + 0.5 * sin(r * mix(18.0, 40.0, uDensity) - t * 2.0);
  float v = clamp(beams * 0.72 + rings * 0.28 + glow * 0.35 + uBeat * 0.06, 0.0, 1.0);
  float hue = fract(uHue + ang * 0.04 + r * 0.12);
  vec3 col = hsl2rgb(hue, 0.76, 0.07 + v * 0.68);
  gl_FragColor = vec4(col, uMix);
}
`

const WATER_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uWater;
uniform vec2 uTexel;
${COMMON_UNIFORMS}
${HSL}
float waterHeight(vec2 uv) {
  return (texture2D(uWater, uv).r - 0.5) * 2.5;
}
void main() {
  float hC = waterHeight(vUv);
  float hx = waterHeight(vUv + vec2(uTexel.x, 0.0)) - waterHeight(vUv - vec2(uTexel.x, 0.0));
  float hy = waterHeight(vUv + vec2(0.0, uTexel.y)) - waterHeight(vUv - vec2(0.0, uTexel.y));
  float slope = mix(5.0, 14.0, uScale);
  vec3 normal = normalize(vec3(-hx * slope, -hy * slope, 1.0));
  float t = uTime * (0.12 + uSpeed * 0.2);
  vec3 light = normalize(vec3(sin(t) * 0.45, 0.72, 0.62));
  float shade = 0.42 + 0.58 * clamp(dot(normal, light), 0.0, 1.0);
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  float spec = pow(clamp(dot(reflect(-light, normal), viewDir), 0.0, 1.0), 36.0);
  float fres = pow(1.0 - clamp(normal.z, 0.0, 1.0), 2.4);
  vec3 deep = hsl2rgb(fract(uHue + 0.58), 0.78, 0.1);
  vec3 crest = hsl2rgb(fract(uHue + 0.5), 0.48, 0.42);
  vec3 col = mix(deep, crest, smoothstep(-0.08, 0.28, hC));
  col *= shade;
  col += vec3(0.75, 0.9, 1.0) * spec * (0.85 + uBeat * 0.45);
  col += crest * fres * 0.45;
  gl_FragColor = vec4(col, uMix);
}
`

const FIELD_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec2 uPoints[20];
uniform float uCount;
uniform float uHue;
uniform float uScale;
uniform float uMix;
uniform float uBeat;
${HSL}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float field = 0.0;
  float radius = mix(0.012, 0.04, uScale);
  for (int i = 0; i < 20; i++) {
    if (float(i) >= uCount) break;
    vec2 d = p - uPoints[i];
    field += radius / (dot(d, d) + 0.012);
  }
  float body = smoothstep(0.9, 1.25, field);
  float rim = smoothstep(0.75, 1.05, field) - body;
  vec3 col = hsl2rgb(uHue, 0.75, 0.22 + body * 0.45 + uBeat * 0.08);
  col += rim * vec3(1.0);
  gl_FragColor = vec4(col, max(body, rim * 0.85) * uMix);
}
`

const MAX_PARTICLES = 20

export type ParticleSimMode = 'fluid' | 'solid'

export interface ParticleSimScratch {
  positions: Float32Array
  velocities: Float32Array
  rest: Float32Array
}

export const fullFrameGenerators: BuiltinGeneratorType[] = [
  'fractal',
  'kaleidoscope',
  'oilWater',
  'fluid',
  'solid',
  'plasma',
  'lightTunnel',
  'aurora',
  'hexGrid',
  'vortex',
  'clouds',
  'rays',
]

export function isGenerativePlate(generator: BuiltinGeneratorType) {
  return fullFrameGenerators.includes(generator)
}

export function createParticleSim(mode: ParticleSimMode): ParticleSimScratch {
  const positions = new Float32Array(MAX_PARTICLES * 2)
  const velocities = new Float32Array(MAX_PARTICLES * 2)
  const rest = new Float32Array(MAX_PARTICLES * 2)
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const ang = (i / MAX_PARTICLES) * Math.PI * 2
    const radius = mode === 'solid' ? 0.34 : 0.15 + (i % 5) * 0.06
    const x = Math.cos(ang) * radius
    const y = Math.sin(ang) * radius
    positions[i * 2] = x
    positions[i * 2 + 1] = y
    rest[i * 2] = x
    rest[i * 2 + 1] = y
  }
  return { positions, velocities, rest }
}

function curl(x: number, y: number, time: number) {
  const s = 1.7
  const n1 = Math.sin(y * s + time) + Math.cos(x * s * 0.7 - time * 0.6)
  const n2 = Math.cos(x * s + time * 0.8) - Math.sin(y * s * 0.6)
  return { x: n1, y: n2 }
}

export function stepParticleSim(
  sim: ParticleSimScratch,
  mode: ParticleSimMode,
  dt: number,
  count: number,
  speed: number,
  variety: number,
  beat: number
) {
  const step = Math.min(0.05, Math.max(0, dt))
  const n = Math.max(1, Math.min(MAX_PARTICLES, Math.round(count)))
  const stiffness = 2 + variety * 18
  for (let i = 0; i < n; i++) {
    const ix = i * 2
    let x = sim.positions[ix]
    let y = sim.positions[ix + 1]
    let vx = sim.velocities[ix]
    let vy = sim.velocities[ix + 1]
    if (mode === 'fluid') {
      const flow = curl(x, y, performance.now() * 0.001 * (0.35 + speed))
      vx += flow.x * (0.8 + speed * 2.2) * step
      vy += flow.y * (0.8 + speed * 2.2) * step
      vx += -x * 0.55 * step
      vy += -y * 0.55 * step
      vx *= 1 - step * 1.4
      vy *= 1 - step * 1.4
    } else {
      const rx = sim.rest[ix]
      const ry = sim.rest[ix + 1]
      vx += (rx - x) * stiffness * step
      vy += (ry - y) * stiffness * step
      const next = (i + 1) % n
      const px = sim.positions[next * 2]
      const py = sim.positions[next * 2 + 1]
      const restDx = sim.rest[next * 2] - rx
      const restDy = sim.rest[next * 2 + 1] - ry
      const restLen = Math.hypot(restDx, restDy) || 0.2
      const dx = px - x
      const dy = py - y
      const len = Math.hypot(dx, dy) || 0.0001
      const stretch = (len - restLen) / len
      vx += dx * stretch * stiffness * step
      vy += dy * stretch * stiffness * step
      vx *= 1 - step * 2.2
      vy *= 1 - step * 2.2
    }
    if (beat > 0.04) {
      vx += (x === 0 && y === 0 ? 0.2 : x) * beat * 1.6 * step * 8
      vy += (y === 0 && x === 0 ? 0.2 : y) * beat * 1.6 * step * 8
    }
    x += vx * step
    y += vy * step
    const limit = 0.92
    if (x > limit || x < -limit) vx *= -0.45
    if (y > limit || y < -limit) vy *= -0.45
    sim.positions[ix] = Math.max(-limit, Math.min(limit, x))
    sim.positions[ix + 1] = Math.max(-limit, Math.min(limit, y))
    sim.velocities[ix] = vx
    sim.velocities[ix + 1] = vy
  }
}

function plateUniforms() {
  return {
    uTime: { value: 0 },
    uHue: { value: 0.55 },
    uDensity: { value: 0.55 },
    uSpeed: { value: 0.5 },
    uScale: { value: 0.55 },
    uVariety: { value: 0.4 },
    uBeat: { value: 0 },
    uMix: { value: 1 },
  }
}

function fragmentFor(generator: BuiltinGeneratorType) {
  switch (generator) {
    case 'fractal':
      return FRACTAL_FRAGMENT
    case 'kaleidoscope':
      return KALEIDOSCOPE_FRAGMENT
    case 'oilWater':
      return OIL_FRAGMENT
    case 'fluid':
      return WATER_FRAGMENT
    case 'plasma':
      return PLASMA_FRAGMENT
    case 'lightTunnel':
      return LIGHT_TUNNEL_FRAGMENT
    case 'aurora':
      return AURORA_FRAGMENT
    case 'hexGrid':
      return HEX_FRAGMENT
    case 'vortex':
      return VORTEX_FRAGMENT
    case 'clouds':
      return CLOUDS_FRAGMENT
    case 'rays':
      return RAYS_FRAGMENT
    default:
      return FIELD_FRAGMENT
  }
}

export function createGenerativeMaterial(
  generator: BuiltinGeneratorType
): THREE.ShaderMaterial {
  const points = Array.from({ length: MAX_PARTICLES }, () => new THREE.Vector2())
  return new THREE.ShaderMaterial({
    uniforms: {
      ...plateUniforms(),
      ...(generator === 'fractal' ? { uTravel: { value: 0 } } : {}),
      ...(generator === 'fluid'
        ? {
            uWater: { value: new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1) },
            uTexel: { value: new THREE.Vector2(1 / 128, 1 / 72) },
          }
        : {}),
      uPoints: { value: points },
      uCount: { value: 12 },
    },
    vertexShader: PLATE_VERTEX,
    fragmentShader: fragmentFor(generator),
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  })
}

export function createGenerativePlate(): THREE.PlaneGeometry {
  return new THREE.PlaneGeometry(42, 24)
}

export function syncGenerativeMaterial(
  material: THREE.ShaderMaterial,
  values: {
    time: number
    hue: number
    density: number
    speed: number
    scale: number
    variety: number
    beat: number
    mix: number
    travel?: number
  }
) {
  const uniforms = material.uniforms
  uniforms.uTime.value = values.time
  uniforms.uHue.value = values.hue
  uniforms.uDensity.value = values.density
  uniforms.uSpeed.value = values.speed
  uniforms.uScale.value = values.scale
  uniforms.uVariety.value = values.variety
  uniforms.uBeat.value = values.beat
  uniforms.uMix.value = values.mix
  if (uniforms.uTravel && values.travel !== undefined) {
    uniforms.uTravel.value = values.travel
  }
}

export function writeParticleUniforms(
  material: THREE.ShaderMaterial,
  sim: ParticleSimScratch,
  count: number
) {
  const points = material.uniforms.uPoints.value as THREE.Vector2[]
  const n = Math.max(1, Math.min(MAX_PARTICLES, Math.round(count)))
  for (let i = 0; i < n; i++) {
    points[i].set(sim.positions[i * 2], sim.positions[i * 2 + 1])
  }
  material.uniforms.uCount.value = n
}

const WATER_W = 128
const WATER_H = 72

export interface WaterSim {
  width: number
  height: number
  heightField: Float32Array
  velocity: Float32Array
  pixels: Uint8Array
  texture: THREE.DataTexture
  prevBeat: number
  cooldown: number
}

export function createWaterSim(): WaterSim {
  const heightField = new Float32Array(WATER_W * WATER_H)
  const velocity = new Float32Array(WATER_W * WATER_H)
  const pixels = new Uint8Array(WATER_W * WATER_H * 4)
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 128
    pixels[i + 1] = 128
    pixels[i + 2] = 128
    pixels[i + 3] = 255
  }
  const texture = new THREE.DataTexture(pixels, WATER_W, WATER_H)
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.generateMipmaps = false
  texture.flipY = false
  texture.colorSpace = THREE.NoColorSpace
  texture.needsUpdate = true
  return {
    width: WATER_W,
    height: WATER_H,
    heightField,
    velocity,
    pixels,
    texture,
    prevBeat: 0,
    cooldown: 0,
  }
}

function splashWater(sim: WaterSim, x: number, y: number, amp: number, radius: number) {
  const cx = Math.round(x)
  const cy = Math.round(y)
  const reach = Math.ceil(radius * 2)
  const { width, height, heightField, velocity } = sim
  for (let j = -reach; j <= reach; j++) {
    for (let i = -reach; i <= reach; i++) {
      const xx = cx + i
      const yy = cy + j
      if (xx < 1 || yy < 1 || xx >= width - 1 || yy >= height - 1) continue
      const d2 = i * i + j * j
      const g = Math.exp(-d2 / (radius * radius))
      const idx = yy * width + xx
      heightField[idx] -= amp * g
      velocity[idx] -= amp * g * 8
    }
  }
}

function writeWaterTexture(sim: WaterSim) {
  const { heightField, pixels } = sim
  for (let i = 0; i < heightField.length; i++) {
    const encoded = Math.max(0, Math.min(255, Math.round((heightField[i] * 0.4 + 0.5) * 255)))
    const p = i * 4
    pixels[p] = encoded
    pixels[p + 1] = encoded
    pixels[p + 2] = encoded
    pixels[p + 3] = 255
  }
  sim.texture.needsUpdate = true
}

export function stepWaterSim(
  sim: WaterSim,
  dt: number,
  time: number,
  speed: number,
  density: number,
  scale: number,
  variety: number,
  beat: number
) {
  const { width, height, heightField, velocity } = sim
  const stepDt = Math.min(0.05, Math.max(0, dt))
  const sub = 4
  const hdt = stepDt / sub
  const motion = Math.max(0, speed)
  const waveK = Math.min(4200, 1400 + motion * 1100)
  const damp = 2.2 - Math.max(0, Math.min(1, variety)) * 1.6
  const ax = Math.sin(time * (0.35 + motion * 0.28)) * (0.2 + motion * 0.28)
  const ay = Math.cos(time * (0.27 + motion * 0.18)) * (0.16 + motion * 0.22)
  for (let s = 0; s < sub; s++) {
    for (let y = 0; y < height; y++) {
      const row = y * width
      const ny = (y / (height - 1)) * 2 - 1
      for (let x = 0; x < width; x++) {
        const i = row + x
        const xm = x > 0 ? heightField[i - 1] : heightField[i]
        const xp = x < width - 1 ? heightField[i + 1] : heightField[i]
        const ym = y > 0 ? heightField[i - width] : heightField[i]
        const yp = y < height - 1 ? heightField[i + width] : heightField[i]
        velocity[i] += (xm + xp + ym + yp - 4 * heightField[i]) * waveK * hdt
        velocity[i] -= heightField[i] * 0.65 * hdt
        const nx = (x / (width - 1)) * 2 - 1
        velocity[i] += (nx * ax + ny * ay) * hdt
        velocity[i] *= Math.exp(-damp * hdt)
      }
    }
    for (let i = 0; i < heightField.length; i++) {
      heightField[i] += velocity[i] * hdt
      if (heightField[i] > 1.1) heightField[i] = 1.1
      if (heightField[i] < -1.1) heightField[i] = -1.1
    }
  }
  sim.cooldown = Math.max(0, sim.cooldown - stepDt)
  if (beat > 0.45 && sim.prevBeat <= 0.45 && sim.cooldown <= 0) {
    const drops = 1 + Math.floor(Math.random() * (1 + Math.round(density * 3)))
    const radius = 1.8 + Math.max(0, Math.min(1, scale)) * 2.2
    for (let d = 0; d < drops; d++) {
      splashWater(
        sim,
        4 + Math.random() * (width - 8),
        4 + Math.random() * (height - 8),
        0.32 + Math.random() * 0.38,
        radius
      )
    }
    sim.cooldown = 0.12
  }
  sim.prevBeat = beat
  writeWaterTexture(sim)
}

export function createTextMaterial(text: string): THREE.MeshBasicMaterial {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const label = text.trim().length > 0 ? text : ' '
    const size = Math.max(48, Math.min(168, Math.floor(900 / Math.max(4, label.length))))
    ctx.font = `700 ${size}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#ffffff'
    ctx.fillText(label, canvas.width / 2, canvas.height / 2)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: '#ffffff',
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  })
  material.userData.disposeMap = true
  return material
}
