import { spawn } from 'child_process'
import { createServer } from 'net'
import { nanoid } from 'nanoid'
import {
  VisualizerRelayRequest,
  VisualizerRelayStartResult,
} from 'shared/visualizerStreaming'
import { startNdiMjpegRelay } from './NdiMjpegRelay'
import { startUsbCameraRelay } from './usbCamera'
import {
  buildFfmpegEnv,
  visStreamHealth,
  resolveFfmpegPath,
  resolveNdiRuntimeLibrary,
} from './visualizerStreamingRuntime'

interface RelayEntry {
  id: string
  sourceUrl: string
  relayUrl: string
  process: ReturnType<typeof spawn> | null
  stop: () => void
}

const RELAY_READY_TIMEOUT_MS = 750
const RELAY_READY_POLL_MS = 50

export default class VisualizerInputRelayManager {
  private byId = new Map<string, RelayEntry>()
  private bySourceUrl = new Map<string, RelayEntry>()

  async start(
    req: VisualizerRelayRequest,
    ndiRuntimePath: string = ''
  ): Promise<VisualizerRelayStartResult> {
    const sourceUrl = req.sourceUrl.trim()
    if (sourceUrl.length === 0) {
      throw new Error('Stream URL is empty')
    }

    const sourceKind = isRtspUrl(sourceUrl)
      ? 'rtsp'
      : isNdiUrl(sourceUrl)
      ? 'ndi'
      : isUsbUrl(sourceUrl)
      ? 'usb'
      : 'direct'

    if (sourceKind === 'direct') {
      return {
        mode: 'direct',
        relayId: null,
        url: sourceUrl,
        message: 'Using direct URL',
      }
    }

    const existing = this.bySourceUrl.get(sourceUrl)
    if (existing) {
      return {
        mode: 'mjpegRelay',
        relayId: existing.id,
        url: existing.relayUrl,
        message: 'Using existing stream relay',
      }
    }

    if (sourceKind === 'ndi') {
      const native = await this.startNdiRelay(req, sourceUrl, ndiRuntimePath)
      if (native) {
        return native
      }
    }

    if (sourceKind === 'usb') {
      return await this.startUsbRelay(req, sourceUrl)
    }

    return await this.startFfmpegRelay(req, sourceUrl, sourceKind)
  }

  stop(relayId: string) {
    const entry = this.byId.get(relayId)
    if (!entry) return
    this.kill(entry)
  }

  stopAll() {
    for (const entry of Array.from(this.byId.values())) {
      this.kill(entry)
    }
  }

  private async startNdiRelay(
    req: VisualizerRelayRequest,
    sourceUrl: string,
    ndiRuntimePath: string
  ): Promise<VisualizerRelayStartResult | null> {
    const libraryPath = resolveNdiRuntimeLibrary(ndiRuntimePath)
    if (!libraryPath) {
      return null
    }
    const relayId = nanoid()
    try {
      const relay = await startNdiMjpegRelay({
        libraryPath,
        runtimePath: ndiRuntimePath,
        sourceName: parseNdiSourceName(sourceUrl),
        fps: clampFps(req.fps),
        relayId,
      })
      const entry: RelayEntry = {
        id: relayId,
        sourceUrl,
        relayUrl: relay.url,
        process: null,
        stop: () => relay.stop(),
      }
      this.byId.set(relayId, entry)
      this.bySourceUrl.set(sourceUrl, entry)
      return {
        mode: 'mjpegRelay',
        relayId,
        url: relay.url,
        message: `NDI source connected on ${relay.url}`,
      }
    } catch (err) {
      console.error('[ndi-relay] native receive failed', err)
      throw err instanceof Error ? err : new Error(String(err))
    }
  }

  private async startUsbRelay(
    req: VisualizerRelayRequest,
    sourceUrl: string
  ): Promise<VisualizerRelayStartResult> {
    const health = visStreamHealth(req.ffmpegPath, 'libndi_newtek')
    if (!health.ffmpeg.exists) {
      throw new Error(`FFmpeg not found at "${health.ffmpeg.resolvedPath}"`)
    }
    const relayId = nanoid()
    const relay = await startUsbCameraRelay({
      ffmpegPath: resolveFfmpegPath(req.ffmpegPath),
      deviceId: parseUsbDeviceId(sourceUrl),
      fps: clampFps(req.fps),
      relayId,
    })
    const entry: RelayEntry = {
      id: relayId,
      sourceUrl,
      relayUrl: relay.url,
      process: relay.process,
      stop: () => relay.stop(),
    }
    this.byId.set(relayId, entry)
    this.bySourceUrl.set(sourceUrl, entry)
    relay.process.on('exit', () => {
      relay.stop()
      this.cleanup(relayId)
    })
    return {
      mode: 'mjpegRelay',
      relayId,
      url: relay.url,
      message: `USB camera connected on ${relay.url}`,
    }
  }

  private async startFfmpegRelay(
    req: VisualizerRelayRequest,
    sourceUrl: string,
    sourceKind: 'rtsp' | 'ndi'
  ): Promise<VisualizerRelayStartResult> {
    const relayId = nanoid()
    const port = await getFreePort()
    const relayUrl = `http://127.0.0.1:${port}/${relayId}.mjpg`
    const health = visStreamHealth(req.ffmpegPath, 'libndi_newtek')
    if (!health.ffmpeg.exists) {
      throw new Error(`FFmpeg not found at "${health.ffmpeg.resolvedPath}"`)
    }
    const ffmpegPath = resolveFfmpegPath(req.ffmpegPath)
    const ffmpegArgs =
      sourceKind === 'ndi'
        ? buildNdiRelayArgs(req, sourceUrl, relayUrl)
        : buildRtspRelayArgs(req, sourceUrl, relayUrl)

    const relayProcess = spawn(ffmpegPath, ffmpegArgs, {
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
      env: buildFfmpegEnv(),
    })

    const entry: RelayEntry = {
      id: relayId,
      sourceUrl,
      relayUrl,
      process: relayProcess,
      stop: () => {
        try {
          relayProcess.kill('SIGTERM')
        } catch (_err) {}
      },
    }
    this.byId.set(relayId, entry)
    this.bySourceUrl.set(sourceUrl, entry)

    relayProcess.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim()
      if (text.length > 0) {
        console.warn(`[visualizer-relay:${relayId}] ${text}`)
      }
    })

    relayProcess.on('error', (err) => {
      console.error(`[visualizer-relay:${relayId}] process error`, err)
      this.cleanup(relayId)
    })

    relayProcess.on('exit', () => {
      this.cleanup(relayId)
    })

    try {
      await waitForRelayReady(relayUrl, relayProcess)
    } catch (err) {
      this.kill(entry)
      const label = sourceKind === 'ndi' ? 'NDI' : 'RTSP'
      throw new Error(`${label} relay failed to start: ${toErrorMessage(err)}`)
    }

    return {
      mode: 'mjpegRelay',
      relayId,
      url: relayUrl,
      message:
        sourceKind === 'ndi'
          ? `NDI relay started on ${relayUrl}`
          : `RTSP relay started on ${relayUrl}`,
    }
  }

  private kill(entry: RelayEntry) {
    try {
      entry.stop()
    } catch (_err) {}
    this.cleanup(entry.id)
  }

  private cleanup(relayId: string) {
    const entry = this.byId.get(relayId)
    if (!entry) return
    this.byId.delete(relayId)
    this.bySourceUrl.delete(entry.sourceUrl)
  }
}

function isRtspUrl(url: string) {
  const lower = url.toLowerCase()
  return lower.startsWith('rtsp://') || lower.startsWith('rtsps://')
}

function isNdiUrl(url: string) {
  const lower = url.toLowerCase()
  return lower.startsWith('ndi://')
}

function isUsbUrl(url: string) {
  return url.toLowerCase().startsWith('usb://')
}

function parseUsbDeviceId(url: string) {
  const raw = url.slice('usb://'.length).trim()
  try {
    return decodeURIComponent(raw)
  } catch (_err) {
    return raw
  }
}

function parseNdiSourceName(url: string) {
  const sourceName = url.slice('ndi://'.length).trim()
  return sourceName.length > 0 ? sourceName : 'Captivate'
}

function buildRtspRelayArgs(
  req: VisualizerRelayRequest,
  sourceUrl: string,
  relayUrl: string
) {
  return [
    '-hide_banner',
    '-loglevel',
    'warning',
    '-rtsp_transport',
    req.rtspTransport === 'udp' ? 'udp' : 'tcp',
    '-fflags',
    'nobuffer',
    '-flags',
    'low_delay',
    '-i',
    sourceUrl,
    '-an',
    '-vf',
    `fps=${clampFps(req.fps)}`,
    '-f',
    'mpjpeg',
    '-q:v',
    '5',
    '-listen',
    '1',
    relayUrl,
  ]
}

function buildNdiRelayArgs(
  req: VisualizerRelayRequest,
  sourceUrl: string,
  relayUrl: string
) {
  return [
    '-hide_banner',
    '-loglevel',
    'warning',
    '-fflags',
    'nobuffer',
    '-flags',
    'low_delay',
    '-f',
    'libndi_newtek',
    '-i',
    parseNdiSourceName(sourceUrl),
    '-an',
    '-vf',
    `fps=${clampFps(req.fps)}`,
    '-f',
    'mpjpeg',
    '-q:v',
    '5',
    '-listen',
    '1',
    relayUrl,
  ]
}

function clampFps(fps: number) {
  if (!Number.isFinite(fps)) return 30
  return Math.max(1, Math.min(120, Math.round(fps)))
}

async function getFreePort() {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.on('error', (err) => reject(err))
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (addr === null || typeof addr === 'string') {
        server.close()
        reject(new Error('Failed to resolve relay port'))
        return
      }
      const port = addr.port
      server.close(() => resolve(port))
    })
  })
}

async function waitForRelayReady(
  _relayUrl: string,
  relayProcess: ReturnType<typeof spawn>
) {
  const started = Date.now()

  while (Date.now() - started < RELAY_READY_TIMEOUT_MS) {
    if (relayProcess.exitCode !== null || relayProcess.killed) {
      throw new Error('Relay process exited before it became ready')
    }

    await sleep(RELAY_READY_POLL_MS)
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

function toErrorMessage(err: unknown) {
  if (err instanceof Error && err.message) {
    return err.message
  }
  return String(err)
}
