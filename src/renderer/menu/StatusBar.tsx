import Counter2 from './Counter2'
import ConnectionStatus from './ConnectionStatus'
import styled from 'styled-components'
import UndoRedo from 'renderer/controls/UndoRedo'
import SettingsEthernetIcon from '@mui/icons-material/SettingsEthernet'
import PianoIcon from '@mui/icons-material/Piano'
import UploadIcon from '@mui/icons-material/Upload'
import IconButton from '@mui/material/IconButton'
import { useDeviceSelector, useTypedSelector } from '../redux/store'
import { useDispatch } from 'react-redux'
import {
  midiSetIsEditing,
  midiSetKeyboardLearnMode,
  midiSetMidiOutLearnMode,
} from '../redux/controlSlice'
import { setConnectionsMenu } from '../redux/guiSlice'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import TapTempo from './TapTempo'
import StartStopButton from './StartStopButton'
import SaveLoad from './SaveLoad'
import Bpm from './Bpm'
import AudioInputMenu from './AudioInputMenu'
import AudioLevelMeterBar from './AudioLevelMeterBar'
import { send_open_page_window } from '../ipcHandler'
import KeyboardShortcutMenuButton from '../overlays/KeyboardShortcutEditorDialog'
import { normalizeAudioInputSettings } from '../../shared/audioEngine'
import {
  StatusBarCluster,
  StatusBarTransportCluster,
  STATUS_BAR_CONTROL_HEIGHT,
  statusBarMuiIconButtonSx,
} from './statusBarUi'
import { TOUR_IDS } from '../tutorial/tourIds'

export default function StatusBar() {
  const isEditing = useDeviceSelector((state) => state.isEditing)
  const midiOutLearnMode = useDeviceSelector((state) => state.midiOutLearnMode)
  const connectionMenu = useTypedSelector((state) => state.gui.connectionMenu)
  const activePage = useTypedSelector((state) => state.gui.activePage)
  const dispatch = useDispatch()
  const midiConnected = useTypedSelector(
    (state) => state.gui.midi.connected.length > 0
  )
  const midiOutConnected = useTypedSelector(
    (state) => state.gui.midiOut.connected.length > 0
  )
  const oscListening = useTypedSelector(
    (state) => state.gui.osc.listening === true
  )
  const mappingInputReady = midiConnected || oscListening
  const handleMidiAssignClick = () => {
    if (!mappingInputReady) {
      dispatch(setConnectionsMenu(true))
      return
    }
    dispatch(midiSetKeyboardLearnMode(false))
    dispatch(midiSetMidiOutLearnMode(false))
    dispatch(midiSetIsEditing(!isEditing))
  }
  const handleMidiOutAssignClick = () => {
    if (!midiOutConnected) {
      dispatch(setConnectionsMenu(true))
      return
    }
    dispatch(midiSetKeyboardLearnMode(false))
    dispatch(midiSetIsEditing(false))
    dispatch(midiSetMidiOutLearnMode(!midiOutLearnMode))
  }
  const canPopOutActivePage = activePage !== 'Atmospherics'
  const audioModeEnabled = useDeviceSelector(
    (state) =>
      normalizeAudioInputSettings(state.connectionSettings.audioInput).enabled ===
      true
  )

  return (
    <Root data-tour-layer="statusbar">
      <LeftSection>
        <StatusBarCluster data-tour={TOUR_IDS.saveLoad}>
          <SaveLoad />
          <UndoRedo />
        </StatusBarCluster>
      </LeftSection>
      <CenterSection>
        <StatusBarTransportCluster data-tour={TOUR_IDS.transport}>
          <StartStopButton />
          <TapTempo />
          <Bpm />
          <Counter2 />
        </StatusBarTransportCluster>
      </CenterSection>
      <RightSection>
        <StatusBarCluster>
          {audioModeEnabled ? <AudioLevelMeterBar /> : null}
          {canPopOutActivePage && (
            <IconButton
              title={`Pop ${activePage} out to its own window`}
              onClick={() => send_open_page_window(activePage)}
              size="small"
              sx={statusBarMuiIconButtonSx}
            >
              <OpenInNewIcon fontSize="small" />
            </IconButton>
          )}
          <KeyboardShortcutMenuButton />
          <IconButton
            title={
              mappingInputReady
                ? isEditing
                  ? 'Exit MIDI / OSC learn / mapping mode'
                  : 'Enter MIDI / OSC learn / mapping mode'
                : 'No MIDI or OSC — open Connections to set up'
            }
            onClick={handleMidiAssignClick}
            size="small"
            sx={{
              ...statusBarMuiIconButtonSx,
              color: isEditing ? 'success.main' : 'text.primary',
              opacity: mappingInputReady ? 1 : 0.55,
            }}
          >
            <PianoIcon fontSize="small" />
          </IconButton>
          <IconButton
            title={
              midiOutConnected
                ? midiOutLearnMode
                  ? 'Exit MIDI out assign mode'
                  : 'Enter MIDI out assign mode (set channel + CC/note on overlays)'
                : 'No MIDI output — open Connections to enable an output port'
            }
            onClick={handleMidiOutAssignClick}
            size="small"
            sx={{
              ...statusBarMuiIconButtonSx,
              color: midiOutLearnMode ? 'warning.main' : 'text.primary',
              opacity: midiOutConnected ? 1 : 0.55,
            }}
          >
            <UploadIcon fontSize="small" />
          </IconButton>
          <AudioInputMenu />
          <IconButton
            data-tour={TOUR_IDS.connections}
            title="Devices & output settings (DMX, Art-Net, MIDI, OSC, audio)"
            onClick={() => dispatch(setConnectionsMenu(!connectionMenu))}
            size="small"
            sx={statusBarMuiIconButtonSx}
          >
            <SettingsEthernetIcon fontSize="small" />
          </IconButton>
          <Connections>
            <ConnectionStatus type={'midi'} />
            <ConnectionStatus type={'osc'} />
            <ConnectionStatus type={'dmx'} />
            <ConnectionStatus type={'link'} />
          </Connections>
        </StatusBarCluster>
      </RightSection>
    </Root>
  )
}

const Root = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1.35fr);
  align-items: center;
  gap: 0.35rem;
  flex: 0 0 auto;
  width: 100%;
  min-height: 3.2rem;
  min-width: 0;
  padding: 0.2rem 0.65rem 0.2rem 0.45rem;
  box-sizing: border-box;
  border-bottom: 1px solid ${(props) => props.theme.colors.divider};
  background-color: ${(props) => props.theme.colors.bg.primary};
  overflow: visible;
`

const LeftSection = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-start;
  min-width: 0;
  overflow: hidden;
`

const CenterSection = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
`

const RightSection = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 0;
  overflow: visible;
`

const Connections = styled.div`
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0.35rem;
  height: ${STATUS_BAR_CONTROL_HEIGHT};
  padding: 0 0.15rem;
  flex: 0 0 auto;
  overflow: visible;
`
