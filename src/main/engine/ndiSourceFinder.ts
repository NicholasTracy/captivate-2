import { existsSync } from 'fs'
import { NdiSourceList } from 'shared/visualizerStreaming'
import { tryGetKoffi } from './koffiNative'
import { ensureNdiSdkStructs } from './ndiSdk'

const SCAN_DEADLINE_MS = 5000
const SCAN_MIN_MS = 1500
const SCAN_STABLE_MS = 800
const SCAN_POLL_MS = 400

type KoffiModule = NonNullable<ReturnType<typeof tryGetKoffi>>

interface NdiFindApi {
  initialize: () => boolean
  destroy: () => void
  findCreate: (settings: {
    show_local_sources: boolean
    p_groups: null
    p_extra_ips: null
  }) => unknown
  findWait: {
    async: (
      instance: unknown,
      timeoutMs: number,
      callback: (err: unknown, changed: unknown) => void
    ) => void
  }
  findGet: (instance: unknown, count: Array<number | null>) => unknown
  findDestroy: (instance: unknown) => void
  sourceType: unknown
}

let cachedLibraryPath = ''
let cachedApi: NdiFindApi | null = null

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err)
}

function getApi(koffi: KoffiModule, libraryPath: string) {
  if (cachedApi && cachedLibraryPath === libraryPath) {
    return cachedApi
  }
  const registeredSourceType = ensureNdiSdkStructs(koffi).sourceType
  const lib = koffi.load(libraryPath)
  const api: NdiFindApi = {
    initialize: lib.func('bool NDIlib_initialize(void)') as NdiFindApi['initialize'],
    destroy: lib.func('void NDIlib_destroy(void)') as NdiFindApi['destroy'],
    findCreate: lib.func(
      'void * NDIlib_find_create_v2(const NDIlib_find_create_t * settings)'
    ) as NdiFindApi['findCreate'],
    findWait: lib.func(
      'bool NDIlib_find_wait_for_sources(void * instance, uint32_t timeout)'
    ) as NdiFindApi['findWait'],
    findGet: lib.func(
      'void * NDIlib_find_get_current_sources(void * instance, _Out_ uint32_t * count)'
    ) as NdiFindApi['findGet'],
    findDestroy: lib.func(
      'void NDIlib_find_destroy(void * instance)'
    ) as NdiFindApi['findDestroy'],
    sourceType: registeredSourceType,
  }
  cachedLibraryPath = libraryPath
  cachedApi = api
  return api
}

function readSourceNames(koffi: KoffiModule, api: NdiFindApi, find: unknown) {
  const count: Array<number | null> = [null]
  const ptr = api.findGet(find, count)
  const found = count[0]
  if (typeof found !== 'number' || found <= 0 || found > 256 || !ptr) {
    return []
  }
  const decoded = koffi.decode(
    ptr,
    koffi.array(api.sourceType as never, found)
  ) as Array<{ p_ndi_name?: string | null }>
  const seen = new Set<string>()
  const names: string[] = []
  for (const row of decoded) {
    const name = typeof row?.p_ndi_name === 'string' ? row.p_ndi_name.trim() : ''
    if (name.length === 0 || seen.has(name)) continue
    seen.add(name)
    names.push(name)
  }
  names.sort((a, b) => a.localeCompare(b))
  return names
}

function waitForSources(api: NdiFindApi, find: unknown, timeoutMs: number) {
  return new Promise<void>((resolve, reject) => {
    api.findWait.async(find, timeoutMs, (err) => {
      if (err) {
        reject(err)
        return
      }
      resolve()
    })
  })
}

async function collectSources(koffi: KoffiModule, api: NdiFindApi, find: unknown) {
  const started = Date.now()
  const deadline = started + SCAN_DEADLINE_MS
  let sources = readSourceNames(koffi, api, find)
  let signature = sources.join('\n')
  let stableSince = started

  while (Date.now() < deadline) {
    const remaining = deadline - Date.now()
    const timeout = Math.min(SCAN_POLL_MS, Math.max(1, remaining))
    await waitForSources(api, find, timeout)
    const next = readSourceNames(koffi, api, find)
    const nextSignature = next.join('\n')
    if (nextSignature !== signature) {
      sources = next
      signature = nextSignature
      stableSince = Date.now()
    }
    const elapsed = Date.now() - started
    if (
      sources.length > 0 &&
      elapsed >= SCAN_MIN_MS &&
      Date.now() - stableSince >= SCAN_STABLE_MS
    ) {
      break
    }
  }

  return sources
}

/**
 * Lists NDI sources through the installed NDI runtime.
 * Includes senders on this computer (OBS, Test Patterns) and sources on the LAN.
 * Does not call the runtime's process-wide shutdown if initialization failed.
 */
export async function listNdiSourcesNative(
  libraryPath: string
): Promise<NdiSourceList> {
  const koffi = tryGetKoffi()
  if (koffi === null) {
    return {
      sources: [],
      error: 'NDI scan needs the native helper module, which failed to load.',
    }
  }
  if (!existsSync(libraryPath)) {
    return { sources: [], error: 'NDI runtime library was not found.' }
  }

  let api: NdiFindApi
  try {
    api = getApi(koffi, libraryPath)
  } catch (err) {
    return { sources: [], error: errorMessage(err) }
  }

  let initialized = false
  let find: unknown = null
  try {
    if (!api.initialize()) {
      return { sources: [], error: 'NDI runtime failed to initialize.' }
    }
    initialized = true
    find = api.findCreate({
      show_local_sources: true,
      p_groups: null,
      p_extra_ips: null,
    })
    if (!find) {
      return { sources: [], error: 'NDI source finder failed to start.' }
    }
    const sources = await collectSources(koffi, api, find)
    return { sources, error: '' }
  } catch (err) {
    return { sources: [], error: errorMessage(err) }
  } finally {
    if (find) {
      try {
        api.findDestroy(find)
      } catch (_err) {}
    }
    if (initialized) {
      try {
        api.destroy()
      } catch (_err) {}
    }
  }
}
