import { app } from 'electron'
import { readAppSettings } from './appSettingsStorage'
import type { GpuAccelerationMode } from '../shared/appSettings'
import { reportDiagnostic } from './diagnostics'

/**
 * Chromium/Electron GPU switches must be applied before `app.whenReady()`.
 * Call once at process start from the primary instance.
 */
export function applyGpuAccelerationFlags(): GpuAccelerationMode {
  let mode: GpuAccelerationMode = 'default'
  try {
    mode = readAppSettings().gpuAccelerationMode
  } catch (err) {
    console.warn('Could not read GPU acceleration setting; using default.', err)
  }

  if (mode === 'off') {
    app.disableHardwareAcceleration()
    app.commandLine.appendSwitch('disable-gpu')
    app.commandLine.appendSwitch('disable-gpu-compositing')
  } else if (mode === 'force') {
    // Help machines stuck on the GPU blocklist / broken ANGLE defaults.
    app.commandLine.appendSwitch('ignore-gpu-blocklist')
    app.commandLine.appendSwitch('enable-gpu-rasterization')
    app.commandLine.appendSwitch('enable-zero-copy')
    app.commandLine.appendSwitch('disable-software-rasterizer')
    // Prefer discrete GPU on multi-adapter Windows laptops when available.
    if (process.platform === 'win32') {
      app.commandLine.appendSwitch('force_high_performance_gpu')
    }
  }

  reportDiagnostic({
    source: 'main',
    area: 'app',
    event: 'gpu-acceleration-flags',
    level: 'info',
    message: `GPU acceleration mode: ${mode}`,
    data: { mode },
  })

  return mode
}
