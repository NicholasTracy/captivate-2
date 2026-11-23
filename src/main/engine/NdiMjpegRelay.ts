import { nativeImage } from 'electron'
import { createServer, Server, ServerResponse } from 'http'
import { tryGetKoffi } from './koffiNative'
import { ensureNdiSdkStructs } from './ndiSdk'
import { applyNdiRuntimeEnv } from './visualizerStreamingRuntime'

const NDI_COLOR_BGRX_BGRA = 0
const NDI_BANDWIDTH_HIGHEST = 100
const NDI_FRAME_VIDEO = 1
const FOURCC_BGRA = 0x41524742
const FOURCC_BGRX = 0x58524742
const MAX_FRAME_WIDTH = 1920
const MAX_FRAME_DIMENSION = 8192
const JPEG_QUALITY = 72
const BOUNDARY = 'ffmpeg'

type KoffiModule = NonNullable<ReturnType<typeof tryGetKoffi>>

interface RecvApi {
  initialize: () => boolean
  destroy: () => void
  recvCreate: (settings: {
    source_to_connect_to: { p_ndi_name: string; p_url_address: null }
    color_format: number
    bandwidth: number
    allow_video_fields: boolean
    p_ndi_recv_name: string
  }) => unknown
  recvCapture: {
    async: (
      instance: unknown,
      video: unknown,
      audio: null,
      metadata: null,
      timeoutMs: number,
      callback: (err: unknown, kind: unknown) => void
    ) => void
  }
  recvFreeVideo: (instance: unknown, video: unknown) => void
  recvDestroy: (instance: unknown) => void
  videoFrameType: unknown
}

interface DecodedVideoFrame {
  kind: number
  xres: number
  yres: number
  FourCC: number
  p_data: unknown
  line_stride_in_bytes: number
}

export interface NdiMjpegRelayHandle {
  url: string
  stop: () => void
}

interface RelayOptions {
  libraryPath: string
  runtimePath: string
  sourceName: string
  fps: number
  relayId: string
}

let cachedLibraryPath = ''
let cachedApi: RecvApi | null = null
let copyMemory: ((dest: Buffer, src: unknown, length: number) => void) | null =
  null

function getCopyMemory(koffi: KoffiModule) {
  if (copyMemory) {
    return copyMemory
  }
  const kernel32 = koffi.load('kernel32.dll')
  copyMemory = kernel32.func(
    'void RtlMoveMemory(void * Destination, const void * Source, size_t Length)'
  ) as (dest: Buffer, src: unknown, length: number) => void
  return copyMemory
}

function getRecvApi(koffi: KoffiModule, libraryPath: string) {
  if (cachedApi && cachedLibraryPath === libraryPath) {
    return cachedApi
  }
  const registered = ensureNdiSdkStructs(koffi)
  const lib = koffi.load(libraryPath)
  const api: RecvApi = {
    initialize: lib.func('bool NDIlib_initialize(void)') as RecvApi['initialize'],
    destroy: lib.func('void NDIlib_destroy(void)') as RecvApi['destroy'],
    recvCreate: lib.func(
      'void * NDIlib_recv_create_v3(const NDIlib_recv_create_v3_t * settings)'
    ) as RecvApi['recvCreate'],
    recvCapture: lib.func(
      'int NDIlib_recv_capture_v2(void * instance, NDIlib_video_frame_v2_t * video, void * audio, void * metadata, uint32_t timeout)'
    ) as RecvApi['recvCapture'],
    recvFreeVideo: lib.func(
      'void NDIlib_recv_free_video_v2(void * instance, const NDIlib_video_frame_v2_t * video)'
    ) as RecvApi['recvFreeVideo'],
    recvDestroy: lib.func(
      'void NDIlib_recv_destroy(void * instance)'
    ) as RecvApi['recvDestroy'],
    videoFrameType: registered.videoFrameType,
  }
  cachedLibraryPath = libraryPath
  cachedApi = api
  return api
}

function allocFrame(koffi: KoffiModule, videoFrameType: unknown) {
  const runtime = koffi as KoffiModule & {
    alloc: (type: unknown, count: number) => unknown
  }
  return runtime.alloc(videoFrameType, 1)
}

/**
 * Receives one NDI 6 source and serves it as an MJPEG stream the visualizer
 * already displays with an image element.
 */
export async function startNdiMjpegRelay(
  options: RelayOptions
): Promise<NdiMjpegRelayHandle> {
  const relay = new NdiMjpegRelay(options)
  const url = await relay.open()
  return {
    url,
    stop: () => relay.stop(),
  }
}

class NdiMjpegRelay {
  private readonly sourceName: string
  private readonly fps: number
  private readonly relayId: string
  private readonly libraryPath: string
  private readonly runtimePath: string
  private koffi: KoffiModule | null = null
  private api: RecvApi | null = null
  private recv: unknown = null
  private framePtr: unknown = null
  private server: Server | null = null
  private readonly clients = new Set<ServerResponse>()
  private latestJpeg: Buffer | null = null
  private url = ''
  private running = false
  private initialized = false
  private cleaned = false
  private serverClosed = false
  private loggedFrame = false
  private loggedFormat = false

  constructor(options: RelayOptions) {
    this.sourceName = options.sourceName
    this.fps = options.fps
    this.relayId = options.relayId
    this.libraryPath = options.libraryPath
    this.runtimePath = options.runtimePath
  }

  async open() {
    const koffi = tryGetKoffi()
    if (koffi === null) {
      throw new Error('NDI receive needs the native helper module, which failed to load.')
    }
    this.koffi = koffi
    applyNdiRuntimeEnv(this.runtimePath)
    this.api = getRecvApi(koffi, this.libraryPath)
    try {
      if (!this.api.initialize()) {
        throw new Error('NDI runtime failed to initialize')
      }
      this.initialized = true
      this.recv = this.api.recvCreate({
        source_to_connect_to: {
          p_ndi_name: this.sourceName,
          p_url_address: null,
        },
        color_format: NDI_COLOR_BGRX_BGRA,
        bandwidth: NDI_BANDWIDTH_HIGHEST,
        allow_video_fields: false,
        p_ndi_recv_name: 'Captivate',
      })
      if (!this.recv) {
        throw new Error(`NDI source "${this.sourceName}" could not be opened`)
      }
      this.framePtr = allocFrame(koffi, this.api.videoFrameType)
      this.url = await this.listen()
      this.running = true
      void this.run()
      return this.url
    } catch (err) {
      this.cleanupSdk()
      throw err
    }
  }

  stop() {
    this.running = false
    this.closeServer()
  }

  private listen() {
    const server = createServer((req, res) => {
      const path = (req.url || '').split('?')[0]
      if (path !== `/${this.relayId}.mjpg`) {
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
        this.writeFrame(res, this.latestJpeg)
      }
      res.on('close', () => {
        this.clients.delete(res)
      })
    })
    server.timeout = 0
    server.requestTimeout = 0
    server.on('error', (err) => {
      console.error('[ndi-relay] http server error', err)
    })
    this.server = server
    return new Promise<string>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        if (address === null || typeof address === 'string') {
          reject(new Error('NDI relay failed to listen'))
          return
        }
        resolve(`http://127.0.0.1:${address.port}/${this.relayId}.mjpg`)
      })
    })
  }

  private async run() {
    const intervalMs = Math.max(1, Math.round(1000 / this.fps))
    try {
      while (this.running) {
        const started = Date.now()
        let frame: DecodedVideoFrame | null = null
        try {
          frame = await this.capture(500)
        } catch (err) {
          if (!this.running) break
          console.error('[ndi-relay] capture failed', err)
          await sleep(200)
          continue
        }
        if (!this.running) {
          if (frame?.kind === NDI_FRAME_VIDEO) this.freeVideo()
          break
        }
        if (!frame || frame.kind !== NDI_FRAME_VIDEO) {
          continue
        }
        try {
          const jpeg = this.toJpeg(frame)
          if (jpeg) {
            this.latestJpeg = jpeg
            this.publish(jpeg)
          }
        } catch (err) {
          console.error('[ndi-relay] frame encode failed', err)
        } finally {
          this.freeVideo()
        }
        const remaining = intervalMs - (Date.now() - started)
        if (remaining > 5 && this.running) {
          await sleep(remaining)
        }
      }
    } finally {
      this.cleanupSdk()
    }
  }

  private capture(timeoutMs: number) {
    const api = this.api
    const koffi = this.koffi
    const recv = this.recv
    const framePtr = this.framePtr
    if (!api || !koffi || !recv || !framePtr) {
      return Promise.reject(new Error('NDI receiver is not open'))
    }
    return new Promise<DecodedVideoFrame>((resolve, reject) => {
      api.recvCapture.async(
        recv,
        framePtr,
        null,
        null,
        timeoutMs,
        (err, kind) => {
          if (err) {
            reject(err)
            return
          }
          const decoded = koffi.decode(
            framePtr,
            api.videoFrameType as never
          ) as Omit<DecodedVideoFrame, 'kind'>
          resolve({
            kind: Number(kind),
            xres: Number(decoded.xres) || 0,
            yres: Number(decoded.yres) || 0,
            FourCC: Number(decoded.FourCC) >>> 0,
            p_data: decoded.p_data,
            line_stride_in_bytes: Number(decoded.line_stride_in_bytes) || 0,
          })
        }
      )
    })
  }

  private toJpeg(frame: DecodedVideoFrame) {
    const width = frame.xres
    const height = frame.yres
    const stride = frame.line_stride_in_bytes
    const rowBytes = width * 4
    if (
      !frame.p_data ||
      width <= 0 ||
      height <= 0 ||
      width > MAX_FRAME_DIMENSION ||
      height > MAX_FRAME_DIMENSION ||
      stride < rowBytes
    ) {
      return null
    }
    if (frame.FourCC !== FOURCC_BGRA && frame.FourCC !== FOURCC_BGRX) {
      if (!this.loggedFormat) {
        this.loggedFormat = true
        console.warn(
          `[ndi-relay] unsupported pixel format ${fourccString(frame.FourCC)} from "${this.sourceName}"`
        )
      }
      return null
    }
    const koffi = this.koffi
    if (!koffi) return null
    const byteCount = stride * height
    const copied = Buffer.allocUnsafe(byteCount)
    getCopyMemory(koffi)(copied, frame.p_data, byteCount)
    const packed = packBgra(copied, width, height, stride, true)
    let image = nativeImage.createFromBitmap(packed, { width, height })
    if (image.isEmpty()) return null
    if (width > MAX_FRAME_WIDTH) {
      image = image.resize({ width: MAX_FRAME_WIDTH })
    }
    const jpeg = image.toJPEG(JPEG_QUALITY)
    if (!this.loggedFrame) {
      this.loggedFrame = true
      console.info(
        `[ndi-relay] receiving "${this.sourceName}" ${width}x${height}`
      )
    }
    return jpeg
  }

  private publish(jpeg: Buffer) {
    for (const client of this.clients) {
      if (client.destroyed || client.writableEnded) {
        this.clients.delete(client)
        continue
      }
      this.writeFrame(client, jpeg)
    }
  }

  private writeFrame(client: ServerResponse, jpeg: Buffer) {
    try {
      client.write(
        `--${BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpeg.length}\r\n\r\n`
      )
      client.write(jpeg)
      client.write('\r\n')
    } catch (_err) {
      this.clients.delete(client)
    }
  }

  private freeVideo() {
    if (!this.api || !this.recv || !this.framePtr) return
    try {
      this.api.recvFreeVideo(this.recv, this.framePtr)
    } catch (_err) {}
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

  private cleanupSdk() {
    if (this.cleaned) return
    this.cleaned = true
    this.running = false
    this.closeServer()
    if (this.api && this.recv) {
      try {
        this.api.recvDestroy(this.recv)
      } catch (_err) {}
    }
    this.recv = null
    if (this.api && this.initialized) {
      try {
        this.api.destroy()
      } catch (_err) {}
    }
    this.initialized = false
  }
}

function packBgra(
  source: Buffer,
  width: number,
  height: number,
  stride: number,
  forceOpaque: boolean
) {
  const rowBytes = width * 4
  const packed =
    stride === rowBytes ? source : Buffer.allocUnsafe(rowBytes * height)
  if (stride !== rowBytes) {
    for (let y = 0; y < height; y++) {
      source.copy(packed, y * rowBytes, y * stride, y * stride + rowBytes)
    }
  }
  if (forceOpaque) {
    for (let i = 3; i < packed.length; i += 4) {
      packed[i] = 255
    }
  }
  return packed
}

function fourccString(value: number) {
  return String.fromCharCode(
    value & 255,
    (value >> 8) & 255,
    (value >> 16) & 255,
    (value >> 24) & 255
  )
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}
