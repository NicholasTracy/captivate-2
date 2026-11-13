const { spawn } = require('child_process')
const fs = require('fs')
const https = require('https')
const os = require('os')
const path = require('path')

const PRESET_PACK_URL =
  'https://github.com/projectM-visualizer/presets-cream-of-the-crop/archive/refs/heads/master.zip'

const repoRoot = path.resolve(__dirname, '..')
const destinationDir = path.join(repoRoot, 'assets', 'projectm-presets')

const shouldBuild =
  process.env.CAPTIVATE_BUILD_PROJECTM_RUNTIME === '1' ||
  process.env.CAPTIVATE_BUILD_PROJECTM_RUNTIME === 'true' ||
  process.env.CI === 'true'

const allowSkip =
  process.env.CAPTIVATE_SKIP_PROJECTM_RUNTIME === '1' ||
  process.env.CAPTIVATE_SKIP_PROJECTM_RUNTIME === 'true'

const allowFallback =
  process.env.CAPTIVATE_ALLOW_PROJECTM_RUNTIME_FALLBACK === '1' ||
  process.env.CAPTIVATE_ALLOW_PROJECTM_RUNTIME_FALLBACK === 'true'

if (allowSkip) {
  console.log(
    '[captivate] Skipping projectM preset staging (CAPTIVATE_SKIP_PROJECTM_RUNTIME).'
  )
  process.exit(0)
}

if (!shouldBuild) {
  console.log(
    '[captivate] Skipping projectM preset staging. Set CAPTIVATE_BUILD_PROJECTM_RUNTIME=1 for release bundles.'
  )
  process.exit(0)
}

function download(url, destination) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          Accept: 'application/octet-stream',
          'User-Agent': 'Captivate-preset-staging',
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
          download(new URL(redirect, url).toString(), destination).then(resolve).catch(reject)
          return
        }
        if (statusCode < 200 || statusCode >= 300) {
          response.resume()
          reject(new Error(`HTTP ${statusCode} while requesting ${url}`))
          return
        }
        const file = fs.createWriteStream(destination)
        response.pipe(file)
        file.once('finish', () => file.close(resolve))
        file.once('error', reject)
      }
    )
    request.once('error', reject)
  })
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      const detail = stderr.trim()
      reject(new Error(detail ? `${command} exited with code ${code}: ${detail}` : `${command} exited with code ${code}`))
    })
  })
}

async function extractZip(archivePath, extractDir) {
  const header = Buffer.alloc(2)
  const fd = fs.openSync(archivePath, 'r')
  try {
    fs.readSync(fd, header, 0, 2, 0)
  } finally {
    fs.closeSync(fd)
  }
  const size = fs.statSync(archivePath).size
  if (header.toString() !== 'PK') {
    throw new Error(`Downloaded preset pack is not a zip (${size} bytes).`)
  }
  const attempts =
    process.platform === 'win32'
      ? [['tar', ['-xf', archivePath, '-C', extractDir]]]
      : [
          ['unzip', ['-q', archivePath, '-d', extractDir]],
          ['tar', ['-xf', archivePath, '-C', extractDir]],
        ]
  const errors = []
  for (const [command, args] of attempts) {
    try {
      await run(command, args)
      return
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }
  throw new Error(`Could not extract preset pack (${size} bytes): ${errors.join('; ')}`)
}

function hasMilk(root, limit = 500) {
  if (!fs.existsSync(root)) return false
  const stack = [root]
  let visited = 0
  while (stack.length > 0 && visited < limit) {
    const current = stack.pop()
    let entries
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch (_error) {
      continue
    }
    for (const entry of entries) {
      visited += 1
      const fullPath = path.join(current, entry.name)
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.milk')) {
        return true
      }
      if (entry.isDirectory() && entry.name !== '.git') {
        stack.push(fullPath)
      }
    }
  }
  return false
}

async function main() {
  if (hasMilk(destinationDir)) {
    console.log(`[captivate] projectM presets already staged at ${destinationDir}.`)
    return
  }

  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'captivate-projectm-presets-'))
  try {
    const archivePath = path.join(temporaryRoot, 'presets.zip')
    const extractDir = path.join(temporaryRoot, 'extract')
    fs.mkdirSync(extractDir, { recursive: true })
    console.log('[captivate] Downloading projectM preset pack...')
    await download(PRESET_PACK_URL, archivePath)
    await extractZip(archivePath, extractDir)
    const entries = fs.readdirSync(extractDir, { withFileTypes: true })
    const packRoot =
      entries.length === 1 && entries[0].isDirectory()
        ? path.join(extractDir, entries[0].name)
        : extractDir
    if (!hasMilk(packRoot)) {
      throw new Error('Preset archive did not contain any .milk files.')
    }
    fs.rmSync(destinationDir, { recursive: true, force: true })
    fs.cpSync(packRoot, destinationDir, { recursive: true })
    fs.writeFileSync(
      path.join(destinationDir, '.captivate-preset-pack'),
      PRESET_PACK_URL,
      'utf8'
    )
    console.log(`[captivate] projectM presets staged at ${destinationDir}.`)
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  if (allowFallback) {
    console.warn(
      `[captivate] projectM preset staging failed (${message}). Continuing without bundled presets due to CAPTIVATE_ALLOW_PROJECTM_RUNTIME_FALLBACK.`
    )
    process.exit(0)
  }
  console.error(`[captivate] projectM preset staging failed: ${message}`)
  process.exit(1)
})
