/**
 * Minimal shared mover-math checks (no jest harness in this repo yet).
 * Run: npx ts-node --transpile-only scripts/mover-math-selftest.ts
 */
import {
  estimateSpotFromBounds,
  interpolateBounds,
  moverBoundsLookCalibrated,
} from '../src/shared/moverBoundsMath'
import { initMoverBounds, initMoverCalibration } from '../src/shared/dmxFixtures'
import {
  applySequentialJointPhaseDmx,
  stepMoverJointMotion,
  resetMoverJointMotionState,
} from '../src/shared/moverKinematics'
import { orderMoverFixtures } from '../src/shared/moverOrdering'

function assert(cond: boolean, message: string) {
  if (!cond) throw new Error(message)
}

function nearly(a: number, b: number, eps = 1.5) {
  return Math.abs(a - b) <= eps
}

function testOrdering() {
  const ordered = orderMoverFixtures([
    { key: 'a', x: 0.2, y: 0.9 },
    { key: 'b', x: 0.8, y: 0.9 },
    { key: 'c', x: 0.5, y: 0.1 },
  ])
  assert(ordered.map((e) => e.key).join(',') === 'a,b,c', 'row-major order')
  const overridden = orderMoverFixtures([
    { key: 'a', x: 0.2, y: 0.9, sequenceOverride: 2 },
    { key: 'b', x: 0.8, y: 0.9, sequenceOverride: 0 },
    { key: 'c', x: 0.5, y: 0.1, sequenceOverride: 1 },
  ])
  assert(overridden.map((e) => e.key).join(',') === 'b,c,a', 'override ranks')
}

function testBoundsRoundTrip() {
  const bounds = initMoverBounds()
  bounds.topLeft = { pan: 10, tilt: 200 }
  bounds.topRight = { pan: 200, tilt: 200 }
  bounds.bottomLeft = { pan: 10, tilt: 40 }
  bounds.bottomRight = { pan: 200, tilt: 40 }
  assert(moverBoundsLookCalibrated(bounds), 'calibrated when corners differ')
  assert(!moverBoundsLookCalibrated(initMoverBounds()), 'defaults not calibrated')

  const mid = interpolateBounds(bounds, 0.5, 0.5)
  assert(nearly(mid.pan, 105), `mid pan got ${mid.pan}`)
  assert(nearly(mid.tilt, 120), `mid tilt got ${mid.tilt}`)

  const spot = estimateSpotFromBounds(bounds, mid.pan, mid.tilt)
  assert(nearly(spot.x, 0.5, 0.05), `spot x ${spot.x}`)
  assert(nearly(spot.y, 0.5, 0.05), `spot y ${spot.y}`)
}

function testPhaseIndependence() {
  const cal = initMoverCalibration()
  const base = { panDmx: 128, tiltDmx: 128 }
  const panOnly = applySequentialJointPhaseDmx({
    ...base,
    sequenceIndex: 1,
    fixtureCount: 2,
    phasePan01: 1,
    phaseTilt01: 0,
    calibration: cal,
    mountOrientation: 'upright',
  })
  assert(nearly(panOnly.tiltDmx, base.tiltDmx, 0.01), 'pan phase leaves tilt')
  assert(!nearly(panOnly.panDmx, base.panDmx, 0.01), 'pan phase moves pan')

  const tiltOnly = applySequentialJointPhaseDmx({
    ...base,
    sequenceIndex: 1,
    fixtureCount: 2,
    phasePan01: 0,
    phaseTilt01: 1,
    calibration: cal,
    mountOrientation: 'upright',
  })
  assert(nearly(tiltOnly.panDmx, base.panDmx, 0.01), 'tilt phase leaves pan')
  assert(!nearly(tiltOnly.tiltDmx, base.tiltDmx, 0.01), 'tilt phase moves tilt')
}

function testFineDisabledDuringTravel() {
  resetMoverJointMotionState()
  const cal = initMoverCalibration()
  // Seed motion at home, then jump far so travel is in progress.
  stepMoverJointMotion({
    motionKey: 'selftest',
    idealPanDmx: 32,
    idealTiltDmx: 32,
    dtMs: 16,
    panCalibration: cal.pan,
    tiltCalibration: cal.tilt,
    useFixedDt: true,
    nowMs: 1000,
  })
  const traveling = stepMoverJointMotion({
    motionKey: 'selftest',
    idealPanDmx: 220,
    idealTiltDmx: 220,
    dtMs: 16,
    panCalibration: cal.pan,
    tiltCalibration: cal.tilt,
    useFixedDt: true,
    nowMs: 1016,
  })
  assert(traveling.panFineEnabled !== true, 'fine disabled during travel (pan)')
  assert(traveling.tiltFineEnabled !== true, 'fine disabled during travel (tilt)')
}

function main() {
  testOrdering()
  testBoundsRoundTrip()
  testPhaseIndependence()
  testFineDisabledDuringTravel()
  // eslint-disable-next-line no-console
  console.log('mover-math-selftest: ok')
}

main()
