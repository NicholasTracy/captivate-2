import { clampNormalized } from '../math/util'
import {
  DMX_MAX_VALUE,
  DMX_MIN_VALUE,
  initMoverCalibration,
  type FixtureRotation,
  type FlattenedFixture,
  type MoverCalibration,
  type MoverMountOrientation,
} from './dmxFixtures'
import {
  interpolateBounds,
  moverBoundsLookCalibrated,
} from './moverBoundsMath'
import { mapNormalizedToAxisPhysicalDmx } from './dmxUtil'
import type { StageDimensions } from './stage'
import type { MoverAxisOverrides } from './dmxUtil'
import { MOVER_PHASE_MAX_DEG } from './params'

/** Average-mover estimates (tuned constants; not per-fixture UI yet). */
export const MOVER_KIN_MAX_PAN_DEG_PER_SEC = 210
export const MOVER_KIN_MAX_TILT_DEG_PER_SEC = 150
export const MOVER_KIN_MAX_PAN_ACCEL_DEG_PER_SEC2 = 1000
export const MOVER_KIN_MAX_TILT_ACCEL_DEG_PER_SEC2 = 800

const MOTION_MAX_DT_SEC = 0.12
const MOTION_MIN_DT_SEC = 1 / 240
const MOTION_STATE_STALE_MS = 15000
const TARGET_DEADBAND_DMX = 0.05
const SETTLE_DISTANCE_DMX = 0.08
const SETTLE_VELOCITY_DMX_PER_SEC = 0.9
const MICRO_MOVE_DISTANCE_DMX = 0.95
const MICRO_MOVE_VELOCITY_DMX_PER_SEC = 1.2

type JointMotionState = {
  panDmx: number
  tiltDmx: number
  panTargetDmx: number
  tiltTargetDmx: number
  panVelocityDmxPerSec: number
  tiltVelocityDmxPerSec: number
  lastSeenMs: number
}

const _jointMotionByKey = new Map<string, JointMotionState>()
let _lastMotionCleanupMs = 0

export type Vec3 = { x: number; y: number; z: number }

function clampDmxFloat(value: number, fallback = 128): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(DMX_MAX_VALUE, Math.max(DMX_MIN_VALUE, value))
}

function clampDmxInt(value: number, fallback = 128): number {
  return Math.round(clampDmxFloat(value, fallback))
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180
}

function clampRangeDeg(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(1440, Math.max(45, value))
}

function dmxSpan(calibration?: { min: number; max: number }): number {
  if (calibration === undefined) return DMX_MAX_VALUE
  const min = clampDmxInt(calibration.min, DMX_MIN_VALUE)
  const max = clampDmxInt(calibration.max, DMX_MAX_VALUE)
  return Math.max(1, Math.abs(max - min))
}

export function dmxPerDegree(
  calibration: { min: number; max: number; rangeDeg: number } | undefined,
  defaultRangeDeg: number
): number {
  const span = dmxSpan(calibration)
  const rangeDeg = clampRangeDeg(Number(calibration?.rangeDeg), defaultRangeDeg)
  return span / rangeDeg
}

export function degLimitsToDmxPerSec(
  degPerSec: number,
  calibration: { min: number; max: number; rangeDeg: number } | undefined,
  defaultRangeDeg: number
): number {
  return Math.max(1, degPerSec * dmxPerDegree(calibration, defaultRangeDeg))
}

export function degAccelToDmxPerSec2(
  degPerSec2: number,
  calibration: { min: number; max: number; rangeDeg: number } | undefined,
  defaultRangeDeg: number
): number {
  return Math.max(1, degPerSec2 * dmxPerDegree(calibration, defaultRangeDeg))
}

/** Body Euler (yaw Y, then pitch X, then roll Z) applied to a local vector → world. */
export function rotateLocalToWorld(
  v: Vec3,
  rotation: FixtureRotation | undefined
): Vec3 {
  const rx = degToRad(Number(rotation?.x) || 0)
  const ry = degToRad(Number(rotation?.y) || 0)
  const rz = degToRad(Number(rotation?.z) || 0)

  let x = v.x
  let y = v.y
  let z = v.z

  // yaw (Y)
  {
    const c = Math.cos(ry)
    const s = Math.sin(ry)
    const nx = x * c + z * s
    const nz = -x * s + z * c
    x = nx
    z = nz
  }
  // pitch (X)
  {
    const c = Math.cos(rx)
    const s = Math.sin(rx)
    const ny = y * c - z * s
    const nz = y * s + z * c
    y = ny
    z = nz
  }
  // roll (Z)
  {
    const c = Math.cos(rz)
    const s = Math.sin(rz)
    const nx = x * c - y * s
    const ny = x * s + y * c
    x = nx
    y = ny
  }

  return { x, y, z }
}

/** Inverse of {@link rotateLocalToWorld}: world aim direction → body-local. */
export function invertRotateVecByEulerDeg(
  v: Vec3,
  rotation: FixtureRotation | undefined
): Vec3 {
  const inv: FixtureRotation = {
    x: -(Number(rotation?.x) || 0),
    y: -(Number(rotation?.y) || 0),
    z: -(Number(rotation?.z) || 0),
  }
  // Apply reverse order: -Z, -X, -Y
  let x = v.x
  let y = v.y
  let z = v.z
  const rz = degToRad(inv.z)
  {
    const c = Math.cos(rz)
    const s = Math.sin(rz)
    const nx = x * c - y * s
    const ny = x * s + y * c
    x = nx
    y = ny
  }
  const rx = degToRad(inv.x)
  {
    const c = Math.cos(rx)
    const s = Math.sin(rx)
    const ny = y * c - z * s
    const nz = y * s + z * c
    y = ny
    z = nz
  }
  const ry = degToRad(inv.y)
  {
    const c = Math.cos(ry)
    const s = Math.sin(ry)
    const nx = x * c + z * s
    const nz = -x * s + z * c
    x = nx
    z = nz
  }
  return { x, y, z }
}

/** Local unit beam from yaw (about Y) + pitch (elevation). Matches solve atan2/asin. */
export function localDirectionFromYawPitch(
  yawDeg: number,
  pitchDeg: number
): Vec3 {
  const yaw = degToRad(yawDeg)
  const pitch = degToRad(pitchDeg)
  const cosPitch = Math.cos(pitch)
  return normalizeVec({
    x: Math.sin(yaw) * cosPitch,
    y: Math.sin(pitch),
    z: Math.cos(yaw) * cosPitch,
  })
}

/**
 * Approximate inverse of {@link mapPanYawDegToDmx} via binary search.
 */
export function mapPanDmxToYawDeg(
  panDmx: number,
  calibration: MoverCalibration['pan'] | undefined
): number {
  const cal = calibration ?? initMoverCalibration().pan
  const rangeDeg = clampRangeDeg(cal.rangeDeg, 540)
  let lo = -rangeDeg * 0.55
  let hi = rangeDeg * 0.55
  let best = 0
  let bestErr = Number.POSITIVE_INFINITY
  // Dense scan + refine (map is not guaranteed strictly mono when clamped)
  for (let i = 0; i <= 128; i++) {
    const yaw = lo + ((hi - lo) * i) / 128
    const mapped = mapPanYawDegToDmx(yaw, cal)
    const err = Math.abs(mapped - panDmx)
    if (err < bestErr) {
      bestErr = err
      best = yaw
    }
  }
  for (let i = 0; i < 24; i++) {
    const step = (hi - lo) / 256
    let improved = best
    for (const candidate of [best - step, best, best + step]) {
      const mapped = mapPanYawDegToDmx(candidate, cal)
      const err = Math.abs(mapped - panDmx)
      if (err < bestErr) {
        bestErr = err
        improved = candidate
      }
    }
    best = improved
  }
  return best
}

/** Approximate inverse of {@link mapTiltPitchDegToDmx} via search. */
export function mapTiltDmxToPitchDeg(
  tiltDmx: number,
  mountInverted: boolean,
  calibration: MoverCalibration['tilt'] | undefined
): number {
  const cal = calibration ?? initMoverCalibration().tilt
  const rangeDeg = clampRangeDeg(cal.rangeDeg, 270)
  let lo = -rangeDeg * 0.55
  let hi = rangeDeg * 0.55
  let best = 0
  let bestErr = Number.POSITIVE_INFINITY
  for (let i = 0; i <= 128; i++) {
    const pitch = lo + ((hi - lo) * i) / 128
    const mapped = mapTiltPitchDegToDmx(pitch, mountInverted, cal)
    const err = Math.abs(mapped - tiltDmx)
    if (err < bestErr) {
      bestErr = err
      best = pitch
    }
  }
  for (let i = 0; i < 24; i++) {
    const step = (hi - lo) / 256
    let improved = best
    for (const candidate of [best - step, best, best + step]) {
      const mapped = mapTiltPitchDegToDmx(candidate, mountInverted, cal)
      const err = Math.abs(mapped - tiltDmx)
      if (err < bestErr) {
        bestErr = err
        improved = candidate
      }
    }
    best = improved
  }
  return best
}

/**
 * Reconstruct world-space beam direction from commanded pan/tilt DMX
 * using the same angle↔DMX convention as solvePoseIkToDmx.
 */
export function beamDirectionFromPanTiltDmx(options: {
  panDmx: number
  tiltDmx: number
  rotation?: FixtureRotation
  mountOrientation?: MoverMountOrientation
  calibration?: MoverCalibration
}): Vec3 {
  const cal = options.calibration ?? initMoverCalibration()
  const mountInverted = options.mountOrientation === 'inverted'
  const yawDeg = mapPanDmxToYawDeg(options.panDmx, cal.pan)
  const pitchDeg = mapTiltDmxToPitchDeg(
    options.tiltDmx,
    mountInverted,
    cal.tilt
  )
  return beamDirectionFromYawPitch({
    yawDeg,
    pitchDeg,
    rotation: options.rotation,
    mountOrientation: options.mountOrientation,
  })
}

/** Forward beam from joint angles used by solvePoseIk (preferred for validation). */
export function beamDirectionFromYawPitch(options: {
  yawDeg: number
  pitchDeg: number
  rotation?: FixtureRotation
  mountOrientation?: MoverMountOrientation
}): Vec3 {
  let local = localDirectionFromYawPitch(options.yawDeg, options.pitchDeg)
  if (options.mountOrientation === 'inverted') {
    // Reverse of hang Rx(180): {x, -y, -z}
    local = { x: local.x, y: -local.y, z: -local.z }
  }
  return normalizeVec(rotateLocalToWorld(local, options.rotation))
}

/** Ray from fixture origin along beam; intersect stage floor y=0 if possible. */
export function projectBeamToFloor(
  origin: Vec3,
  direction: Vec3
): Vec3 | null {
  const dir = normalizeVec(direction)
  if (Math.abs(dir.y) < 1e-8) {
    return null
  }
  // origin.y + t * dir.y = 0
  const t = -origin.y / dir.y
  if (t <= 0) {
    return null
  }
  return {
    x: origin.x + dir.x * t,
    y: 0,
    z: origin.z + dir.z * t,
  }
}

export function worldToFloorUv(
  point: Vec3,
  stage: StageDimensions
): { u: number; v: number } {
  const width = Math.max(2, Number(stage.widthFt) || 24)
  const depth = Math.max(2, Number(stage.depthFt) || 18)
  const u = clampNormalized(point.x / width + 0.5)
  // z = (0.5 - v) * depth  →  v = 0.5 - z/depth
  const v = clampNormalized(0.5 - point.z / depth)
  return { u, v }
}

function normalizeVec(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z)
  if (len < 1e-9) return { x: 0, y: 0, z: 1 }
  return { x: v.x / len, y: v.y / len, z: v.z / len }
}

/**
 * Stage layout UV → world feet.
 * x: left→right across widthFt
 * z: back→front across depthFt (pad bottom = audience / high depth local)
 * y: up
 */
export function floorUvToWorld(
  u: number,
  v: number,
  stage: StageDimensions
): Vec3 {
  const width = Math.max(2, Number(stage.widthFt) || 24)
  const depth = Math.max(2, Number(stage.depthFt) || 18)
  const safeU = clampNormalized(u)
  const safeV = clampNormalized(v)
  return {
    x: (safeU - 0.5) * width,
    y: 0,
    z: (0.5 - safeV) * depth,
  }
}

export function fixtureWorldPosition(
  fixture: Pick<FlattenedFixture, 'window'>,
  stage: StageDimensions
): Vec3 {
  const width = Math.max(2, Number(stage.widthFt) || 24)
  const height = Math.max(2, Number(stage.heightFt) || 12)
  const depth = Math.max(2, Number(stage.depthFt) || 18)
  const u = clampNormalized(fixture.window?.x?.pos ?? 0.5)
  const v = clampNormalized(fixture.window?.y?.pos ?? 0.5)
  const elev = clampNormalized(fixture.window?.z?.pos ?? 0.85)
  return {
    x: (u - 0.5) * width,
    y: elev * height,
    z: (0.5 - v) * depth,
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function orientDmx(
  value: number,
  min: number,
  max: number,
  invert: boolean
): number {
  if (!invert) return value
  return min + max - value
}

function unorientDmx(
  value: number,
  min: number,
  max: number,
  invert: boolean
): number {
  if (!invert) return value
  return min + max - value
}

/** Map pan yaw degrees relative to front into physical DMX. */
export function mapPanYawDegToDmx(
  yawDeg: number,
  calibration: MoverCalibration['pan'] | undefined
): number {
  const cal = calibration ?? initMoverCalibration().pan
  const min = clampDmxFloat(cal.min, 0)
  const max = clampDmxFloat(cal.max, 255)
  const span = Math.max(1, Math.abs(max - min))
  const rangeDeg = clampRangeDeg(cal.rangeDeg, 540)

  const orientedMin = orientDmx(min, min, max, cal.invert)
  const orientedMax = orientDmx(max, min, max, cal.invert)
  const orientedFront = orientDmx(
    clampDmxFloat(cal.front, min),
    min,
    max,
    cal.invert
  )
  const orientedBack = orientDmx(
    clampDmxFloat(cal.back, min),
    min,
    max,
    cal.invert
  )
  const direction =
    Math.abs(orientedBack - orientedFront) > 0.0001
      ? Math.sign(orientedBack - orientedFront)
      : Math.sign(orientedMax - orientedMin) || 1

  const yawRatio = yawDeg / Math.max(0.0001, rangeDeg)
  const oriented = orientedFront + direction * yawRatio * span
  const clamped = Math.min(
    Math.max(oriented, Math.min(orientedMin, orientedMax)),
    Math.max(orientedMin, orientedMax)
  )
  return clampDmxFloat(unorientDmx(clamped, min, max, cal.invert), min)
}

/**
 * Map body-local elevation (degrees, +up) to tilt DMX.
 * pitch=0 → forward anchor; +half-range → up; −half-range → down.
 * Mount hang is already applied in solvePoseIk (local vector flip); do not reapply here.
 */
export function mapTiltPitchDegToDmx(
  pitchDeg: number,
  _mountInverted: boolean,
  calibration: MoverCalibration['tilt'] | undefined
): number {
  const cal = calibration ?? initMoverCalibration().tilt
  const min = clampDmxFloat(cal.min, 0)
  const max = clampDmxFloat(cal.max, 255)
  const rangeDeg = clampRangeDeg(cal.rangeDeg, 270)

  const orientedMin = orientDmx(min, min, max, cal.invert)
  const orientedMax = orientDmx(max, min, max, cal.invert)
  const low = Math.min(orientedMin, orientedMax)
  const high = Math.max(orientedMin, orientedMax)
  const forward = clampNormalizedRange(
    orientDmx(clampDmxFloat(cal.forward, min), min, max, cal.invert),
    low,
    high
  )
  const up = clampNormalizedRange(
    orientDmx(clampDmxFloat(cal.up, min), min, max, cal.invert),
    low,
    high
  )
  const down = clampNormalizedRange(
    orientDmx(clampDmxFloat(cal.down, min), min, max, cal.invert),
    low,
    high
  )

  // signed in [-1, 1] over ±rangeDeg/2
  const half = Math.max(1e-6, rangeDeg * 0.5)
  const signed = Math.max(-1, Math.min(1, pitchDeg / half))

  let oriented: number
  if (signed >= 0) {
    oriented = lerp(forward, up, signed)
  } else {
    oriented = lerp(forward, down, -signed)
  }
  oriented = clampNormalizedRange(oriented, low, high)
  return clampDmxFloat(unorientDmx(oriented, min, max, cal.invert), min)
}

function clampNormalizedRange(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

export function solvePoseIkToDmx(options: {
  fixtureOrigin: Vec3
  target: Vec3
  rotation?: FixtureRotation
  mountOrientation?: MoverMountOrientation
  calibration?: MoverCalibration
}): { panDmx: number; tiltDmx: number; yawDeg: number; pitchDeg: number } {
  const dirWorld = normalizeVec({
    x: options.target.x - options.fixtureOrigin.x,
    y: options.target.y - options.fixtureOrigin.y,
    z: options.target.z - options.fixtureOrigin.z,
  })

  let local = invertRotateVecByEulerDeg(dirWorld, options.rotation)
  const mountInverted = options.mountOrientation === 'inverted'
  if (mountInverted) {
    // Hang: body pitched 180° about local X (beam still starts from yoke forward).
    local = { x: local.x, y: -local.y, z: -local.z }
  }

  local = normalizeVec(local)
  // Near pure up/down, pan is undefined; freeze at front (0°) so tiny X/Z noise
  // does not slam the pan channel when a pure tilt aim passes under the head.
  const horiz = Math.hypot(local.x, local.z)
  const yawDeg =
    horiz < 1e-5 ? 0 : (Math.atan2(local.x, local.z) * 180) / Math.PI
  const pitchDeg = (Math.asin(Math.min(1, Math.max(-1, local.y))) * 180) / Math.PI

  const cal = options.calibration ?? initMoverCalibration()
  return {
    panDmx: mapPanYawDegToDmx(yawDeg, cal.pan),
    tiltDmx: mapTiltPitchDegToDmx(pitchDeg, mountInverted, cal.tilt),
    yawDeg,
    pitchDeg,
  }
}

/**
 * Sequential stagger in joint degrees (after IK / bounds), not pad UV.
 * Fixture 0 gets 0; last fixture gets up to MOVER_PHASE_MAX_DEG per axis.
 */
export function applySequentialJointPhaseDmx(options: {
  panDmx: number
  tiltDmx: number
  sequenceIndex: number
  fixtureCount: number
  phasePan01: number
  phaseTilt01: number
  calibration?: MoverCalibration
  mountOrientation?: MoverMountOrientation
}): { panDmx: number; tiltDmx: number } {
  const n = Math.max(1, Math.floor(options.fixtureCount))
  const phasePan01 = clampNormalized(options.phasePan01)
  const phaseTilt01 = clampNormalized(options.phaseTilt01)
  if (n <= 1 || (phasePan01 <= 0 && phaseTilt01 <= 0)) {
    return {
      panDmx: clampDmxFloat(options.panDmx),
      tiltDmx: clampDmxFloat(options.tiltDmx),
    }
  }

  const denom = Math.max(1, n - 1)
  const t = Math.max(0, Math.min(1, options.sequenceIndex / denom))
  const panOffsetDeg = phasePan01 * MOVER_PHASE_MAX_DEG * t
  const tiltOffsetDeg = phaseTilt01 * MOVER_PHASE_MAX_DEG * t
  if (Math.abs(panOffsetDeg) < 1e-9 && Math.abs(tiltOffsetDeg) < 1e-9) {
    return {
      panDmx: clampDmxFloat(options.panDmx),
      tiltDmx: clampDmxFloat(options.tiltDmx),
    }
  }

  const cal = options.calibration ?? initMoverCalibration()
  const mountInverted = options.mountOrientation === 'inverted'
  const yawDeg =
    mapPanDmxToYawDeg(options.panDmx, cal.pan) + panOffsetDeg
  const pitchDeg =
    mapTiltDmxToPitchDeg(options.tiltDmx, mountInverted, cal.tilt) +
    tiltOffsetDeg

  return {
    panDmx: mapPanYawDegToDmx(yawDeg, cal.pan),
    tiltDmx: mapTiltPitchDegToDmx(pitchDeg, mountInverted, cal.tilt),
  }
}

export function solveMoverAimIdealDmx(options: {
  fixture: FlattenedFixture
  padX: number
  padY: number
  stage: StageDimensions
}): {
  panDmx: number
  tiltDmx: number
  usedBounds: boolean
  yawDeg?: number
  pitchDeg?: number
} {
  const padX = clampNormalized(options.padX)
  const padY = clampNormalized(options.padY)
  const fixture = options.fixture
  const cal = fixture.moverCalibration ?? initMoverCalibration()
  const bounds = fixture.moverBounds

  if (moverBoundsLookCalibrated(bounds) && bounds !== undefined) {
    const sample = interpolateBounds(bounds, padX, padY)
    return {
      panDmx: clampDmxFloat(sample.pan, cal.pan.home),
      tiltDmx: clampDmxFloat(sample.tilt, cal.tilt.home),
      usedBounds: true,
    }
  }

  const origin = fixtureWorldPosition(fixture, options.stage)
  const target = floorUvToWorld(padX, padY, options.stage)
  const solved = solvePoseIkToDmx({
    fixtureOrigin: origin,
    target,
    rotation: fixture.rotation,
    mountOrientation: fixture.moverMountOrientation,
    calibration: cal,
  })

  return {
    panDmx: solved.panDmx,
    tiltDmx: solved.tiltDmx,
    usedBounds: false,
    yawDeg: solved.yawDeg,
    pitchDeg: solved.pitchDeg,
  }
}

function cleanupMotionState(nowMs: number) {
  if (nowMs - _lastMotionCleanupMs < 1000) return
  _lastMotionCleanupMs = nowMs
  for (const [key, state] of _jointMotionByKey.entries()) {
    if (nowMs - state.lastSeenMs > MOTION_STATE_STALE_MS) {
      _jointMotionByKey.delete(key)
    }
  }
}

export function stepJointAxis(
  currentValue: number,
  currentVelocity: number,
  targetValue: number,
  dtSec: number,
  maxVelocity: number,
  maxAcceleration: number,
  minValue: number,
  maxValue: number
): { value: number; velocity: number } {
  const clampedTarget = Math.min(maxValue, Math.max(minValue, targetValue))

  if (!Number.isFinite(currentValue) || !Number.isFinite(currentVelocity)) {
    return { value: clampedTarget, velocity: 0 }
  }
  if (!Number.isFinite(dtSec) || dtSec <= 0.000001) {
    return {
      value: Math.min(maxValue, Math.max(minValue, currentValue)),
      velocity: currentVelocity,
    }
  }

  const distance = clampedTarget - currentValue
  if (Math.abs(distance) <= 0.0001) {
    return { value: clampedTarget, velocity: 0 }
  }

  const safeDt = Math.max(MOTION_MIN_DT_SEC, dtSec)
  const desiredVelocity = Math.min(
    maxVelocity,
    Math.max(-maxVelocity, distance / safeDt)
  )
  const velocityDeltaLimit = maxAcceleration * safeDt
  const nextVelocity = Math.min(
    currentVelocity + velocityDeltaLimit,
    Math.max(currentVelocity - velocityDeltaLimit, desiredVelocity)
  )

  let nextValue = currentValue + nextVelocity * safeDt
  if (
    (distance > 0 && nextValue > clampedTarget) ||
    (distance < 0 && nextValue < clampedTarget)
  ) {
    return { value: clampedTarget, velocity: 0 }
  }

  nextValue = Math.min(maxValue, Math.max(minValue, nextValue))
  if (nextValue <= minValue + 0.0001 || nextValue >= maxValue - 0.0001) {
    return { value: nextValue, velocity: 0 }
  }

  return { value: nextValue, velocity: nextVelocity }
}

export function resolveMotionDtSeconds(dtMs: number): number {
  if (!Number.isFinite(dtMs) || dtMs <= 0) {
    return 1 / 90
  }
  return Math.min(MOTION_MAX_DT_SEC, Math.max(MOTION_MIN_DT_SEC, dtMs / 1000))
}

/**
 * Step commanded joints toward ideal DMX with average-mover vel/accel.
 * Fine: mid-park during travel; micro residual only when near target and slow.
 */
export function stepMoverJointMotion(options: {
  motionKey: string
  idealPanDmx: number
  idealTiltDmx: number
  dtMs: number
  panCalibration?: MoverCalibration['pan']
  tiltCalibration?: MoverCalibration['tilt']
  /** Override wall clock (tests). */
  nowMs?: number
  /** Use dtMs only; ignore wall-clock gaps between ticks (tests / offline sim). */
  useFixedDt?: boolean
}): MoverAxisOverrides {
  const nowMs = Number.isFinite(options.nowMs) ? Number(options.nowMs) : Date.now()
  cleanupMotionState(nowMs)

  const panIdeal = clampDmxFloat(options.idealPanDmx)
  const tiltIdeal = clampDmxFloat(options.idealTiltDmx)

  if (!options.motionKey) {
    return {
      panDmx: Math.round(panIdeal),
      tiltDmx: Math.round(tiltIdeal),
      panFineEnabled: false,
      tiltFineEnabled: false,
    }
  }

  const existing = _jointMotionByKey.get(options.motionKey)
  const frameDt = resolveMotionDtSeconds(options.dtMs)
  const elapsedSec =
    options.useFixedDt === true || existing === undefined
      ? frameDt
      : Math.min(
          MOTION_MAX_DT_SEC,
          Math.max(0, (nowMs - existing.lastSeenMs) / 1000)
        )
  const dtSec = elapsedSec > 0 ? elapsedSec : frameDt

  const current = existing ?? {
    panDmx: panIdeal,
    tiltDmx: tiltIdeal,
    panTargetDmx: panIdeal,
    tiltTargetDmx: tiltIdeal,
    panVelocityDmxPerSec: 0,
    tiltVelocityDmxPerSec: 0,
    lastSeenMs: nowMs,
  }

  const stablePanTarget =
    Math.abs(panIdeal - current.panTargetDmx) <= TARGET_DEADBAND_DMX
      ? current.panTargetDmx
      : panIdeal
  const stableTiltTarget =
    Math.abs(tiltIdeal - current.tiltTargetDmx) <= TARGET_DEADBAND_DMX
      ? current.tiltTargetDmx
      : tiltIdeal

  const maxPanVel = degLimitsToDmxPerSec(
    MOVER_KIN_MAX_PAN_DEG_PER_SEC,
    options.panCalibration,
    540
  )
  const maxTiltVel = degLimitsToDmxPerSec(
    MOVER_KIN_MAX_TILT_DEG_PER_SEC,
    options.tiltCalibration,
    270
  )
  const maxPanAccel = degAccelToDmxPerSec2(
    MOVER_KIN_MAX_PAN_ACCEL_DEG_PER_SEC2,
    options.panCalibration,
    540
  )
  const maxTiltAccel = degAccelToDmxPerSec2(
    MOVER_KIN_MAX_TILT_ACCEL_DEG_PER_SEC2,
    options.tiltCalibration,
    270
  )

  const nextPan = stepJointAxis(
    current.panDmx,
    current.panVelocityDmxPerSec,
    stablePanTarget,
    dtSec,
    maxPanVel,
    maxPanAccel,
    DMX_MIN_VALUE,
    DMX_MAX_VALUE
  )
  const nextTilt = stepJointAxis(
    current.tiltDmx,
    current.tiltVelocityDmxPerSec,
    stableTiltTarget,
    dtSec,
    maxTiltVel,
    maxTiltAccel,
    DMX_MIN_VALUE,
    DMX_MAX_VALUE
  )

  const settledPan =
    Math.abs(nextPan.value - stablePanTarget) <= SETTLE_DISTANCE_DMX &&
    Math.abs(nextPan.velocity) <= SETTLE_VELOCITY_DMX_PER_SEC
      ? { value: stablePanTarget, velocity: 0 }
      : nextPan
  const settledTilt =
    Math.abs(nextTilt.value - stableTiltTarget) <= SETTLE_DISTANCE_DMX &&
    Math.abs(nextTilt.velocity) <= SETTLE_VELOCITY_DMX_PER_SEC
      ? { value: stableTiltTarget, velocity: 0 }
      : nextTilt

  const panDistance = Math.abs(settledPan.value - stablePanTarget)
  const tiltDistance = Math.abs(settledTilt.value - stableTiltTarget)
  const panSpeed = Math.abs(settledPan.velocity)
  const tiltSpeed = Math.abs(settledTilt.velocity)

  const panFineEnabled =
    panDistance <= MICRO_MOVE_DISTANCE_DMX &&
    panSpeed <= MICRO_MOVE_VELOCITY_DMX_PER_SEC
  const tiltFineEnabled =
    tiltDistance <= MICRO_MOVE_DISTANCE_DMX &&
    tiltSpeed <= MICRO_MOVE_VELOCITY_DMX_PER_SEC

  const panOut = panFineEnabled
    ? Math.round(settledPan.value * 64) / 64
    : Math.round(settledPan.value)
  const tiltOut = tiltFineEnabled
    ? Math.round(settledTilt.value * 64) / 64
    : Math.round(settledTilt.value)

  _jointMotionByKey.set(options.motionKey, {
    panDmx: settledPan.value,
    tiltDmx: settledTilt.value,
    panTargetDmx: stablePanTarget,
    tiltTargetDmx: stableTiltTarget,
    panVelocityDmxPerSec: settledPan.velocity,
    tiltVelocityDmxPerSec: settledTilt.velocity,
    lastSeenMs: nowMs,
  })

  return {
    panDmx: panOut,
    tiltDmx: tiltOut,
    panFineEnabled,
    tiltFineEnabled,
  }
}

/** Instant map without motion (raw/mirror-only path). Fine mid unless micro residual. */
export function emitRawAxisOverrides(
  panDmx: number,
  tiltDmx: number
): MoverAxisOverrides {
  const pan = clampDmxFloat(panDmx)
  const tilt = clampDmxFloat(tiltDmx)
  const panCoarse = Math.round(pan)
  const tiltCoarse = Math.round(tilt)
  const panFineEnabled = Math.abs(pan - panCoarse) > 0.02
  const tiltFineEnabled = Math.abs(tilt - tiltCoarse) > 0.02
  return {
    panDmx: panFineEnabled ? Math.round(pan * 64) / 64 : panCoarse,
    tiltDmx: tiltFineEnabled ? Math.round(tilt * 64) / 64 : tiltCoarse,
    panFineEnabled,
    tiltFineEnabled,
  }
}

export function mapRawPadToIdealDmx(
  fixture: FlattenedFixture,
  padX: number,
  padY: number
): { panDmx: number; tiltDmx: number } {
  return {
    panDmx: mapNormalizedToAxisPhysicalDmx(
      clampNormalized(padX),
      fixture.moverCalibration?.pan
    ),
    tiltDmx: mapNormalizedToAxisPhysicalDmx(
      clampNormalized(padY),
      fixture.moverCalibration?.tilt
    ),
  }
}

/** Clear kinematics motion state (tests / project reload). */
export function resetMoverJointMotionState(): void {
  _jointMotionByKey.clear()
}
