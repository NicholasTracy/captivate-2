import { spawn, ChildProcess } from 'child_process'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { createServer, Server, ServerResponse } from 'http'
import path from 'path'
import { UsbCameraList, UsbCameraSource } from 'shared/visualizerStreaming'

const LIST_TIMEOUT_MS = 8000
const FIRST_FRAME_TIMEOUT_MS = 8000
const BOUNDARY = 'ffmpeg'
const JPEG_START = Buffer.from([0xff, 0xd8])
const JPEG_END = Buffer.from([0xff, 0xd9])

export interface UsbCameraRelayHandle {
  url: string
  process: ChildProcess
  stop: () => void
}

interface RelayOptions {
  ffmpegPath: string
  deviceId: string
  fps: number
  relayId: string
}

export async function listUsbCameras(ffmpegPath: string): Promise<UsbCameraList> {
  if (process.platform === 'linux') {
    return { sources: listV4l2Cameras(), error: '' }
  }
  if (!existsSync(ffmpegPath) && ffmpegPath !== 'ffmpeg') {
    return { sources: [], error: `FFmpeg not found at "${ffmpegPath}"` }
  }
  try {
    const output = await collectProcessOutput(
      ffmpegPath,
      process.platform === 'darwin'
        ? ['-hide_banner', '-f', 'avfoundation', '-list_devices', 'true', '-i', '']
        : ['-hide_banner', '-f', 'dshow', '-list_devices', 'true', '-i', 'dummy'],
      LIST_TIMEOUT_MS
    )
    const sources =
      process.platform === 'darwin'
        ? parseAvfoundationDevices(output)
        : parseDshowDevices(output)
    return { sources, error: '' }
  } catch (err) {
    return {
      sources: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Opens one USB camera and serves it as MJPEG so every visualizer window
 * can show the same camera without opening it twice.
 */
export async function startUsbCameraRelay(
  options: RelayOptions
): Promise<UsbCameraRelayHandle> {
  const deviceId = options.deviceId.trim()
  if (deviceId.length === 0) {
    throw new Error('USB camera name is empty')
  }
  const relay = new UsbCameraRelay(options.ffmpegPath, deviceId, options.fps, options.relayId)
  const url = await relay.open()
  return {
    url,
    process: relay.child,
    stop: () => relay.stop(),
  }
}

class UsbCameraRelay {
  readonly child: ChildProcess
  private server: Server | null = null
  private readonly clients = new Set<ServerResponse>()
  private pending: Buffer<ArrayBufferLike> = Buffer.alloc(0)
  private latestJpeg: Buffer | null = null
  private stderr = ''
  private stopped = false
  private serverClosed = false
  private gotFrame = false
  private frameWaiters: Array<() => void> = []

  constructor(
    ffmpegPath: string,
    deviceId: string,
    fps: number,
    private readonly relayId: string
  ) {
    this.child = spawn(ffmpegPath, buildUsbCaptureArgs(deviceId, fps), {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    this.child.stdout?.on('data', (chunk: Buffer) => {
      this.consume(chunk)
    })
    this.child.stderr?.on('data', (chunk: Buffer) => {
      this.stderr = `${this.stderr}${chunk.toString()}`.slice(-2000)
    })
    this.child.on('error', (err) => {
      this.stderr = err.message
    })
  }

  async open() {
    const url = await this.listen()
    try {
      await this.waitForFirstFrame()
      return url
    } catch (err) {
      this.stop()
      const detail = this.stderr.trim()
      if (detail.length > 0) {
        throw new Error(detail.split('\n').slice(-3).join(' ').trim())
      }
      throw err
    }
  }

  stop() {
    if (this.stopped) return
    this.stopped = true
    this.closeServer()
    try {
      this.child.kill()
    } catch (_err) {}
  }

  private listen() {
    const server = createServer((req, res) => {
      const requestPath = (req.url || '').split('?')[0]
      if (requestPath !== `/${this.relayId}.mjpg`) {
        res.statusCode = 404
        res.end()
        return
      }
      res.writeHead(200, {
        'Content-Type': `multipart/x-mixed-replace; boundary=${BOUNDARY}`,
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        Connection: 'keep-alive',
      })
      this.clients.add(res)
      if (this.latestJpeg) {
        writeMjpegPart(res, this.latestJpeg)
      }
      res.on('close', () => {
        this.clients.delete(res)
      })
    })
    server.timeout = 0
    server.requestTimeout = 0
    this.server = server
    return new Promise<string>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        if (address === null || typeof address === 'string') {
          reject(new Error('USB camera relay failed to listen'))
          return
        }
        resolve(`http://127.0.0.1:${address.port}/${this.relayId}.mjpg`)
      })
    })
  }

  private waitForFirstFrame() {
    if (this.gotFrame) return Promise.resolve()
    if (this.child.exitCode !== null) {
      return Promise.reject(new Error('USB camera closed before a picture arrived'))
    }
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.child.off('exit', onExit)
        reject(new Error('USB camera did not produce a picture'))
      }, FIRST_FRAME_TIMEOUT_MS)
      const onExit = () => {
        clearTimeout(timer)
        if (!this.gotFrame) {
          reject(new Error('USB camera closed before a picture arrived'))
        }
      }
      this.frameWaiters.push(() => {
        clearTimeout(timer)
        this.child.off('exit', onExit)
        resolve()
      })
      this.child.once('exit', onExit)
    })
  }

  private consume(chunk: Buffer) {
    this.pending =
      this.pending.length === 0 ? chunk : Buffer.concat([this.pending, chunk])
    while (this.pending.length > 0) {
      const start = this.pending.indexOf(JPEG_START)
      if (start < 0) {
        this.pending =
          this.pending.length > 1
            ? this.pending.subarray(this.pending.length - 1)
            : this.pending
        return
      }
      if (start > 0) {
        this.pending = this.pending.subarray(start)
      }
      const end = this.pending.indexOf(JPEG_END, 2)
      if (end < 0) {
        if (this.pending.length > 12_000_000) {
          this.pending = Buffer.alloc(0)
        }
        return
      }
      const jpeg = Buffer.from(this.pending.subarray(0, end + 2))
      this.pending = this.pending.subarray(end + 2)
      this.latestJpeg = jpeg
      this.publish(jpeg)
      if (!this.gotFrame) {
        this.gotFrame = true
        const waiters = this.frameWaiters
        this.frameWaiters = []
        for (const waiter of waiters) waiter()
      }
    }
  }

  private publish(jpeg: Buffer) {
    for (const client of this.clients) {
      if (client.destroyed || client.writableEnded) {
        this.clients.delete(client)
        continue
      }
      try {
        writeMjpegPart(client, jpeg)
      } catch (_err) {
        this.clients.delete(client)
      }
    }
  }

  private closeServer() {
    if (this.serverClosed) return
    this.serverClosed = true
    for (const client of this.clients) {
      try {
        client.destroy()
      } catch (_err) {}
    }
    this.clients.clear()
    try {
      this.server?.close()
    } catch (_err) {}
  }
}

function writeMjpegPart(client: ServerResponse, jpeg: Buffer) {
  client.write(
    `--${BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpeg.length}\r\n\r\n`
  )
  client.write(jpeg)
  client.write('\r\n')
}

function buildUsbCaptureArgs(deviceId: string, fps: number) {
  const rate = String(Math.max(1, Math.min(60, Math.round(fps))))
  const input =
    process.platform === 'darwin'
      ? ['-f', 'avfoundation', '-framerate', rate, '-i', `${deviceId}:none`]
      : process.platform === 'linux'
      ? ['-f', 'v4l2', '-framerate', rate, '-i', deviceId]
      : ['-f', 'dshow', '-rtbufsize', '256M', '-i', `video=${deviceId}`]
  return [
    '-hide_banner',
    '-loglevel',
    'warning',
    ...input,
    '-an',
    '-vf',
    `fps=${rate},scale='min(1920,iw)':-2`,
    '-q:v',
    '5',
    '-f',
    'mjpeg',
    'pipe:1',
  ]
}

function parseDshowDevices(text: string): UsbCameraSource[] {
  const sources: UsbCameraSource[] = []
  const seen = new Set<string>()
  const pattern = /\[dshow[^\]]*\]\s+"([^"]+)"\s+\((video|none)\)/
  for (const line of text.split(/\r?\n/)) {
    const match = pattern.exec(line)
    if (!match) continue
    const name = match[1].trim()
    if (name.length === 0 || seen.has(name)) continue
    seen.add(name)
    sources.push({ id: name, label: name })
  }
  return sources
}

function parseAvfoundationDevices(text: string): UsbCameraSource[] {
  const sources: UsbCameraSource[] = []
  let inVideo = false
  for (const line of text.split(/\r?\n/)) {
    if (/AVFoundation video devices/i.test(line)) {
      inVideo = true
      continue
    }
    if (/AVFoundation audio devices/i.test(line)) {
      inVideo = false
      continue
    }
    if (!inVideo) continue
    const match = /\[(\d+)\]\s+(.+)$/.exec(line)
    if (!match) continue
    const label = match[2].trim()
    if (label.length === 0 || /^capture screen\b/i.test(label)) continue
    sources.push({ id: match[1], label })
  }
  return sources
}

function listV4l2Cameras(): UsbCameraSource[] {
  const root = '/sys/class/video4linux'
  if (!existsSync(root)) return []
  const sources: UsbCameraSource[] = []
  for (const entry of readdirSync(root)) {
    if (!/^video\d+$/.test(entry)) continue
    let label = entry
    try {
      label = readFileSync(path.join(root, entry, 'name'), 'utf8').trim() || entry
    } catch (_err) {}
    if (/metadata/i.test(label)) continue
    sources.push({ id: `/dev/${entry}`, label })
  }
  return sources
}

function collectProcessOutput(command: string, args: string[], timeoutMs: number) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true })
    const chunks: Buffer[] = []
    const onData = (chunk: Buffer) => {
      chunks.push(chunk)
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    let settled = false
    const finish = (action: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      action()
    }
    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch (_err) {}
      finish(() => resolve(Buffer.concat(chunks).toString('utf8')))
    }, timeoutMs)
    child.on('error', (err) => {
      finish(() => reject(err))
    })
    child.on('close', () => {
      finish(() => resolve(Buffer.concat(chunks).toString('utf8')))
    })
  })
}
