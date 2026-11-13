/**
 * Pioneer Pro DJ Link packet views used by the Connections list and tempo follow.
 *
 * Layouts follow beat-link / prolink-connect:
 * - UDP 50000 announcements are 0x36 bytes. Name at 0x0c (20), device number at 0x24, type at 0x25.
 * - UDP 50001 beat packets are type 0x28, length 0x60, only while a player is playing.
 *   Pitch is 3 bytes at 0x55 (0x100000 = 0%), track BPM*100 is uint16 at 0x5a, beat-in-bar at 0x5c.
 * - UDP 50002 status: play state at 0x7b, flags at 0x89, track BPM at 0x92, effective pitch at 0x99.
 * CDJ-3000 absolute-position packets (type 0x0b) are not beats and must not mark a deck playing.
 */

export const PRO_DJ_LINK_MAGIC = 'Qspt1WmJOL'
export const PRO_DJ_LINK_ANNOUNCE_PORT = 50000
export const PRO_DJ_LINK_BEAT_PORT = 50001
export const PRO_DJ_LINK_STATUS_PORT = 50002
export const PRO_DJ_LINK_DEVICE_NAME = 'Captivate'
export const PRO_DJ_LINK_VIRTUAL_ID = 7

export type ProDjDeviceKind = 'player' | 'mixer' | 'rekordbox' | 'other'

export type ProDjFollowMode = 'off' | 'idle' | 'following' | 'coasting'

export interface ProDjLinkDeviceView {
  id: number
  name: string
  ip: string
  kind: ProDjDeviceKind
  playLabel: string
  playing: boolean
  isMaster: boolean
  isSync: boolean
  isOnAir: boolean
  trackBpm: number | null
  effectiveBpm: number | null
  pitchPercent: number | null
  beatInBar: number | null
}

export interface ProDjLinkStatus {
  enabled: boolean
  listening: boolean
  error: string | null
  mode: ProDjFollowMode
  followDeviceId: number | null
  followName: string | null
  bpm: number | null
  devices: ProDjLinkDeviceView[]
}

export interface ProDjFollowCandidate {
  id: number
  name: string
  kind: ProDjDeviceKind
  playing: boolean
  isMaster: boolean
  lastBeatMs: number
  effectiveBpm: number | null
  beatInBar: number | null
}

export interface ProDjFollowChoice {
  mode: 'idle' | 'following' | 'coasting'
  deviceId: number | null
  bpm: number | null
  beatInBar: number | null
}

export function initProDjLinkStatus(): ProDjLinkStatus {
  return {
    enabled: false,
    listening: false,
    error: null,
    mode: 'off',
    followDeviceId: null,
    followName: null,
    bpm: null,
    devices: [],
  }
}

export function proDjKindFromType(
  typeByte: number,
  deviceId: number
): ProDjDeviceKind {
  if (typeByte === 0x03 || deviceId >= 33) return 'mixer'
  if (typeByte === 0x04) return 'rekordbox'
  if (typeByte === 0x01 || (deviceId >= 1 && deviceId <= 6)) return 'player'
  return 'other'
}

export function proDjPlayLabel(
  playState: number | null,
  playing: boolean
): string {
  if (playState === null) return playing ? 'Playing' : 'Idle'
  switch (playState) {
    case 0x00:
      return 'Empty'
    case 0x02:
      return 'Loading'
    case 0x03:
      return 'Playing'
    case 0x04:
      return 'Looping'
    case 0x05:
      return 'Paused'
    case 0x06:
      return 'Cued'
    case 0x07:
      return 'Cuing'
    case 0x08:
      return 'Platter held'
    case 0x09:
      return 'Searching'
    case 0x0e:
      return 'Spun down'
    case 0x11:
      return 'Ended'
    default:
      return playing ? 'Playing' : 'Idle'
  }
}

/** 3-byte big-endian pitch. 0x100000 is 0% / 1.0x, 0 is stopped, 0x200000 is +100%. */
export function proDjPitchMultiplier(
  b0: number,
  b1: number,
  b2: number
): number {
  const value = ((b0 & 0xff) << 16) | ((b1 & 0xff) << 8) | (b2 & 0xff)
  return value / 0x100000
}

export function proDjPitchPercent(multiplier: number): number {
  return (multiplier - 1) * 100
}

export function proDjEffectiveBpm(
  trackBpm: number,
  multiplier: number
): number | null {
  if (!Number.isFinite(trackBpm) || trackBpm <= 0) return null
  if (!Number.isFinite(multiplier) || multiplier <= 0) return null
  const bpm = trackBpm * multiplier
  if (!Number.isFinite(bpm) || bpm < 20 || bpm > 300) return null
  return bpm
}

export function readProDjName(packet: Buffer, offset: number): string {
  if (packet.length < offset + 20) return ''
  return packet
    .subarray(offset, offset + 20)
    .toString('ascii')
    .replace(/\0/g, '')
    .trim()
}

export function isProDjMagic(packet: Buffer): boolean {
  if (packet.length < 10) return false
  return packet.subarray(0, 10).toString('ascii') === PRO_DJ_LINK_MAGIC
}

export interface ProDjAnnounceView {
  id: number
  name: string
  kind: ProDjDeviceKind
  mac: string
}

export function parseProDjAnnounce(packet: Buffer): ProDjAnnounceView | null {
  if (packet.length < 0x36 || !isProDjMagic(packet)) return null
  if (packet[0x0a] !== 0x06) return null
  const id = packet[0x24]
  if (id === 0) return null
  const mac = Array.from(packet.subarray(0x26, 0x2c))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(':')
  return {
    id,
    name: readProDjName(packet, 0x0c) || `Device ${id}`,
    kind: proDjKindFromType(packet[0x25], id),
    mac,
  }
}

export interface ProDjBeatView {
  id: number
  name: string
  trackBpm: number
  multiplier: number
  effectiveBpm: number | null
  pitchPercent: number
  beatInBar: number | null
}

export function parseProDjBeat(packet: Buffer): ProDjBeatView | null {
  if (packet.length < 0x60 || !isProDjMagic(packet)) return null
  if (packet[0x0a] !== 0x28) return null
  const id = packet[0x21]
  if (id === 0) return null
  const bpmRaw = packet.readUInt16BE(0x5a)
  if (bpmRaw === 0 || bpmRaw === 0xffff) return null
  const trackBpm = bpmRaw / 100
  const multiplier = proDjPitchMultiplier(
    packet[0x55],
    packet[0x56],
    packet[0x57]
  )
  const beat = packet[0x5c]
  return {
    id,
    name: readProDjName(packet, 0x0b) || `Device ${id}`,
    trackBpm,
    multiplier,
    effectiveBpm: proDjEffectiveBpm(trackBpm, multiplier),
    pitchPercent: proDjPitchPercent(multiplier),
    beatInBar: beat >= 1 && beat <= 4 ? beat : null,
  }
}

export interface ProDjStatusView {
  id: number
  playState: number
  playing: boolean
  isMaster: boolean
  isSync: boolean
  isOnAir: boolean
  trackBpm: number | null
  multiplier: number
  pitchPercent: number
  effectiveBpm: number | null
  beatInBar: number | null
}

export function parseProDjStatus(packet: Buffer): ProDjStatusView | null {
  if (packet.length < 0xc8 || !isProDjMagic(packet)) return null
  if (packet[0x0a] === 0x06) return null
  const id = packet[0x21]
  if (id === 0) return null
  const playState = packet[0x7b]
  const flags = packet[0x89]
  const bpmRaw = packet.readUInt16BE(0x92)
  const trackBpm = bpmRaw === 0xffff || bpmRaw === 0 ? null : bpmRaw / 100
  const multiplier = proDjPitchMultiplier(
    packet[0x99],
    packet[0x9a],
    packet[0x9b]
  )
  const beat = packet[0xa6]
  return {
    id,
    playState,
    playing: playState === 0x03 || playState === 0x04,
    isMaster: (flags & (1 << 5)) !== 0,
    isSync: (flags & (1 << 4)) !== 0,
    isOnAir: (flags & (1 << 3)) !== 0,
    trackBpm,
    multiplier,
    pitchPercent: proDjPitchPercent(multiplier),
    effectiveBpm:
      trackBpm === null ? null : proDjEffectiveBpm(trackBpm, multiplier),
    beatInBar: beat >= 1 && beat <= 4 ? beat : null,
  }
}

export function proDjBeatWindowMs(bpm: number | null): number {
  if (bpm === null || !Number.isFinite(bpm) || bpm < 20) return 1500
  return Math.min(2500, Math.max(800, (60000 / bpm) * 2.2))
}

export function isProDjDeviceFollowed(
  device: { id: number; kind: ProDjDeviceKind },
  explicit: boolean,
  followIds: number[]
): boolean {
  if (!explicit) return device.kind === 'player'
  return followIds.includes(device.id)
}

/**
 * Among selected players, follow one that is playing (tempo master, else the
 * latest beat). If selected players exist but none are playing, coast. Mixers
 * are a tempo source only when no player is selected.
 */
export function chooseProDjFollow(
  devices: ProDjFollowCandidate[],
  explicit: boolean,
  followIds: number[],
  coastBpm: number | null
): ProDjFollowChoice {
  const followed = devices.filter((device) =>
    isProDjDeviceFollowed(device, explicit, followIds)
  )
  const players = followed.filter((device) => device.kind === 'player')
  const pool = players.length > 0 ? players : followed
  const active = pool.filter((device) => device.playing)
  if (players.length > 0 && active.length === 0) {
    return coastChoice(coastBpm)
  }
  if (active.length === 0) {
    return coastChoice(coastBpm)
  }
  const chosen = pickActiveDevice(active)
  if (chosen.effectiveBpm === null) {
    return coastChoice(coastBpm)
  }
  return {
    mode: 'following',
    deviceId: chosen.id,
    bpm: chosen.effectiveBpm,
    beatInBar: chosen.beatInBar,
  }
}

function coastChoice(coastBpm: number | null): ProDjFollowChoice {
  if (coastBpm === null || !Number.isFinite(coastBpm)) {
    return { mode: 'idle', deviceId: null, bpm: null, beatInBar: null }
  }
  return { mode: 'coasting', deviceId: null, bpm: coastBpm, beatInBar: null }
}

function pickActiveDevice(
  active: ProDjFollowCandidate[]
): ProDjFollowCandidate {
  const masters = active.filter(
    (device) => device.isMaster && device.kind === 'player'
  )
  const pool = masters.length > 0 ? masters : active
  const ranked = [...pool].sort((a, b) => b.lastBeatMs - a.lastBeatMs)
  const withBpm = ranked.find((device) => device.effectiveBpm !== null)
  return withBpm ?? ranked[0]
}

export function formatProDjPitch(percent: number | null): string {
  if (percent === null || !Number.isFinite(percent)) return ''
  const rounded = percent.toFixed(2)
  return percent > 0 ? `+${rounded}%` : `${rounded}%`
}

export function formatProDjBpm(bpm: number | null): string {
  if (bpm === null || !Number.isFinite(bpm)) return '—'
  return bpm.toFixed(2)
}

export function proDjStatusLine(status: ProDjLinkStatus): string {
  if (status.error) return status.error
  if (!status.enabled) return 'Pro DJ Link follow is off'
  if (status.mode === 'following' && status.bpm !== null) {
    const name = status.followName ?? `player ${status.followDeviceId}`
    return `Following ${name} at ${formatProDjBpm(status.bpm)} BPM`
  }
  if (status.mode === 'coasting' && status.bpm !== null) {
    return `Coasting at ${formatProDjBpm(
      status.bpm
    )} BPM — no selected CDJ is playing`
  }
  if (!status.listening) return 'Pro DJ Link sockets are not open'
  if (status.devices.length === 0) {
    return 'Listening for CDJs and mixers on this network'
  }
  return 'Waiting for a selected CDJ to play'
}
