import styled from 'styled-components'
import IconButton from '@mui/material/IconButton'
import CloseIcon from '@mui/icons-material/Close'
import zIndexes, { overlayZIndex } from '../zIndexes'
import OverlayPortal from '../overlays/OverlayPortal'
import { useTypedSelector } from '../redux/store'

interface Props {
  title: React.ReactNode
  children: React.ReactNode
  onClose: () => void
  cardWidth?: string
  cardMaxWidth?: string
  cardMaxHeight?: string
  /** Optional `data-tour` on the card for interactive tutorial spotlights. */
  dataTour?: string
}

export default function Popup({
  title,
  onClose,
  children,
  cardWidth,
  cardMaxWidth,
  cardMaxHeight,
  dataTour,
}: Props) {
  const tourActive = useTypedSelector((s) => s.gui.interactiveTourActive)

  return (
    <OverlayPortal>
      <Root
        $tourActive={tourActive}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            onClose()
          }
        }}
      >
        <Card
          data-tour={dataTour}
          $cardWidth={cardWidth}
          $cardMaxWidth={cardMaxWidth}
          $cardMaxHeight={cardMaxHeight}
        >
          <Title>
            {title}
            <IconButton
              onClick={(e) => {
                e.preventDefault()
                onClose()
              }}
            >
              <CloseIcon />
            </IconButton>
          </Title>
          {children}
        </Card>
      </Root>
    </OverlayPortal>
  )
}

const Root = styled.div<{ $tourActive: boolean }>`
  position: fixed;
  inset: 0;
  z-index: ${(p) =>
    p.$tourActive ? overlayZIndex.tourPopup : zIndexes.overlay.popup};
  background-color: ${(p) => (p.$tourActive ? '#0006' : '#000a')};
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  box-sizing: border-box;
`

const Card = styled.div<{
  $cardWidth?: string
  $cardMaxWidth?: string
  $cardMaxHeight?: string
}>`
  background-color: ${(props) => props.theme.colors.bg.primary};
  width: ${(props) => props.$cardWidth ?? 'min(32rem, calc(100vw - 2rem))'};
  max-width: ${(props) => props.$cardMaxWidth ?? 'calc(100vw - 2rem)'};
  max-height: ${(props) => props.$cardMaxHeight ?? 'calc(100vh - 2rem)'};
  overflow: auto;
  padding: 1rem;
  box-sizing: border-box;
  border: 1px solid ${(props) => props.theme.colors.divider};
  border-radius: 0.45rem;
  box-shadow: ${(props) => props.theme.elevation.shadowMd};
`

const Title = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 1.05rem;
  font-weight: 700;
  min-width: 15rem;
  margin-bottom: 0.7rem;
`
