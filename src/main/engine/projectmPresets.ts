import { spawn } from 'child_process'
import { app } from 'electron'
import { existsSync, promises as fs } from 'fs'
import https from 'https'
import os from 'os'
import path from 'path'

/** Official projectM preset collection. Shipped with release builds and installed into user data when a copy is missing. */
export const PROJECTM_PRESET_PACK_URL =
  'https://github.com/projectM-visualizer/presets-cream-of-the-crop/archive/refs/heads/master.zip'

const PRESET_PACK_MARKER = '.captivate-preset-pack'

export interface ProjectMPresetPackResult {
  ok: boolean
  downloaded: boolean
  directory: string | null
  message: string
}

let inflightInstall: Promise<ProjectMPresetPackResult> | null = null

export function getUserDataProjectMPresetDirectory() {
  return path.join(app.getPath('userData'), 'projectm', 'presets')
}

export function getBundledProjectMPresetDirectories() {
  const candidates: string[] = []
  if (app.isPackaged) {
    candidates.push(path.join(process.resourcesPath, 'assets', 'projectm-presets'))
  } else {
    for (const root of collectDevProjectRoots()) {
      candidates.push(path.join(root, 'assets', 'projectm-presets'))
    }
  }
  return candidates.filter((candidate) => existsSync(candidate))
}

export function ensureProjectMPresetPack() {
  if (inflightInstall === null) {
    inflightInstall = installPresetPackIfMissing().finally(() => {
      inflightInstall = null
    })
  }
  return inflightInstall
}

async function installPresetPackIfMissing(): Promise<ProjectMPresetPackResult> {
  const userDataDir = getUserDataProjectMPresetDirectory()
  const existing = [userDataDir, ...getBundledProjectMPresetDirectories()]
  for (const directory of existing) {
    if (await directoryHasPresetFile(directory)) {
      return {
        ok: true,
        downloaded: false,
        directory,
        message: 'projectM preset pack is already installed.',
      }
    }
  }

  const temporaryRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), 'captivate-projectm-presets-')
  )
  try {
    const archivePath = path.join(temporaryRoot, 'presets.zip')
    const extractDir = path.join(temporaryRoot, 'extract')
    await downloadToFile(PROJECTM_PRESET_PACK_URL, archivePath)
    await extractZip(archivePath, extractDir)
    const packRoot = await findExtractedPresetRoot(extractDir)
    if (packRoot === null) {
      return {
        ok: false,
        downloaded: false,
        directory: null,
        message: 'projectM preset archive downloaded, but it contained no .milk presets.',
      }
    }
    await fs.rm(userDataDir, { recursive: true, force: true })
    await fs.cp(packRoot, userDataDir, { recursive: true })
    await fs.writeFile(
      path.join(userDataDir, PRESET_PACK_MARKER),
      PROJECTM_PRESET_PACK_URL,
      'utf8'
    )
    return {
      ok: true,
      downloaded: true,
      directory: userDataDir,
      message: 'projectM preset pack installed.',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      downloaded: false,
      directory: null,
      message: `projectM preset pack could not be installed. ${message}`,
    }
  } finally {
    try {
      await fs.rm(temporaryRoot, { recursive: true, force: true })
    } catch (_error) {
      // Ignore temp cleanup failures.
    }
  }
}

function collectDevProjectRoots() {
  const roots: string[] = []
  const seen = new Set<string>()
  for (const seed of [process.cwd(), __dirname]) {
    let current = path.resolve(seed)
    for (let depth = 0; depth < 8; depth++) {
      const key = current.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        const presetsDir = path.join(current, 'assets', 'projectm-presets')
        const runtimeDir = path.join(current, 'assets', 'projectm-runtime')
        if (existsSync(presetsDir) || existsSync(runtimeDir)) {
          roots.push(current)
        }
      }
      const parent = path.dirname(current)
      if (parent === current) break
      current = parent
    }
  }
  return roots
}

async function directoryHasPresetFile(root: string) {
  if (!existsSync(root)) return false
  const stack = [root]
  let visited = 0
  while (stack.length > 0 && visited < 500) {
    const current = stack.pop()
    if (!current) continue
    let entries
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch (_error) {
      continue
    }
    for (const entry of entries) {
      visited += 1
      const fullPath = path.join(current, entry.name)
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.milk')) {
        return true
      }
      if (entry.isDirectory() && entry.name !== '.git' && entry.name !== 'node_modules') {
        stack.push(fullPath)
      }
    }
  }
  return false
}

async function findExtractedPresetRoot(extractDir: string) {
  if (await directoryHasPresetFile(extractDir)) {
    const entries = await fs.readdir(extractDir, { withFileTypes: true })
    const onlyDir =
      entries.length === 1 && entries[0].isDirectory()
        ? path.join(extractDir, entries[0].name)
        : null
    if (onlyDir !== null && (await directoryHasPresetFile(onlyDir))) {
      return onlyDir
    }
    return extractDir
  }
  return null
}

function downloadToFile(url: string, destination: string) {
  return downloadToBuffer(url).then((data) => fs.writeFile(destination, data))
}

function downloadToBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          Accept: 'application/octet-stream',
          'User-Agent': `Captivate/${app.getVersion()}`,
        },
      },
      (response) => {
        const statusCode = response.statusCode ?? 0
        const redirect = response.headers.location
        if (
          statusCode >= 300 &&
          statusCode < 400 &&
          typeof redirect === 'string' &&
          redirect.length > 0
        ) {
          response.resume()
          downloadToBuffer(new URL(redirect, url).toString()).then(resolve).catch(reject)
          return
        }
        if (statusCode < 200 || statusCode >= 300) {
          response.resume()
          reject(new Error(`HTTP ${statusCode} while requesting ${url}`))
          return
        }
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        })
        response.once('error', reject)
        response.once('end', () => resolve(Buffer.concat(chunks)))
      }
    )
    request.once('error', reject)
  })
}

function extractZip(archivePath: string, destination: string) {
  return fs.mkdir(destination, { recursive: true }).then(() => {
    if (process.platform === 'win32') {
      return runCommand('tar', ['-xf', archivePath, '-C', destination]).catch(() =>
        runCommand('powershell', [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${destination.replace(/'/g, "''")}' -Force`,
        ])
      )
    }
    return runCommand('unzip', ['-q', archivePath, '-d', destination]).catch(() =>
      runCommand('tar', ['-xf', archivePath, '-C', destination])
    )
  })
}

function runCommand(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: 'ignore',
    })
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${command} exited with code ${code}`))
    })
  })
}
