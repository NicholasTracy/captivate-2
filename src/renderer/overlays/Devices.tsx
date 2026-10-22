import type { ReactNode } from 'react'
import styled from 'styled-components'
import { useControlSelector, useTypedSelector } from '../redux/store'
import { setConnectionsMenu } from '../redux/guiSlice'
import { useDispatch } from 'react-redux'
import {
  setDmxConnectable,
  setMidiConnectable,
  setMidiOutConnectable,
  setMidiClockBpmEnabled,
  setMidiClockOutEnabled,
  setOscEnabled,
  setOscPort,
  setOscSendEnabled,
  setOscSendHost,
  setOscSendPort,
  setLinkRole,
  setOpenDmxRefreshRateHz,
  setUniverseCount,
  setDmxDeviceUniverse,
  setDmxUsbWidgetProtocol,
  setArtNetUniverseRoute,
} from '../redux/controlSlice'
import type { LinkRole } from '../redux/deviceState'
import CloseIcon from '@mui/icons-material/Close'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import { TextField } from '@mui/material'
import {
  DmxDevice_t,
  MidiDevice_t,
  ConnectionId,
} from '../../shared/connection'
import {
  clampOscPort,
  DEFAULT_OSC_PORT,
  DEFAULT_OSC_SEND_HOST,
  DEFAULT_OSC_SEND_PORT,
  OSC_PORT_MAX,
  OSC_PORT_MIN,
} from '../../shared/osc'
import DmxTroubleShoot from './DmxTroubleshoot'
import RemoteControlSection from './RemoteControlSection'
import Input from 'renderer/base/Input'
import DraggableNumber from 'renderer/base/DraggableNumber'
import ToggleSwitch from 'renderer/base/ToggleSwitch'
import LinkButton from '../menu/LinkButton'
import StartStopSyncButton from '../menu/StartStopSyncButton'
import { useRealtimeSelector } from '../redux/realtimeStore'
import SectionHelpButton, {
  FieldHelpButton,
  HelpIntro,
  HelpList,
  HelpTitle,
} from '../base/SectionHelpPopover'

interface Props {
  embedded?: boolean
  /** Hide LAN remote server UI (browser remote clients only). */
  hideRemoteControl?: boolean
}

export default function Devices({
  embedded = false,
  hideRemoteControl = false,
}: Props) {
  const dispatch = useDispatch()

  const deviceSetup = useControlSelector((state) => state.device)
  const connectable = deviceSetup.connectable
  const dmx = useTypedSelector((state) => state.gui.dmx)
  const midi = useTypedSelector((state) => state.gui.midi)
  const midiOut = useTypedSelector((state) => state.gui.midiOut)
  const osc = useTypedSelector((state) => state.gui.osc)

  const hasOpenDmx =
    dmx.available.find((device) => device.type === 'OpenDmxUsb') !== undefined

  const content = (
    <>
      {!embedded && (
        <Row style={{ paddingBottom: '0' }}>
          <Title>Connections</Title>
          <Tooltip title="Close connections menu">
            <IconButton onClick={() => dispatch(setConnectionsMenu(false))}>
              <CloseIcon />
            </IconButton>
          </Tooltip>
        </Row>
      )}
      <ConnectionsGrid>
        <ConnectionSection>
          <SectionHeader title="DMX" helpAriaLabel="How to set up DMX output">
            <HelpTitle>How to set up DMX output</HelpTitle>
            <HelpIntro>
              Turn on the USB adapters that should send DMX from this computer,
              then assign each one to a universe.
            </HelpIntro>
            <HelpList>
              <li>
                To enable or disable an adapter, click it in the list below.
              </li>
              <li>
                Set <strong>Universe Count</strong> to how many universes your
                show uses (shared with Art-Net routing).
              </li>
              <li>
                Assign each enabled adapter the universe number it should drive.
              </li>
              <li>
                If <strong>Open DMX USB</strong> hardware is present, set its
                refresh rate when the control appears.
              </li>
              <li>
                If an FTDI adapter is not detected correctly, switch that device
                to <strong>USB Pro protocol</strong> so output matches Enttec /
                Euro Light USB Pro framing.
              </li>
            </HelpList>
          </SectionHeader>
          <SettingRow>
            <SettingLabel>Universe Count</SettingLabel>
            <Tooltip title="Total universes available for DMX and Art-Net routing">
              <div>
                <DraggableNumber
                  value={deviceSetup.connectionSettings.universeCount}
                  min={1}
                  max={16}
                  onChange={(newVal) => dispatch(setUniverseCount(newVal))}
                />
              </div>
            </Tooltip>
          </SettingRow>
          {dmx.available.map((device) => (
            <DmxDevice
              key={device.connectionId}
              device={device}
              connected={dmx.connected}
              connectable={connectable.dmx}
            />
          ))}
          {dmx.available.length === 0 && <NoneFound />}
          {hasOpenDmx && (
            <SettingRow>
              <SettingLabel>Open Dmx Refresh Rate</SettingLabel>
              <Tooltip title="Refresh rate used by Open DMX USB devices">
                <div>
                  <DraggableNumber
                    value={deviceSetup.connectionSettings.openDmxRefreshRateHz}
                    min={5}
                    max={40}
                    onChange={(newVal) =>
                      dispatch(setOpenDmxRefreshRateHz(newVal))
                    }
                    suffix="hz"
                  />
                </div>
              </Tooltip>
            </SettingRow>
          )}
        </ConnectionSection>
        <ConnectionSection>
          <SectionHeader title="Art-Net" helpAriaLabel="How to route Art-Net">
            <HelpTitle>How to route Art-Net</HelpTitle>
            <HelpIntro>
              Send each universe to a destination on your network. Leave an IP
              blank to turn off output on that universe.
            </HelpIntro>
            <HelpList>
              <li>
                Enter the destination IP for each universe you want to transmit.
              </li>
              <li>
                Clear the field for a universe you are not using over Art-Net.
              </li>
            </HelpList>
          </SectionHeader>
          <ArtNetDevices />
        </ConnectionSection>
        <ConnectionSection>
          <SectionHeader title="MIDI" helpAriaLabel="How to set up MIDI">
            <HelpTitle>How to set up MIDI</HelpTitle>
            <HelpIntro>
              Enable MIDI inputs for control / clock-in, and outputs for CC publish
              and MIDI clock out. Use the piano icon for input learn and the upload
              icon for MIDI out assign.
            </HelpIntro>
            <HelpList>
              <li>
                Click a port under Inputs or Outputs to enable or disable it.
              </li>
              <li>
                Clock in and clock out are mutually exclusive (loop guard).
              </li>
            </HelpList>
          </SectionHeader>
          <DeviceSubLabel>Inputs</DeviceSubLabel>
          {midi.available.map((device) => (
            <MidiDevice
              key={`in-${device.name}`}
              device={device}
              connected={midi.connected}
              connectable={connectable.midi}
              direction="in"
            />
          ))}
          {midi.available.length === 0 && <NoneFound />}
          <DeviceSubLabel style={{ marginTop: '0.85rem' }}>Outputs</DeviceSubLabel>
          {midiOut.available.map((device) => (
            <MidiDevice
              key={`out-${device.name}`}
              device={device}
              connected={midiOut.connected}
              connectable={connectable.midiOut ?? []}
              direction="out"
            />
          ))}
          {midiOut.available.length === 0 && <NoneFound />}
          <MidiClockBpmControl midiConnected={midi.connected.length > 0} />
          <MidiClockOutControl midiOutConnected={midiOut.connected.length > 0} />
        </ConnectionSection>
        <ConnectionSection>
          <SectionHeader title="OSC" helpAriaLabel="How to set up OSC">
            <HelpTitle>How to set up OSC</HelpTitle>
            <HelpIntro>
              Listen for Open Sound Control over UDP and/or auto-publish Captivate
              control-bus values to another host. Mapped input controls use the same
              learn/action system as MIDI.
            </HelpIntro>
            <HelpList>
              <li>
                Turn <strong>Listen for OSC</strong> on to bind the UDP listen port.
              </li>
              <li>
                Turn <strong>Send OSC</strong> on to auto-publish
                <code> /captivate/… </code> at ~30 Hz (changed values only).
              </li>
              <li>
                Send host/port default to {DEFAULT_OSC_SEND_HOST}:{DEFAULT_OSC_SEND_PORT}.
                Sending to the same localhost listen port is blocked (loop guard).
              </li>
            </HelpList>
          </SectionHeader>
          <OscListenControl
            enabled={deviceSetup.connectionSettings.oscEnabled === true}
            port={
              typeof deviceSetup.connectionSettings.oscPort === 'number'
                ? deviceSetup.connectionSettings.oscPort
                : DEFAULT_OSC_PORT
            }
            listening={osc.listening}
            error={osc.error}
            sendEnabled={deviceSetup.connectionSettings.oscSendEnabled === true}
            sendHost={
              typeof deviceSetup.connectionSettings.oscSendHost === 'string'
                ? deviceSetup.connectionSettings.oscSendHost
                : DEFAULT_OSC_SEND_HOST
            }
            sendPort={
              typeof deviceSetup.connectionSettings.oscSendPort === 'number'
                ? deviceSetup.connectionSettings.oscSendPort
                : DEFAULT_OSC_SEND_PORT
            }
            sending={osc.sending === true}
            sendError={osc.sendError ?? null}
          />
        </ConnectionSection>
        <ConnectionSection>
          <SectionHeader title="Ableton Link" helpAriaLabel="How to use Ableton Link">
            <HelpTitle>How to use Ableton Link</HelpTitle>
            <HelpIntro>
              Sync tempo with Ableton Live and other Link-enabled apps on this
              computer and the same network. This uses the network, not a MIDI
              cable.
            </HelpIntro>
            <HelpList>
              <li>
                Turn Link on to join a shared tempo with compatible apps nearby.
              </li>
              <li>
                When Link is enabled, you can optionally sync master play/stop
                with the control in this section.
              </li>
            </HelpList>
          </SectionHeader>
          <AbletonLinkConnections />
        </ConnectionSection>
        {!hideRemoteControl ? <RemoteControlSection /> : null}
      </ConnectionsGrid>
      <DmxTroubleShoot />
    </>
  )

  if (embedded) {
    return <Modal $embedded={true}>{content}</Modal>
  }

  return (
    <Root>
      <Modal $embedded={false}>
        {content}
      </Modal>
    </Root>
  )
}

const Root = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #0007;
`

const Modal = styled.div<{ $embedded: boolean }>`
  background-color: ${(props) =>
    props.$embedded ? 'transparent' : props.theme.colors.bg.primary};
  width: ${(props) =>
    props.$embedded ? '100%' : 'min(68rem, calc(100vw - 3rem))'};
  max-height: ${(props) => (props.$embedded ? 'none' : 'calc(100vh - 3rem)')};
  overflow: ${(props) => (props.$embedded ? 'visible' : 'auto')};
  border: ${(props) =>
    props.$embedded ? 'none' : `1px solid ${props.theme.colors.divider}`};
  border-radius: ${(props) => (props.$embedded ? '0' : '0.5rem')};
  ${(props) => (props.$embedded ? 'margin: 0;' : 'margin: 1.5rem;')}
`

const Row = styled.div`
  display: flex;
  padding: 1rem 1rem 0;
  align-items: center;
  justify-content: space-between;
`

const ConnectionsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  padding: 1rem;
  /* Stretch items in each row so left/right neighbors share the same height;
     rows remain independent (top/bottom can differ). */
  align-items: stretch;
  box-sizing: border-box;

  @media (max-width: 52rem) {
    grid-template-columns: 1fr;
  }
`

const ConnectionSection = styled.section`
  border: 1px solid ${(p) => p.theme.colors.divider};
  border-radius: 0.45rem;
  padding: 0.9rem 1rem 1rem;
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  box-sizing: border-box;
`

const SectionHeaderRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin: 0 0 0.5rem;
  min-height: 1.75rem;
`

const SectionTitle = styled.h2`
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
  color: ${(p) => p.theme.colors.text.primary};
  letter-spacing: 0.02em;
`

function SectionHeader({
  title,
  helpAriaLabel,
  children,
}: {
  title: string
  helpAriaLabel: string
  children: ReactNode
}) {
  return (
    <SectionHeaderRow>
      <SectionTitle>{title}</SectionTitle>
      <SectionHelpButton ariaLabel={helpAriaLabel}>{children}</SectionHelpButton>
    </SectionHeaderRow>
  )
}

const SettingRow = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 0.5rem;
`

const SettingLabel = styled.p`
  color: #aaa;
  font-size: 0.7rem;
  margin-right: 0.3rem;
`

const Title = styled.div`
  font-size: 1.4rem;
`

function MidiClockBpmControl({ midiConnected }: { midiConnected: boolean }) {
  const dispatch = useDispatch()
  const enabled = useControlSelector(
    (state) => state.device.connectionSettings.midiClockBpmEnabled === true
  )

  if (!midiConnected) {
    return null
  }

  return (
    <MidiClockBlock>
      <MidiClockRow>
        <MidiClockLabelGroup>
          <MidiClockLabel>Drive BPM from MIDI clock</MidiClockLabel>
          <FieldHelpButton ariaLabel="How MIDI clock tempo works">
            When this is on, master BPM follows MIDI timing clock (24 pulses per
            quarter note) from any enabled MIDI input above. Your DAW or hardware
            must send clock on that port. Only one external BPM source can be active
            at a time — this disables audio beat clock and MIDI clock out (loop guard).
          </FieldHelpButton>
        </MidiClockLabelGroup>
        <ToggleSwitch
          checked={enabled}
          onChange={(next) => dispatch(setMidiClockBpmEnabled(next))}
          aria-label="Drive BPM from MIDI clock"
        />
      </MidiClockRow>
    </MidiClockBlock>
  )
}

function MidiClockOutControl({
  midiOutConnected,
}: {
  midiOutConnected: boolean
}) {
  const dispatch = useDispatch()
  const enabled = useControlSelector(
    (state) => state.device.connectionSettings.midiClockOutEnabled === true
  )
  const clockInEnabled = useControlSelector(
    (state) => state.device.connectionSettings.midiClockBpmEnabled === true
  )

  if (!midiOutConnected) {
    return null
  }

  return (
    <MidiClockBlock>
      <MidiClockRow>
        <MidiClockLabelGroup>
          <MidiClockLabel>Send MIDI clock</MidiClockLabel>
          <FieldHelpButton ariaLabel="How MIDI clock out works">
            When on, Captivate sends MIDI timing clock (0xF8 at 24 PPQ) plus start
            (0xFA) / stop (0xFC) on all enabled MIDI outputs. Disabled automatically
            while Drive BPM from MIDI clock is on, to avoid feedback loops.
          </FieldHelpButton>
        </MidiClockLabelGroup>
        <ToggleSwitch
          checked={enabled && !clockInEnabled}
          onChange={(next) => dispatch(setMidiClockOutEnabled(next))}
          aria-label="Send MIDI clock"
        />
      </MidiClockRow>
      {clockInEnabled ? (
        <OscStatusText $ok={false} $error={false}>
          Clock out off while following MIDI clock in
        </OscStatusText>
      ) : null}
    </MidiClockBlock>
  )
}

function OscListenControl({
  enabled,
  port,
  listening,
  error,
  sendEnabled,
  sendHost,
  sendPort,
  sending,
  sendError,
}: {
  enabled: boolean
  port: number
  listening: boolean
  error: string | null
  sendEnabled: boolean
  sendHost: string
  sendPort: number
  sending: boolean
  sendError: string | null
}) {
  const dispatch = useDispatch()
  const statusText = !enabled
    ? 'Listen off'
    : listening
      ? `Listening on UDP ${port}`
      : error
        ? `Listen error: ${error}`
        : 'Listen starting…'

  const sendStatusText = !sendEnabled
    ? 'Send off'
    : sendError
      ? `Send error: ${sendError}`
      : sending
        ? `Sending to ${sendHost}:${sendPort}`
        : 'Send ready…'

  return (
    <MidiClockBlock>
      <MidiClockRow>
        <MidiClockLabelGroup>
          <MidiClockLabel>Listen for OSC</MidiClockLabel>
          <FieldHelpButton ariaLabel="How OSC listening works">
            When on, Captivate opens a UDP socket for Open Sound Control messages.
            Use the piano learn button (same as MIDI) to bind an OSC address to a
            control, then send that address from TouchOSC, QLab, Max, or similar.
          </FieldHelpButton>
        </MidiClockLabelGroup>
        <ToggleSwitch
          checked={enabled}
          onChange={(next) => dispatch(setOscEnabled(next))}
          aria-label="Listen for OSC"
        />
      </MidiClockRow>
      <SettingRow>
        <SettingLabel>Listen port</SettingLabel>
        <Tooltip title={`OSC listen port (${OSC_PORT_MIN}–${OSC_PORT_MAX})`}>
          <div>
            <DraggableNumber
              value={clampOscPort(port)}
              min={OSC_PORT_MIN}
              max={OSC_PORT_MAX}
              onChange={(newVal) => dispatch(setOscPort(newVal))}
            />
          </div>
        </Tooltip>
      </SettingRow>
      <OscStatusText $ok={listening && enabled} $error={Boolean(error)}>
        {statusText}
      </OscStatusText>

      <MidiClockRow style={{ marginTop: '0.85rem' }}>
        <MidiClockLabelGroup>
          <MidiClockLabel>Send OSC</MidiClockLabel>
          <FieldHelpButton ariaLabel="How OSC send works">
            When on, Captivate auto-publishes the /captivate control-bus namespace
            (~30 Hz, change-detected) to the host and port below. See docs/osc-mapping.md.
          </FieldHelpButton>
        </MidiClockLabelGroup>
        <ToggleSwitch
          checked={sendEnabled}
          onChange={(next) => dispatch(setOscSendEnabled(next))}
          aria-label="Send OSC"
        />
      </MidiClockRow>
      <SettingRow>
        <SettingLabel>Send host</SettingLabel>
        <Tooltip title="OSC send destination host">
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            <Input
              value={sendHost}
              onChange={(newVal) => dispatch(setOscSendHost(newVal))}
              placeholder={DEFAULT_OSC_SEND_HOST}
            />
          </div>
        </Tooltip>
      </SettingRow>
      <SettingRow>
        <SettingLabel>Send port</SettingLabel>
        <Tooltip title={`OSC send port (${OSC_PORT_MIN}–${OSC_PORT_MAX})`}>
          <div>
            <DraggableNumber
              value={clampOscPort(sendPort)}
              min={OSC_PORT_MIN}
              max={OSC_PORT_MAX}
              onChange={(newVal) => dispatch(setOscSendPort(newVal))}
            />
          </div>
        </Tooltip>
      </SettingRow>
      <OscStatusText
        $ok={sending && sendEnabled && !sendError}
        $error={Boolean(sendError)}
      >
        {sendStatusText}
      </OscStatusText>
    </MidiClockBlock>
  )
}

const OscStatusText = styled.div<{ $ok: boolean; $error: boolean }>`
  margin-top: 0.35rem;
  font-size: 0.75rem;
  color: ${(p) =>
    p.$error
      ? '#e05a5a'
      : p.$ok
        ? '#78dc82'
        : p.theme.colors.text.secondary};
`

const MidiClockBlock = styled.div`
  margin-top: 1.1rem;
`

const MidiClockRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
  margin-bottom: 0.35rem;
`

const MidiClockLabelGroup = styled.div`
  display: flex;
  align-items: center;
  min-width: 0;
  flex: 1 1 auto;
`

const MidiClockLabel = styled.div`
  font-size: 0.85rem;
  font-weight: 600;
  color: ${(p) => p.theme.colors.text.primary};
`

const LinkControlsGrid = styled.div<{ $linkOn: boolean }>`
  display: grid;
  grid-template-columns: ${(p) => (p.$linkOn ? '1fr 1fr' : '1fr')};
  gap: 0.75rem 1rem;
  align-items: center;
  width: 100%;
  margin-top: 0.15rem;
`

const LinkControlCol = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-start;
  min-width: 0;
`

const SyncControlCol = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 0;
`

const SyncTransportRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.65rem;
  width: 100%;
  min-width: 0;
`

const SyncTransportText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.08rem;
  min-width: 0;
`

const SyncTransportTitle = styled.div`
  font-size: 0.8rem;
  font-weight: 600;
  color: ${(p) => p.theme.colors.text.primary};
`

const SyncTransportState = styled.div`
  font-size: 0.68rem;
  color: ${(p) => p.theme.colors.text.secondary};
`

function AbletonLinkConnections() {
  const dispatch = useDispatch()
  const linkEnabled = useControlSelector(
    (state) => state.device.connectionSettings.linkEnabled === true
  )
  const linkRole = useControlSelector(
    (state) => state.device.connectionSettings.linkRole ?? 'full'
  )
  const startStopSyncEnabled = useRealtimeSelector(
    (state) => state.time.isStartStopSyncEnabled
  )

  return (
    <>
      <LinkControlsGrid $linkOn={linkEnabled}>
        <LinkControlCol>
          <LinkButton layout="connections" />
        </LinkControlCol>
        {linkEnabled ? (
          <SyncControlCol>
            <Tooltip
              title="When supported, play and stop follow other Link apps in the session. Click the icon to turn sync on or off."
              placement="top"
            >
              <SyncTransportRow>
                <StartStopSyncButton mode="menu" />
                <SyncTransportText>
                  <SyncTransportTitle>Start/stop sync</SyncTransportTitle>
                  <SyncTransportState>
                    {startStopSyncEnabled
                      ? 'On — follows Link transport'
                      : 'Off'}
                  </SyncTransportState>
                </SyncTransportText>
              </SyncTransportRow>
            </Tooltip>
          </SyncControlCol>
        ) : null}
      </LinkControlsGrid>
      {linkEnabled ? (
        <MidiClockBlock>
          <MidiClockLabel style={{ marginBottom: '0.35rem' }}>
            Link role (tempo)
          </MidiClockLabel>
          <TextField
            select
            size="small"
            fullWidth
            value={linkRole}
            onChange={(e) =>
              dispatch(setLinkRole(e.target.value as LinkRole))
            }
            SelectProps={{ native: true }}
            inputProps={{ 'aria-label': 'Ableton Link tempo role' }}
          >
            <option value="full">Full — follow peers and push local tempo</option>
            <option value="leader">Leader — Captivate owns tempo</option>
            <option value="follow">Follow — only Link session tempo</option>
          </TextField>
          <OscStatusText $ok={false} $error={false}>
            Role mainly affects tempo authorship; start/stop still uses the toggle
            above.
          </OscStatusText>
        </MidiClockBlock>
      ) : null}
    </>
  )
}

function ArtNetDevices() {
  const dispatch = useDispatch()
  const universeCount = useControlSelector(
    (state) => state.device.connectionSettings.universeCount
  )
  const artNetIpByUniverse = useControlSelector(
    (state) => state.device.connectionSettings.artNetIpByUniverse
  )

  const universes = Array.from({ length: universeCount }, (_, i) => i + 1)

  return (
    <>
      {universes.map((universe) => (
        <ArtNetRouteRow key={universe}>
          <ArtNetUniverseTag>U{universe}</ArtNetUniverseTag>
          <Tooltip title={`Destination IP for Art-Net universe ${universe}`}>
            <div style={{ flex: '1 0 0' }}>
              <Input
                value={artNetIpByUniverse[universe] ?? ''}
                onChange={(newVal) =>
                  dispatch(setArtNetUniverseRoute({ universe, ip: newVal }))
                }
                placeholder="e.g. 192.168.1.50"
              />
            </div>
          </Tooltip>
        </ArtNetRouteRow>
      ))}
    </>
  )
}

const ArtNetRouteRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.35rem;
`

const ArtNetUniverseTag = styled.div`
  min-width: 2.2rem;
  font-size: 0.75rem;
  color: ${(props) => props.theme.colors.text.secondary};
  text-align: right;
`

interface Props2<T> {
  device: T
  connected: ConnectionId[]
  connectable: ConnectionId[]
}

function hasDmxDevice(connectionIds: string[], device: DmxDevice_t) {
  return (
    connectionIds.find(
      (connectionId) => device.connectionId === connectionId
    ) !== undefined
  )
}

function hasMidiDevice(
  ids: ConnectionId[],
  device: DmxDevice_t | MidiDevice_t
) {
  return ids.find((id) => device.connectionId === id) !== undefined
}

interface Status {
  isConnected: boolean
  isConnectable: boolean
}

function getMidiStatus(
  device: MidiDevice_t,
  connected: ConnectionId[],
  connectable: ConnectionId[]
): Status {
  return {
    isConnected: hasMidiDevice(connected, device),
    isConnectable: hasMidiDevice(connectable, device),
  }
}

function getDmxStatus(
  device: DmxDevice_t,
  connected: ConnectionId[],
  connectable: ConnectionId[]
): Status {
  return {
    isConnected: hasDmxDevice(connected, device),
    isConnectable: hasDmxDevice(connectable, device),
  }
}

function DmxDevice({ device, connected, connectable }: Props2<DmxDevice_t>) {
  const dispatch = useDispatch()
  const status = getDmxStatus(device, connected, connectable)
  const universeCount = useControlSelector(
    (state) => state.device.connectionSettings.universeCount
  )
  const assignedUniverse = useControlSelector(
    (state) =>
      state.device.connectionSettings.dmxUniverseByDevice[device.connectionId] ??
      1
  )
  const forceUsbProProtocol = useControlSelector(
    (state) =>
      state.device.connectionSettings.dmxUsbUseWidgetProtocolByDevice?.[
        device.connectionId
      ] === true
  )

  const onClick = () => {
    let connectableSet = new Set(connectable)
    if (status.isConnectable) {
      connectableSet.delete(device.connectionId)
    } else {
      connectableSet.add(device.connectionId)
    }
    dispatch(setDmxConnectable(Array.from(connectableSet)))
  }

  return (
    <DmxUsbDeviceBlock>
      <DeviceRow>
        <DeviceRoot
          {...status}
          onClick={onClick}
          title={
            status.isConnected
              ? 'DMX adapter connected and sending'
              : status.isConnectable
                ? 'Enabled — waiting for USB port (check cable, drivers, or port in use)'
                : 'Click to enable this DMX adapter'
          }
        >
          <DeviceStatusDot
            $connected={status.isConnected}
            $enabled={status.isConnectable}
            aria-hidden
          />
          {device.name}
        </DeviceRoot>
        <Tooltip title="Universe this DMX adapter outputs">
          <TextField
            size="small"
            label="Universe"
            value={assignedUniverse.toString()}
            type="number"
            inputProps={{ min: 1, max: universeCount }}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const universe = parseInt(e.target.value, 10)
              if (!Number.isNaN(universe)) {
                dispatch(
                  setDmxDeviceUniverse({
                    connectionId: device.connectionId,
                    universe,
                  })
                )
              }
            }}
          />
        </Tooltip>
      </DeviceRow>
      <WidgetProtoRow
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <Tooltip
          title="Always use Enttec DMX USB Pro / widget framing for this port (skip auto-detect). Use for clones that behave like Euro Light USB Pro but do not answer the probe."
          placement="left"
        >
          <WidgetProtoLabel>USB Pro protocol</WidgetProtoLabel>
        </Tooltip>
        <ToggleSwitch
          checked={forceUsbProProtocol}
          onChange={(next) =>
            dispatch(
              setDmxUsbWidgetProtocol({
                connectionId: device.connectionId,
                useWidgetProtocol: next,
              })
            )
          }
          title="Force Enttec USB Pro / widget protocol"
          aria-label="Force USB Pro widget protocol for this DMX adapter"
        />
      </WidgetProtoRow>
    </DmxUsbDeviceBlock>
  )
}

function MidiDevice({
  device,
  connected,
  connectable,
  direction = 'in',
}: Props2<MidiDevice_t> & { direction?: 'in' | 'out' }) {
  const dispatch = useDispatch()
  const status = getMidiStatus(device, connected, connectable)

  const onClick = () => {
    let connectableSet = new Set(connectable)
    if (status.isConnectable) {
      connectableSet.delete(device.connectionId)
    } else {
      connectableSet.add(device.connectionId)
    }
    const next = Array.from(connectableSet)
    if (direction === 'out') {
      dispatch(setMidiOutConnectable(next))
    } else {
      dispatch(setMidiConnectable(next))
    }
  }

  return (
    <DeviceRoot
      {...status}
      onClick={onClick}
      title={
        direction === 'out'
          ? 'Click to enable or disable this MIDI output'
          : 'Click to enable or disable this MIDI input'
      }
    >
      {device.name}
    </DeviceRoot>
  )
}

const DeviceSubLabel = styled.div`
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: ${(p) => p.theme.colors.text.secondary};
  margin: 0.15rem 0 0.35rem;
`

const DmxUsbDeviceBlock = styled.div`
  margin-bottom: 0.45rem;
`

const DeviceRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`

const WidgetProtoRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.45rem;
  margin: 0.15rem 0 0 0.35rem;
  padding-right: 0.15rem;
`

const WidgetProtoLabel = styled.span`
  font-size: 0.68rem;
  color: ${(p) => p.theme.colors.text.secondary};
  line-height: 1.2;
  text-align: right;
  max-width: 11rem;
`

const DeviceRoot = styled.div<Status>`
  padding: 0.5rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  color: ${(props) =>
    props.isConnected
      ? props.theme.colors.text.primary
      : props.theme.colors.text.secondary};
  border: ${(props) =>
    props.isConnectable
      ? `1px solid ${props.theme.colors.divider}`
      : `1px solid #0000`};
  flex: 1 1 auto;
  :hover {
    text-decoration: underline;
  }
`

const DeviceStatusDot = styled.span<{ $connected: boolean; $enabled: boolean }>`
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 999px;
  flex-shrink: 0;
  background: ${(props) =>
    props.$connected ? '#0f0' : props.$enabled ? '#e8a020' : '#f00'};
  box-shadow: 0 0 0 1px #0008;
`

function NoneFound() {
  return <None>None Found</None>
}

const None = styled.div`
  padding: 0.5rem;
  color: ${(props) => props.theme.colors.text.secondary};
`
