import dgram from 'dgram'
import os from 'os'
import {
  PRO_DJ_LINK_ANNOUNCE_PORT,
  PRO_DJ_LINK_BEAT_PORT,
  PRO_DJ_LINK_DEVICE_NAME,
  PRO_DJ_LINK_MAGIC,
  PRO_DJ_LINK_STATUS_PORT,
  PRO_DJ_LINK_VIRTUAL_ID,
  chooseProDjFollow,
  initProDjLinkStatus,
  parseProDjAnnounce,
  parseProDjBeat,
  parseProDjStatus,
  proDjBeatWindowMs,
  proDjKindFromType,
  proDjPlayLabel,
  type ProDjDeviceKind,
  type ProDjFollowChoice,
  type ProDjFollowMode,
  type ProDjLinkStatus,
} from '../../shared/proDjLink'

export type { ProDjLinkStatus }

export interface ProDjLinkSettings {
  enabled: boolean
  followExplicit: boolean
  followIds: number[]
}

interface Config {
  update_ms: number
  onUpdate: (status: ProDjLinkStatus) => void
  getSettings: () => ProDjLinkSettings
}

interface LiveDevice {
  id: number
  name: string
  ip: string
  mac: string
  kind: ProDjDeviceKind
  playState: number | null
  isMaster: boolean
  isSync: boolean
  isOnAir: boolean
  trackBpm: number | null
  effectiveBpm: number | null
  pitchPercent: number | null
  beatInBar: number | null
  lastAnnounceMs: number
  lastStatusMs: number
  lastBeatMs: number
  lastSeenMs: number
}

interface IfaceInfo {
  address: string
  netmask: string
  mac: number[]
  macText: string
}

const DEVICE_STALE_MS = 10000
const STATUS_FRESH_MS = 2000
const ANNOUNCE_MS = 1500

let maintainInterval: ReturnType<typeof setInterval> | null = null
let announceInterval: ReturnType<typeof setInterval> | null = null
let announceSocket: dgram.Socket | null = null
let beatSocket: dgram.Socket | null = null
let statusSocket: dgram.Socket | null = null
let getSettings: () => ProDjLinkSettings = () => ({
  enabled: false,
  followExplicit: false,
  followIds: [],
})
let devices = new Map<number, LiveDevice>()
let virtualId = PRO_DJ_LINK_VIRTUAL_ID
let ownMac = ''
let iface: IfaceInfo | null = null
let listenError: string | null = null
let announceReady = false
let coastBpm: number | null = null
let lastConsumedBeatMs = 0
let lastPublished = ''
let nextBindAttemptMs = 0

export function maintain(config: Config) {
  getSettings = config.getSettings
  if (maintainInterval !== null) {
    clearInterval(maintainInterval)
  }
  maintainInterval = setInterval(() => {
    syncSockets(config)
  }, config.update_ms)
  syncSockets(config)
}

export function shutdownProDjLink(): void {
  if (maintainInterval !== null) {
    clearInterval(maintainInterval)
    maintainInterval = null
  }
  closeSockets()
  devices.clear()
  coastBpm = null
  lastConsumedBeatMs = 0
  listenError = null
  lastPublished = ''
}

export function getLastStatus(): ProDjLinkStatus {
  return buildStatus()
}

/** Follow decision for the tempo clock. Does not consume the beat edge. */
export function getFollowChoice(): {
  mode: ProDjFollowMode
  deviceId: number | null
  bpm: number | null
  beatInBar: number | null
} {
  const settings = getSettings()
  if (!settings.enabled) {
    return { mode: 'off', deviceId: null, bpm: null, beatInBar: null }
  }
  return currentChoice(Date.now())
}

/**
 * True once per beat packet from the device we are currently following.
 * Call after getFollowChoice() in the same tick.
 */
export function consumeFollowBeatEdge(): {
  beatInBar: number | null
  deviceId: number | null
} | null {
  const settings = getSettings()
  if (!settings.enabled) return null
  const now = Date.now()
  const choice = currentChoice(now)
  if (choice.mode !== 'following' || choice.deviceId === null) return null
  const device = devices.get(choice.deviceId)
  if (!device || device.lastBeatMs <= 0) return null
  if (now - device.lastBeatMs > 180) return null
  if (device.lastBeatMs === lastConsumedBeatMs) return null
  lastConsumedBeatMs = device.lastBeatMs
  return { beatInBar: device.beatInBar, deviceId: device.id }
}

function syncSockets(config: Config) {
  const enabled = config.getSettings().enabled === true
  if (!enabled) {
    if (
      announceSocket !== null ||
      beatSocket !== null ||
      statusSocket !== null
    ) {
      closeSockets()
      devices.clear()
      coastBpm = null
      listenError = null
    }
    publish(config, true)
    return
  }
  if (announceSocket === null) {
    if (Date.now() < nextBindAttemptMs) {
      publish(config, false)
      return
    }
    nextBindAttemptMs = Date.now() + 2000
    openSockets()
  }
  pruneDevices(Date.now())
  publish(config, false)
}

function openSockets() {
  listenError = null
  iface = pickInterface(null)
  ownMac = iface?.macText ?? ''
  try {
    announceReady = false
    announceSocket = bindSocket(PRO_DJ_LINK_ANNOUNCE_PORT, onAnnounce, () => {
      if (announceSocket === null) return
      announceReady = true
      try {
        announceSocket?.setBroadcast(true)
      } catch {
        /* ignore */
      }
      sendAnnounce()
    })
    beatSocket = bindSocket(PRO_DJ_LINK_BEAT_PORT, onBeat)
    statusSocket = bindSocket(PRO_DJ_LINK_STATUS_PORT, onStatus)
    announceInterval = setInterval(sendAnnounce, ANNOUNCE_MS)
  } catch (error) {
    listenError = error instanceof Error ? error.message : String(error)
    closeSockets()
  }
}

function bindSocket(
  port: number,
  onMessage: (msg: Buffer, rinfo: dgram.RemoteInfo) => void,
  onListening?: () => void
): dgram.Socket {
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
  socket.on('error', (error) => {
    listenError = `Pro DJ Link port ${port}: ${error.message}`
    nextBindAttemptMs = Date.now() + 2000
    closeSockets()
  })
  socket.on('message', (msg, rinfo) => {
    try {
      onMessage(msg, rinfo)
    } catch {
      /* ignore malformed datagrams */
    }
  })
  socket.bind({ port, address: '0.0.0.0', exclusive: false }, () => {
    onListening?.()
  })
  return socket
}

function closeSockets() {
  if (announceInterval !== null) {
    clearInterval(announceInterval)
    announceInterval = null
  }
  for (const socket of [announceSocket, beatSocket, statusSocket]) {
    if (socket === null) continue
    socket.removeAllListeners()
    try {
      socket.close()
    } catch {
      /* already closed */
    }
  }
  announceSocket = null
  beatSocket = null
  statusSocket = null
  announceReady = false
}

function onAnnounce(msg: Buffer, rinfo: dgram.RemoteInfo) {
  const parsed = parseProDjAnnounce(msg)
  if (!parsed) return
  if (parsed.mac && parsed.mac === ownMac) return
  if (parsed.id === virtualId && parsed.name === PRO_DJ_LINK_DEVICE_NAME) return
  if (parsed.id === virtualId) {
    virtualId = nextVirtualId()
  }
  notePeerInterface(rinfo.address)
  const now = Date.now()
  const device = ensureDevice(parsed.id, parsed.name, rinfo.address, now)
  device.name = parsed.name
  device.kind = parsed.kind
  device.mac = parsed.mac
  device.lastAnnounceMs = now
}

function onBeat(msg: Buffer, rinfo: dgram.RemoteInfo) {
  const parsed = parseProDjBeat(msg)
  if (!parsed) return
  if (parsed.id === virtualId) return
  notePeerInterface(rinfo.address)
  const now = Date.now()
  const device = ensureDevice(parsed.id, parsed.name, rinfo.address, now)
  if (device.kind === 'other') {
    device.kind = proDjKindFromType(0, parsed.id)
  }
  device.trackBpm = parsed.trackBpm
  device.pitchPercent = parsed.pitchPercent
  device.beatInBar = parsed.beatInBar
  if (parsed.effectiveBpm !== null) {
    device.effectiveBpm = parsed.effectiveBpm
  }
  device.lastBeatMs = now
}

function onStatus(msg: Buffer, rinfo: dgram.RemoteInfo) {
  const parsed = parseProDjStatus(msg)
  if (!parsed) return
  if (parsed.id === virtualId) return
  notePeerInterface(rinfo.address)
  const now = Date.now()
  const device = ensureDevice(
    parsed.id,
    `Device ${parsed.id}`,
    rinfo.address,
    now
  )
  if (device.kind === 'other') {
    device.kind = proDjKindFromType(0, parsed.id)
  }
  device.playState = parsed.playState
  device.isMaster = parsed.isMaster
  device.isSync = parsed.isSync
  device.isOnAir = parsed.isOnAir
  device.lastStatusMs = now
  if (parsed.beatInBar !== null) device.beatInBar = parsed.beatInBar
  if (parsed.trackBpm !== null) device.trackBpm = parsed.trackBpm
  if (parsed.effectiveBpm !== null) {
    device.effectiveBpm = parsed.effectiveBpm
    device.pitchPercent = parsed.pitchPercent
  }
}

function ensureDevice(
  id: number,
  name: string,
  ip: string,
  now: number
): LiveDevice {
  let device = devices.get(id)
  if (!device) {
    device = {
      id,
      name,
      ip,
      mac: '',
      kind: proDjKindFromType(0, id),
      playState: null,
      isMaster: false,
      isSync: false,
      isOnAir: false,
      trackBpm: null,
      effectiveBpm: null,
      pitchPercent: null,
      beatInBar: null,
      lastAnnounceMs: 0,
      lastStatusMs: 0,
      lastBeatMs: 0,
      lastSeenMs: now,
    }
    devices.set(id, device)
  }
  if (name)
    device.name = device.name && device.lastAnnounceMs > 0 ? device.name : name
  device.ip = ip
  device.lastSeenMs = now
  return device
}

function pruneDevices(now: number) {
  for (const [id, device] of devices) {
    if (now - device.lastSeenMs > DEVICE_STALE_MS) {
      devices.delete(id)
    }
  }
}

function deviceIsPlaying(device: LiveDevice, now: number): boolean {
  const beatFresh =
    device.lastBeatMs > 0 &&
    now - device.lastBeatMs <=
      proDjBeatWindowMs(device.effectiveBpm ?? device.trackBpm)
  const statusFresh =
    device.lastStatusMs > 0 && now - device.lastStatusMs <= STATUS_FRESH_MS
  if (device.kind === 'mixer') return beatFresh
  if (statusFresh) {
    return device.playState === 0x03 || device.playState === 0x04
  }
  return beatFresh
}

function currentChoice(now: number): ProDjFollowChoice {
  const settings = getSettings()
  const choice = chooseProDjFollow(
    followCandidates(now),
    settings.followExplicit,
    settings.followIds,
    coastBpm
  )
  if (choice.mode === 'following' && choice.bpm !== null) {
    const bpm = Math.min(220, Math.max(45, choice.bpm))
    coastBpm = bpm
    return { ...choice, bpm }
  }
  return choice
}

function followCandidates(now: number) {
  return [...devices.values()].map((device) => ({
    id: device.id,
    name: device.name,
    kind: device.kind,
    playing: deviceIsPlaying(device, now),
    isMaster: device.isMaster,
    lastBeatMs: device.lastBeatMs,
    effectiveBpm: device.effectiveBpm,
    beatInBar: device.beatInBar,
  }))
}

function buildStatus(): ProDjLinkStatus {
  const settings = getSettings()
  if (!settings.enabled) {
    return initProDjLinkStatus()
  }
  const now = Date.now()
  const choice = currentChoice(now)
  const followDevice =
    choice.deviceId === null ? null : devices.get(choice.deviceId) ?? null
  const list = [...devices.values()].sort((a, b) => {
    if (a.kind !== b.kind) return kindOrder(a.kind) - kindOrder(b.kind)
    return a.id - b.id
  })
  return {
    enabled: true,
    listening: announceSocket !== null && listenError === null,
    error: listenError,
    mode: choice.mode,
    followDeviceId: choice.deviceId,
    followName: followDevice?.name ?? null,
    bpm: choice.bpm,
    devices: list.map((device) => {
      const playing = deviceIsPlaying(device, now)
      return {
        id: device.id,
        name: device.name,
        ip: device.ip,
        kind: device.kind,
        playLabel:
          device.kind === 'mixer'
            ? playing
              ? 'Metronome'
              : 'Mixer'
            : proDjPlayLabel(device.playState, playing),
        playing,
        isMaster: device.isMaster,
        isSync: device.isSync,
        isOnAir: device.isOnAir,
        trackBpm: device.trackBpm,
        effectiveBpm: device.effectiveBpm,
        pitchPercent: device.pitchPercent,
        beatInBar: device.beatInBar,
      }
    }),
  }
}

function publish(config: Config, force: boolean) {
  const status = buildStatus()
  const key = JSON.stringify(status)
  if (!force && key === lastPublished) return
  lastPublished = key
  config.onUpdate(status)
}

function kindOrder(kind: ProDjDeviceKind): number {
  if (kind === 'player') return 0
  if (kind === 'mixer') return 1
  if (kind === 'rekordbox') return 2
  return 3
}

function nextVirtualId(): number {
  for (let id = PRO_DJ_LINK_VIRTUAL_ID; id <= 16; id++) {
    if (!devices.has(id)) return id
  }
  return 16
}

function sendAnnounce() {
  const socket = announceSocket
  const current = iface ?? pickInterface(null)
  if (!announceReady || socket === null) return
  if (current === null) {
    if (listenError === null) {
      listenError =
        'No network interface with a MAC address is available for Pro DJ Link'
    }
    return
  }
  if (
    listenError ===
    'No network interface with a MAC address is available for Pro DJ Link'
  ) {
    listenError = null
  }
  iface = current
  ownMac = current.macText
  const packet = makeAnnouncePacket(virtualId, current)
  const targets = new Set<string>(['255.255.255.255', broadcastOf(current)])
  for (const device of devices.values()) {
    if (device.ip) targets.add(device.ip)
  }
  for (const target of targets) {
    try {
      socket.send(packet, PRO_DJ_LINK_ANNOUNCE_PORT, target)
    } catch {
      /* ignore a single failed destination */
    }
  }
}

function makeAnnouncePacket(id: number, current: IfaceInfo): Buffer {
  const buf = Buffer.alloc(0x36)
  buf.write(PRO_DJ_LINK_MAGIC, 0, 'ascii')
  buf[0x0a] = 0x06
  buf.write(PRO_DJ_LINK_DEVICE_NAME, 0x0c, 'ascii')
  buf[0x20] = 0x01
  buf[0x21] = 0x02
  buf[0x23] = 0x36
  buf[0x24] = id & 0xff
  buf[0x25] = 0x01
  for (let i = 0; i < 6; i++) buf[0x26 + i] = current.mac[i] ?? 0
  const ip = current.address.split('.').map((part) => Number(part) & 0xff)
  for (let i = 0; i < 4; i++) buf[0x2c + i] = ip[i] ?? 0
  buf[0x30] = 0x01
  buf[0x34] = 0x01
  return buf
}

function notePeerInterface(peerIp: string) {
  const match = pickInterface(peerIp)
  if (match) iface = match
}

function pickInterface(peerIp: string | null): IfaceInfo | null {
  const list = listInterfaces()
  if (peerIp) {
    const match = list.find((entry) =>
      sameSubnet(entry.address, entry.netmask, peerIp)
    )
    if (match) return match
  }
  return iface ?? list[0] ?? null
}

function listInterfaces(): IfaceInfo[] {
  const found: IfaceInfo[] = []
  const nets = os.networkInterfaces()
  for (const entries of Object.values(nets)) {
    if (!entries) continue
    for (const entry of entries) {
      const family = String(entry.family)
      if (entry.internal || (family !== 'IPv4' && family !== '4')) continue
      if (!entry.mac || entry.mac === '00:00:00:00:00:00') continue
      const mac = entry.mac.split(':').map((part) => Number.parseInt(part, 16))
      if (mac.length !== 6 || mac.some((part) => !Number.isFinite(part)))
        continue
      found.push({
        address: entry.address,
        netmask: entry.netmask,
        mac,
        macText: entry.mac.toLowerCase(),
      })
    }
  }
  return found
}

function sameSubnet(address: string, netmask: string, peer: string): boolean {
  const ip = address.split('.').map(Number)
  const mask = netmask.split('.').map(Number)
  const other = peer.split('.').map(Number)
  if (ip.length !== 4 || mask.length !== 4 || other.length !== 4) return false
  return ip.every(
    (part, index) => (part & mask[index]) === (other[index] & mask[index])
  )
}

function broadcastOf(current: IfaceInfo): string {
  const ip = current.address.split('.').map(Number)
  const mask = current.netmask.split('.').map(Number)
  return ip
    .map((part, index) => (part & mask[index]) | (255 ^ (mask[index] & 255)))
    .join('.')
}
