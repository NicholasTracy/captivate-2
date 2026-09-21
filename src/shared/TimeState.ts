export interface TimeState {
  bpm: number
  beats: number
  phase: number
  numPeers: number
  isEnabled: boolean
  isPlaying: boolean
  isStartStopSyncEnabled: boolean
  quantum: number
  dt: number
}

export function initTimeState(): TimeState {
  return {
    bpm: 90.0, // (from LINK)
    beats: 0.0, // running total of beats (from LINK)
    phase: 0.0, // from 0.0 to quantum (from LINK)
    numPeers: 0,
    isEnabled: false,
    isPlaying: false,
    isStartStopSyncEnabled: false,
    quantum: 4.0,
    dt: 0.0,
  }
}

export type Beats = number

export function isNewPeriod(
  beatsLast: Beats,
  beatsNow: Beats,
  period: Beats
) {
  if (!Number.isFinite(period) || period <= 0) {
    return false
  }
  if (!Number.isFinite(beatsNow) || !Number.isFinite(beatsLast)) {
    return false
  }
  if (!(beatsNow - beatsLast > 0)) {
    return false
  }
  // Floor division (not `%`) so a negative phase-shifted clock still
  // crosses period boundaries once, in the right direction.
  return Math.floor(beatsNow / period) !== Math.floor(beatsLast / period)
}

/**
 * Shift a beat clock by a split phase offset. Same sign as LFO
 * `effectiveBeats` (`beats + phaseOffsetBeats`).
 */
export function beatsWithPhaseOffset(
  beats: Beats,
  phaseOffsetBeats: number | undefined
): Beats {
  if (!Number.isFinite(beats)) {
    return beats
  }
  if (
    phaseOffsetBeats === undefined ||
    !Number.isFinite(phaseOffsetBeats) ||
    phaseOffsetBeats === 0
  ) {
    return beats
  }
  return beats + phaseOffsetBeats
}

export function beatsIn(
  beatsNow: Beats,
  period: Beats
) {
  return beatsNow % period
}

export function beatsLeft(
  beatsNow: Beats,
  period: Beats,
) {
  return period - beatsIn(beatsNow, period)
}

export class PeriodTracker {
  private beatsLast: Beats
  constructor() {
    this.beatsLast = Date.now()
  }
  isNewPeriod(beats: Beats, targetPeriod: Beats) {
    const previous = this.beatsLast
    this.beatsLast = beats
    return isNewPeriod(previous, beats, targetPeriod)
  }
}
