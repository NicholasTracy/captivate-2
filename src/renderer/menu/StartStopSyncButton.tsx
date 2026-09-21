import styled, { useTheme } from 'styled-components'
import { useDispatch } from 'react-redux'
import { useControlSelector } from '../redux/store'
import { setLinkStartStopSyncEnabled } from '../redux/controlSlice'
import { send_user_command } from '../ipcHandler'

interface Props {
  /**
   * `toolbar`: previous status-bar behaviour (spacer when Link is off).
   * `menu`: used in Connections — render nothing when Link is off; compact layout when on.
   */
  mode?: 'toolbar' | 'menu'
}

export default function StartStopSyncButton({ mode = 'toolbar' }: Props) {
  const theme = useTheme()
  const dispatch = useDispatch()
  const linkEnabled = useControlSelector(
    (state) => state.device.connectionSettings.linkEnabled === true
  )
  const startStopSyncEnabled = useControlSelector(
    (state) =>
      state.device.connectionSettings.linkStartStopSyncEnabled === true
  )

  const toggleStartStopSync = () => {
    const next = !startStopSyncEnabled
    dispatch(setLinkStartStopSyncEnabled(next))
    send_user_command({
      type: 'EnableStartStopSync',
      isEnabled: next,
    })
  }

  const accent = startStopSyncEnabled
    ? theme.colors.icon.primary
    : theme.colors.icon.secondary
  const compact = mode === 'menu'

  if (!linkEnabled) {
    return mode === 'menu' ? null : <PlaceHolder />
  }

  return (
    <Root
      $compact={compact}
      role="button"
      tabIndex={0}
      title={
        startStopSyncEnabled
          ? 'Start/stop sync is on — click to turn off'
          : 'Click to sync play/stop with other Link apps when supported'
      }
      onClick={toggleStartStopSync}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          toggleStartStopSync()
        }
      }}
    >
      <Line $compact={compact} style={{ backgroundColor: accent }} />
      <CircleBg style={{ borderColor: accent }} />
      <Breaker />
      <Circle $enabled={startStopSyncEnabled} style={{ backgroundColor: accent }} />
    </Root>
  )
}

const Root = styled.div<{ $compact: boolean }>`
  position: relative;
  cursor: pointer;
  width: ${(p) => (p.$compact ? '2.5rem' : 'auto')};
  height: ${(p) => (p.$compact ? '1.65rem' : 'auto')};
  flex: 0 0 auto;
  :hover {
    opacity: 1;
  }
`

const PlaceHolder = styled.div`
  width: 1rem;
`

const Line = styled.div<{ $compact?: boolean }>`
  height: 0.1rem;
  width: 2.5rem;
  margin: ${(p) => (p.$compact ? '0.28rem 0' : '1rem 0')};
`

const centerIt = `
position: absolute;
top: 50%;
left: 50%;
transform: translate(-50%, -50%);`

const CircleBg = styled.div`
  margin: auto;
  border: 2px solid ${(props) => props.theme.colors.icon.secondary};
  background-color: ${(props) => props.theme.colors.bg.primary};
  border-radius: 10rem;
  height: 1.2rem;
  width: 1.2rem;
  cursor: pointer;
  ${centerIt}
`
const Breaker = styled.div`
  height: 100%;
  width: 0.7rem;
  background-color: ${(props) => props.theme.colors.bg.primary};
  ${centerIt}
`
const Circle = styled.div<{ $enabled: boolean }>`
  border-radius: 10rem;
  height: 0.9rem;
  width: 0.9rem;
  opacity: ${(props) => (props.$enabled ? 1 : 0)};
  cursor: pointer;
  ${centerIt}
`
