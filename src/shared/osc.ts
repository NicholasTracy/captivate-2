/** Open Sound Control (network) — not LFO oscillator shapes. */

export type OscArg =
  | { type: 'i'; value: number }
  | { type: 'f'; value: number }
  | { type: 's'; value: string }
  | { type: 'b'; value: Buffer }
  | { type: 'T' }
  | { type: 'F' }
  | { type: 'N' }
  | { type: 'I' }

export interface OscMessage {
  address: string
  args: OscArg[]
}

export const DEFAULT_OSC_PORT = 9000
/** Default UDP port for Captivate OSC auto-publish (must differ from listen). */
export const DEFAULT_OSC_SEND_PORT = 9001
export const DEFAULT_OSC_SEND_HOST = '127.0.0.1'
export const OSC_PORT_MIN = 1024
export const OSC_PORT_MAX = 65535

/** Stable id for button/slider maps; same address = same control. */
export function oscInputID(address: string): string {
  return address
}

export function clampOscPort(port: number): number {
  if (!Number.isFinite(port)) return DEFAULT_OSC_PORT
  const rounded = Math.round(port)
  return Math.min(OSC_PORT_MAX, Math.max(OSC_PORT_MIN, rounded))
}

/**
 * First numeric argument as a 0..1 control value.
 * Values in (1..127] / (1..255] are scaled like MIDI CC.
 * True → 1, False/Nil → 0, Impulse/no numeric → 1 (bang).
 */
export function oscMessageNormalizedValue(message: OscMessage): number {
  for (const arg of message.args) {
    if (arg.type === 'f' || arg.type === 'i') {
      const raw = arg.value
      if (!Number.isFinite(raw)) continue
      if (raw <= 1) return clamp01(raw)
      if (raw <= 127) return clamp01(raw / 127)
      if (raw <= 255) return clamp01(raw / 255)
      return 1
    }
    if (arg.type === 'T') return 1
    if (arg.type === 'F' || arg.type === 'N') return 0
    if (arg.type === 'I') return 1
  }
  return 1
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function readPaddedString(
  buffer: Buffer,
  offset: number
): { value: string; next: number } | null {
  if (offset < 0 || offset >= buffer.length) return null
  let end = offset
  while (end < buffer.length && buffer[end] !== 0) end++
  if (end >= buffer.length) return null
  const value = buffer.toString('utf8', offset, end)
  const next = Math.ceil((end + 1) / 4) * 4
  if (next > buffer.length) return null
  return { value, next }
}

function decodeOscMessageAt(
  buffer: Buffer,
  offset: number,
  end: number
): OscMessage | null {
  const address = readPaddedString(buffer, offset)
  if (!address || !address.value.startsWith('/')) return null

  const typeTag = readPaddedString(buffer, address.next)
  if (!typeTag || !typeTag.value.startsWith(',')) return null

  let cursor = typeTag.next
  const args: OscArg[] = []
  const tags = typeTag.value.slice(1)

  for (const tag of tags) {
    if (cursor > end) return null
    if (tag === 'i') {
      if (cursor + 4 > end) return null
      args.push({ type: 'i', value: buffer.readInt32BE(cursor) })
      cursor += 4
    } else if (tag === 'f') {
      if (cursor + 4 > end) return null
      args.push({ type: 'f', value: buffer.readFloatBE(cursor) })
      cursor += 4
    } else if (tag === 's') {
      const str = readPaddedString(buffer, cursor)
      if (!str || str.next > end) return null
      args.push({ type: 's', value: str.value })
      cursor = str.next
    } else if (tag === 'b') {
      if (cursor + 4 > end) return null
      const size = buffer.readInt32BE(cursor)
      cursor += 4
      if (size < 0 || cursor + size > end) return null
      args.push({ type: 'b', value: buffer.subarray(cursor, cursor + size) })
      cursor = Math.ceil((cursor + size) / 4) * 4
    } else if (tag === 'T') {
      args.push({ type: 'T' })
    } else if (tag === 'F') {
      args.push({ type: 'F' })
    } else if (tag === 'N') {
      args.push({ type: 'N' })
    } else if (tag === 'I') {
      args.push({ type: 'I' })
    } else {
      // Unsupported type tag — drop the packet rather than mis-parse.
      return null
    }
  }

  return { address: address.value, args }
}

function decodeOscBundle(
  buffer: Buffer,
  offset: number,
  end: number,
  out: OscMessage[]
): void {
  // #bundle\0 + 8-byte timetag already consumed by caller starting at element region
  let cursor = offset
  while (cursor + 4 <= end) {
    const size = buffer.readInt32BE(cursor)
    cursor += 4
    if (size < 0 || cursor + size > end) return
    const element = buffer.subarray(cursor, cursor + size)
    cursor += size
    decodeOscPacketInto(element, 0, element.length, out)
  }
}

function decodeOscPacketInto(
  buffer: Buffer,
  offset: number,
  end: number,
  out: OscMessage[]
): void {
  if (end - offset < 4) return
  if (
    buffer[offset] === 0x23 &&
    buffer.toString('ascii', offset, offset + 8) === '#bundle\0'
  ) {
    // skip "#bundle\0" (8) + timetag (8)
    if (offset + 16 > end) return
    decodeOscBundle(buffer, offset + 16, end, out)
    return
  }
  const message = decodeOscMessageAt(buffer, offset, end)
  if (message) out.push(message)
}

/** Decode one UDP datagram into zero or more OSC messages (bundles expand). */
export function decodeOscPacket(buffer: Buffer): OscMessage[] {
  const out: OscMessage[] = []
  decodeOscPacketInto(buffer, 0, buffer.length, out)
  return out
}

function writePaddedString(parts: Buffer[], value: string): void {
  const raw = Buffer.from(value, 'utf8')
  const paddedLen = Math.ceil((raw.length + 1) / 4) * 4
  const buf = Buffer.alloc(paddedLen)
  raw.copy(buf)
  parts.push(buf)
}

export type EncodeOscArg =
  | number
  | { type: 'i' | 'f'; value: number }
  | { type: 's'; value: string }
  | { type: 'T' | 'F' | 'N' | 'I' }

/**
 * Encode a single OSC message. Numbers default to float (`f`); use
 * `{ type: 'i', value }` for ints. Bools use T/F tags when passed as those args.
 */
export function encodeOscMessage(
  address: string,
  args: EncodeOscArg[] = []
): Buffer {
  const addr = address.startsWith('/') ? address : `/${address}`
  const parts: Buffer[] = []
  writePaddedString(parts, addr)

  let typeTag = ','
  const argBuffers: Buffer[] = []

  for (const arg of args) {
    if (typeof arg === 'number') {
      typeTag += 'f'
      const buf = Buffer.alloc(4)
      buf.writeFloatBE(arg, 0)
      argBuffers.push(buf)
      continue
    }
    if (arg.type === 'f') {
      typeTag += 'f'
      const buf = Buffer.alloc(4)
      buf.writeFloatBE(arg.value, 0)
      argBuffers.push(buf)
    } else if (arg.type === 'i') {
      typeTag += 'i'
      const buf = Buffer.alloc(4)
      buf.writeInt32BE(Math.trunc(arg.value), 0)
      argBuffers.push(buf)
    } else if (arg.type === 's') {
      typeTag += 's'
      const strParts: Buffer[] = []
      writePaddedString(strParts, arg.value)
      argBuffers.push(...strParts)
    } else if (
      arg.type === 'T' ||
      arg.type === 'F' ||
      arg.type === 'N' ||
      arg.type === 'I'
    ) {
      typeTag += arg.type
    }
  }

  writePaddedString(parts, typeTag)
  parts.push(...argBuffers)
  return Buffer.concat(parts)
}
