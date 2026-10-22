import { useCallback, useEffect, useState } from 'react'
import styled from 'styled-components'
import {
  heliosConnectDevice,
  heliosDisconnectDevice,
  heliosGetStatus,
  heliosScanDevices,
  heliosSendTestPattern,
  heliosSetArmed,
} from '../ipcHandler'
import {
  emptyHeliosStatus,
  type HeliosDeviceChoice,
  type HeliosStatus,
} from '../../shared/heliosOutput'
import type { HeliosTraceEffect } from './traceVisualizerFrame'

export interface HeliosTraceConfig {
  enabled: boolean
  effect: HeliosTraceEffect
  armed: boolean
}

export default function HeliosOutputPanel({
  onTraceConfig,
}: {
  onTraceConfig?: (config: HeliosTraceConfig) => void
}) {
  const [status, setStatus] = useState<HeliosStatus>(emptyHeliosStatus())
  const [devices, setDevices] = useState<HeliosDeviceChoice[]>([])
  const [scanError, setScanError] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [traceEnabled, setTraceEnabled] = useState(false)
  const [traceEffect, setTraceEffect] = useState<HeliosTraceEffect>('edges')

  useEffect(() => {
    onTraceConfig?.({
      enabled: traceEnabled,
      effect: traceEffect,
      armed: status.armed,
    })
  }, [onTraceConfig, status.armed, traceEffect, traceEnabled])

  const refresh = useCallback(async () => {
    const next = await heliosGetStatus()
    setStatus(next)
    return next
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const onScan = async () => {
    setBusy(true)
    try {
      const scan = await heliosScanDevices()
      setDevices(scan.devices)
      setScanError(scan.error ?? (scan.devices.length === 0 ? 'No Helios found' : null))
      if (scan.devices.length > 0) {
        setSelectedIndex(scan.devices[0]!.index)
      }
    } finally {
      setBusy(false)
    }
  }

  const onConnect = async () => {
    setBusy(true)
    try {
      if (status.connected) {
        setStatus(await heliosDisconnectDevice())
        return
      }
      setStatus(await heliosConnectDevice(selectedIndex))
    } finally {
      setBusy(false)
    }
  }

  const onArm = async () => {
    setBusy(true)
    try {
      setStatus(await heliosSetArmed(!status.armed))
    } finally {
      setBusy(false)
    }
  }

  const onTest = async () => {
    setBusy(true)
    try {
      setStatus(await heliosSendTestPattern())
    } finally {
      setBusy(false)
    }
  }

  const message = status.lastError ?? scanError

  return (
    <Panel>
      <Title>Helios</Title>
      <Row>
        <Select
          value={String(selectedIndex)}
          disabled={busy || status.connected || devices.length === 0}
          onChange={(event) => setSelectedIndex(Number(event.target.value))}
        >
          {devices.length === 0 ? (
            <option value="0">No device</option>
          ) : (
            devices.map((device) => (
              <option key={device.index} value={String(device.index)}>
                {device.label}
              </option>
            ))
          )}
        </Select>
        <Btn type="button" disabled={busy} onClick={() => void onScan()}>
          Scan
        </Btn>
        <Btn type="button" disabled={busy} onClick={() => void onConnect()}>
          {status.connected ? 'Disconnect' : 'Connect'}
        </Btn>
      </Row>
      <Row>
        <Btn
          type="button"
          $on={status.armed}
          disabled={busy || !status.connected}
          onClick={() => void onArm()}
        >
          {status.armed ? 'Armed' : 'Disarmed'}
        </Btn>
        <Btn
          type="button"
          disabled={busy || !status.connected || !status.armed}
          onClick={() => void onTest()}
        >
          Test pattern
        </Btn>
      </Row>
      <Row>
        <Btn
          type="button"
          $on={traceEnabled}
          disabled={busy}
          onClick={() => setTraceEnabled((current) => !current)}
        >
          {traceEnabled ? 'Trace on' : 'Trace off'}
        </Btn>
        <Select
          value={traceEffect}
          disabled={busy}
          onChange={(event) =>
            setTraceEffect(event.target.value === 'dots' ? 'dots' : 'edges')
          }
        >
          <option value="edges">Edge trace</option>
          <option value="dots">Dot sample</option>
        </Select>
      </Row>
      <Hint>
        {status.connected
          ? status.armed
            ? `Output armed${status.sendingTestPattern ? ' · test pattern' : ''}. Trace does not arm the DAC.`
            : 'Connected. Output is blank until you arm. Trace does not arm the DAC.'
          : 'One DAC. Output stays off until you arm. Trace does not arm the DAC.'}
      </Hint>
      {message ? <ErrorText>{message}</ErrorText> : null}
    </Panel>
  )
}

const Panel = styled.div`
  position: absolute;
  right: 1rem;
  bottom: 0.85rem;
  z-index: 6;
  width: 18.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.45rem 0.5rem;
  border: 1px solid #ffffff3a;
  border-radius: 0.35rem;
  background: #0f1726ee;
  color: #dbe8ff;
`

const Title = styled.div`
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
`

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 0.3rem;
`

const Select = styled.select`
  flex: 1 1 auto;
  min-width: 0;
  border: 1px solid #ffffff3a;
  background: #0f1724;
  color: #dbe8ff;
  border-radius: 0.28rem;
  padding: 0.2rem 0.35rem;
  font-size: 0.68rem;
`

const Btn = styled.button<{ $on?: boolean }>`
  border: 1px solid ${(p) => (p.$on ? '#67d4ff' : '#ffffff3a')};
  background: ${(p) => (p.$on ? '#12394a' : '#0f1724cc')};
  color: #dbe8ff;
  border-radius: 0.28rem;
  padding: 0.2rem 0.44rem;
  font-size: 0.68rem;
  cursor: pointer;
  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
`

const Hint = styled.div`
  font-size: 0.64rem;
  color: #b7c6e4;
`

const ErrorText = styled.div`
  font-size: 0.64rem;
  color: #ffb4b4;
`
