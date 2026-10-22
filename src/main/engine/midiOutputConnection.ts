import { Output } from 'midi'
import {
  MidiOutConnections,
  ConnectionId,
  MidiDevice_t,
} from '../../shared/connection'

export type UpdatePayload = MidiOutConnections

interface Config {
  update_ms: number
  onUpdate: (status: UpdatePayload) => void
  getConnectable: () => ConnectionId[]
}

const refOutput = new Output()
const outputs: Outputs = {}
type Outputs = { [portName: string]: Output }

let maintainInterval: ReturnType<typeof setInterval> | null = null

export function maintain(config: Config) {
  if (maintainInterval !== null) {
    clearInterval(maintainInterval)
    maintainInterval = null
  }
  maintainInterval = setInterval(() => {
    updateOutputs(config)
  }, config.update_ms)
  updateOutputs(config)
}

export function shutdownMidiOut(): void {
  if (maintainInterval !== null) {
    clearInterval(maintainInterval)
    maintainInterval = null
  }
  for (const portName of Object.keys(outputs)) {
    try {
      outputs[portName]?.closePort()
    } catch {
      /* ignore */
    }
    delete outputs[portName]
  }
}

export function sendToAllOpenOutputs(message: number[]): void {
  for (const portName of Object.keys(outputs)) {
    const out = outputs[portName]
    if (!out) continue
    try {
      if (out.isPortOpen()) {
        out.sendMessage(message)
      }
    } catch {
      /* ignore per-port failures */
    }
  }
}

export function hasOpenOutput(): boolean {
  for (const portName of Object.keys(outputs)) {
    try {
      if (outputs[portName]?.isPortOpen()) return true
    } catch {
      /* ignore */
    }
  }
  return false
}

function updateOutputs(config: Config) {
  const portCount = refOutput.getPortCount()
  const available: MidiDevice_t[] = []
  const connected: ConnectionId[] = []
  const connectable = config.getConnectable()

  for (let i = 0; i < portCount; i++) {
    const portName = refOutput.getPortName(i)
    available.push({
      connectionId: portName,
      name: portName,
    })
    if (outputs[portName] === undefined) {
      if (connectable.find((c) => c === portName)) {
        outputs[portName] = newOutput(i)
      }
    }
  }

  for (const oldPortName in outputs) {
    if (!available.find((d) => d.name === oldPortName)) {
      try {
        outputs[oldPortName]?.closePort()
      } catch {
        /* ignore */
      }
      delete outputs[oldPortName]
    }
    if (!connectable.find((c) => c === oldPortName)) {
      try {
        outputs[oldPortName]?.closePort()
      } catch {
        /* ignore */
      }
      delete outputs[oldPortName]
    }
  }

  for (const portName in outputs) {
    connected.push(portName)
  }

  config.onUpdate({
    available,
    connected,
  })
}

function newOutput(index: number) {
  const output = new Output()
  output.openPort(index)
  return output
}
