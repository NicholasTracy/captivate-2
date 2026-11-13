import {
  clampHeliosPoints,
  emptyHeliosStatus,
  heliosTestPatternPoints,
  HELIOS_POINT_RATE_PPS,
  type HeliosPoint,
  type HeliosScanResult,
  type HeliosStatus,
} from '../../../shared/heliosOutput'
import {
  HeliosUsbTransport,
  scanHeliosUsbDevices,
} from './heliosUsbTransport'

let transport: HeliosUsbTransport | null = null
let armed = false
let deviceIndex: number | null = null
let deviceLabel: string | null = null
let lastError: string | null = null
let livePoints: HeliosPoint[] = []
let sendingTestPattern = false
let latestFrame: HeliosPoint[] | null = null
let pumping = false
let shuttingDown = false
let shutdownPromise: Promise<void> | null = null

function status(): HeliosStatus {
  if (!transport || deviceIndex === null) {
    return emptyHeliosStatus(lastError)
  }
  return {
    connected: true,
    armed,
    deviceIndex,
    deviceLabel,
    lastError,
    pointCount: armed ? livePoints.length : 0,
    sendingTestPattern: armed && sendingTestPattern,
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function kickPump(): void {
  const current = transport
  if (!armed || !current || latestFrame === null || pumping || shuttingDown) {
    return
  }
  pumping = true
  void (async () => {
    try {
      while (
        armed &&
        transport === current &&
        latestFrame !== null &&
        !shuttingDown
      ) {
        const frame = latestFrame
        latestFrame = null
        if (frame.length < 1) {
          await current.stopOutput()
          continue
        }
        await current.pushFrame(frame, HELIOS_POINT_RATE_PPS)
        lastError = null
      }
    } catch (err) {
      lastError = errorMessage(err)
      console.warn('[helios]', lastError)
    } finally {
      pumping = false
      if (armed && transport === current && latestFrame !== null) {
        kickPump()
      }
    }
  })()
}

export function heliosScan(): HeliosScanResult {
  return scanHeliosUsbDevices()
}

export function heliosGetStatus(): HeliosStatus {
  return status()
}

export async function heliosConnect(index: number): Promise<HeliosStatus> {
  await heliosDisconnect()
  const scan = scanHeliosUsbDevices()
  if (scan.error && scan.devices.length === 0) {
    lastError = scan.error
    return status()
  }
  const device = scan.devices.find((d) => d.index === index) ?? scan.devices[index]
  const nextIndex = device?.index ?? index
  const next = new HeliosUsbTransport(nextIndex)
  try {
    await next.connect()
  } catch (err) {
    try {
      await next.disconnect()
    } catch {
      /* ignore */
    }
    lastError = errorMessage(err)
    return status()
  }
  transport = next
  deviceIndex = nextIndex
  deviceLabel = device?.label ?? `Helios ${nextIndex}`
  armed = false
  livePoints = []
  sendingTestPattern = false
  latestFrame = null
  lastError = null
  return status()
}

export async function heliosDisconnect(): Promise<HeliosStatus> {
  armed = false
  livePoints = []
  sendingTestPattern = false
  latestFrame = null
  const current = transport
  transport = null
  deviceIndex = null
  deviceLabel = null
  if (current) {
    try {
      await current.stopOutput()
    } catch (err) {
      lastError = errorMessage(err)
    }
    try {
      await current.disconnect()
    } catch (err) {
      lastError = errorMessage(err)
    }
  }
  return status()
}

export async function heliosSetArmed(nextArmed: boolean): Promise<HeliosStatus> {
  if (!transport) {
    lastError = 'Connect a Helios before arming output.'
    armed = false
    return status()
  }
  if (!nextArmed) {
    armed = false
    livePoints = []
    sendingTestPattern = false
    latestFrame = null
    try {
      await transport.stopOutput()
      lastError = null
    } catch (err) {
      lastError = errorMessage(err)
    }
    return status()
  }
  armed = true
  lastError = null
  if (livePoints.length > 0) {
    latestFrame = livePoints
    kickPump()
  }
  return status()
}

/**
 * Replace the live point buffer. Ignored while disarmed so nothing is sent
 * to the DAC.
 */
export function heliosSetLivePoints(points: unknown): HeliosStatus {
  if (!armed || !transport || shuttingDown) {
    return status()
  }
  const next = clampHeliosPoints(points)
  livePoints = next
  sendingTestPattern = false
  latestFrame = next
  kickPump()
  return status()
}

export async function heliosSendTestPattern(): Promise<HeliosStatus> {
  if (!transport || !armed) {
    lastError = 'Arm Helios output before sending the test pattern.'
    return status()
  }
  const points = heliosTestPatternPoints()
  livePoints = points
  sendingTestPattern = true
  latestFrame = points
  kickPump()
  return status()
}

/** Blank and close the DAC. Safe to call more than once. */
export function heliosShutdown(): Promise<void> {
  if (shutdownPromise) return shutdownPromise
  shutdownPromise = blankAndClose().finally(() => {
    shutdownPromise = null
  })
  return shutdownPromise
}

async function blankAndClose(): Promise<void> {
  shuttingDown = true
  armed = false
  livePoints = []
  sendingTestPattern = false
  latestFrame = null
  const current = transport
  transport = null
  deviceIndex = null
  deviceLabel = null
  if (current) {
    try {
      await current.stopOutput()
    } catch {
      /* still close */
    }
    try {
      await current.disconnect()
    } catch {
      /* ignore */
    }
  }
  shuttingDown = false
}
