import dgram from 'dgram'
import {
  clampOscPort,
  decodeOscPacket,
  DEFAULT_OSC_PORT,
  DEFAULT_OSC_SEND_HOST,
  DEFAULT_OSC_SEND_PORT,
  OscMessage,
} from '../../shared/osc'
import { OscConnections, initOscConnections } from '../../shared/connection'

export type UpdatePayload = OscConnections
export type MessagePayload = OscMessage

export interface OscListenSettings {
  enabled: boolean
  port: number
}

interface Config {
  update_ms: number
  onUpdate: (status: UpdatePayload) => void
  onMessage: (message: MessagePayload) => void
  getSettings: () => OscListenSettings
}

let maintainInterval: ReturnType<typeof setInterval> | null = null
let socket: dgram.Socket | null = null
let boundPort: number | null = null
let lastStatus: OscConnections = initOscConnections()
let sendSocket: dgram.Socket | null = null

export function maintain(config: Config) {
  if (maintainInterval !== null) {
    clearInterval(maintainInterval)
    maintainInterval = null
  }
  maintainInterval = setInterval(() => {
    updateSocket(config)
  }, config.update_ms)
  updateSocket(config)
}

export function shutdownOsc(): void {
  if (maintainInterval !== null) {
    clearInterval(maintainInterval)
    maintainInterval = null
  }
  closeSocket()
  closeSendSocket()
  lastStatus = initOscConnections()
}

export function getLastStatus(): OscConnections {
  return lastStatus
}

/** Send a raw OSC datagram. Uses an unbound UDP socket (separate from listen). */
export function sendTo(host: string, port: number, buffer: Buffer): void {
  const destHost =
    typeof host === 'string' && host.trim().length > 0
      ? host.trim()
      : DEFAULT_OSC_SEND_HOST
  const destPort = clampOscPort(
    Number.isFinite(port) ? port : DEFAULT_OSC_SEND_PORT
  )
  try {
    if (sendSocket === null) {
      sendSocket = dgram.createSocket({ type: 'udp4' })
      sendSocket.on('error', () => {
        closeSendSocket()
      })
    }
    sendSocket.send(buffer, destPort, destHost)
  } catch {
    closeSendSocket()
  }
}

function closeSendSocket() {
  if (sendSocket) {
    try {
      sendSocket.removeAllListeners()
      sendSocket.close()
    } catch {
      /* ignore */
    }
  }
  sendSocket = null
}

function closeSocket() {
  if (socket) {
    try {
      socket.removeAllListeners()
      socket.close()
    } catch {
      /* ignore */
    }
  }
  socket = null
  boundPort = null
}

function publish(
  config: Config,
  patch: Partial<OscConnections> & Pick<OscConnections, 'enabled' | 'port'>
) {
  lastStatus = {
    ...lastStatus,
    ...patch,
    sendEnabled: lastStatus.sendEnabled,
    sendHost: lastStatus.sendHost,
    sendPort: lastStatus.sendPort,
    sending: lastStatus.sending,
    sendError: lastStatus.sendError,
  }
  config.onUpdate(lastStatus)
}

export function mergeSendStatus(
  patch: Pick<
    OscConnections,
    'sendEnabled' | 'sendHost' | 'sendPort' | 'sending' | 'sendError'
  >
): OscConnections {
  lastStatus = {
    ...lastStatus,
    ...patch,
  }
  return lastStatus
}

function updateSocket(config: Config) {
  const settings = config.getSettings()
  const enabled = settings.enabled === true
  const port = clampOscPort(
    Number.isFinite(settings.port) ? settings.port : DEFAULT_OSC_PORT
  )

  if (!enabled) {
    if (socket !== null || lastStatus.listening || lastStatus.enabled) {
      closeSocket()
      publish(config, {
        enabled: false,
        listening: false,
        port,
        error: null,
      })
    } else if (lastStatus.port !== port) {
      publish(config, {
        enabled: false,
        listening: false,
        port,
        error: null,
      })
    }
    return
  }

  if (socket !== null && boundPort === port && lastStatus.listening) {
    if (lastStatus.port !== port || !lastStatus.enabled) {
      publish(config, {
        enabled: true,
        listening: true,
        port,
        error: null,
      })
    }
    return
  }

  closeSocket()

  const next = dgram.createSocket({ type: 'udp4', reuseAddr: true })
  socket = next

  next.on('message', (msg) => {
    const messages = decodeOscPacket(msg)
    for (const message of messages) {
      config.onMessage(message)
    }
  })

  next.on('error', (err) => {
    const message = err?.message ?? String(err)
    closeSocket()
    publish(config, {
      enabled: true,
      listening: false,
      port,
      error: message,
    })
  })

  try {
    next.bind(port, '0.0.0.0', () => {
      if (socket !== next) return
      boundPort = port
      publish(config, {
        enabled: true,
        listening: true,
        port,
        error: null,
      })
    })
  } catch (err) {
    const message = (err as Error)?.message ?? String(err)
    closeSocket()
    publish(config, {
      enabled: true,
      listening: false,
      port,
      error: message,
    })
  }
}
