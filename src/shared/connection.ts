export type ConnectionId = string

export type DmxUsbDeviceType = 'DmxUsbPro' | 'OpenDmxUsb'

export interface DmxDeviceUsb_t {
  type: DmxUsbDeviceType | null
  connectionId: ConnectionId
  path: string
  manufacturer?: string
  pnpId?: string
  productId?: string
  serialNumber?: string
  vendorId?: string
  name: string
}

export type DmxDevice_t = DmxDeviceUsb_t

export interface SerialportInfo {
  path: string
  manufacturer: string | undefined
  serialNumber: string | undefined
  pnpId: string | undefined
  locationId: string | undefined
  productId: string | undefined
  vendorId: string | undefined
}

export interface MidiDevice_t {
  connectionId: ConnectionId
  name: string
}

export interface ArtNetConnectionInfo {}

export interface DmxConnectionInfo {
  connected: ConnectionId[]
  available: DmxDevice_t[]
  serialports: SerialportInfo[]
  artNet: ArtNetConnectionInfo
}

export interface MidiConnections {
  connected: ConnectionId[]
  available: MidiDevice_t[]
}

export interface MidiOutConnections {
  connected: ConnectionId[]
  available: MidiDevice_t[]
}

export interface OscConnections {
  enabled: boolean
  listening: boolean
  port: number
  error: string | null
  sendEnabled: boolean
  sendHost: string
  sendPort: number
  sending: boolean
  sendError: string | null
}

export function initMidiConnections(): MidiConnections {
  return {
    connected: [],
    available: [],
  }
}

export function initMidiOutConnections(): MidiOutConnections {
  return {
    connected: [],
    available: [],
  }
}

export function initOscConnections(): OscConnections {
  return {
    enabled: false,
    listening: false,
    port: 9000,
    error: null,
    sendEnabled: false,
    sendHost: '127.0.0.1',
    sendPort: 9001,
    sending: false,
    sendError: null,
  }
}

export function initDmxConnections(): DmxConnectionInfo {
  return {
    connected: [],
    available: [],
    serialports: [],
    artNet: {
      ipOut: null,
    },
  }
}
