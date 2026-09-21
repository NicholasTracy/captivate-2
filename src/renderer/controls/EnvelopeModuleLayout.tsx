import styled from 'styled-components'

/** Shared envelope-module footprint (Randomizer + Chase). */
export const ENVELOPE_MODULE_WIDTH_PX = 200
export const ENVELOPE_ADSR_HEIGHT_PX = 100
export const ENVELOPE_BAR_HEIGHT_PX = 26
export const ENVELOPE_ROW_HEIGHT_PX = 32

export const EnvelopeModuleRoot = styled.div`
  position: relative;
  width: ${ENVELOPE_MODULE_WIDTH_PX}px;
  border: 1px solid ${(props) => props.theme.colors.divider};
  background: ${(props) => props.theme.colors.bg.panel};
  box-shadow: ${(props) => props.theme.elevation.shadowSm};
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  margin-right: 1rem;
  flex-shrink: 0;
  color: ${(props) => props.theme.colors.text.primary};
`

export const EnvelopeModuleRow = styled.div`
  width: 100%;
  display: flex;
  height: ${ENVELOPE_ROW_HEIGHT_PX}px;
  align-items: stretch;
  gap: 0.25rem;
  padding: 0 0.3rem 0.3rem;
  box-sizing: border-box;
`

export const EnvelopeBarHost = styled.div`
  width: 100%;
  height: ${ENVELOPE_BAR_HEIGHT_PX}px;
  padding: 0.25rem 0.3rem;
  box-sizing: border-box;
  flex: 0 0 auto;
`

/** Equal-width toggle cluster; clears ToggleButton’s default right margin. */
export const EnvelopeToggleGroup = styled.div`
  display: flex;
  flex: 1 1 0;
  min-width: 0;
  gap: 0.2rem;
  align-items: stretch;

  & > button {
    flex: 1 1 0;
    margin: 0;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.85rem;
    line-height: 1;
    padding: 0;
  }
`

export const EnvelopeSliderSlot = styled.div`
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  align-items: stretch;

  & > * {
    flex: 1 1 auto;
    width: 100%;
  }
`

export const EnvelopeNumberSlot = styled.div<{ $grow?: boolean }>`
  flex: ${(props) => (props.$grow ? '1 1 0' : '0 0 auto')};
  min-width: 0;
  display: flex;
  align-items: stretch;

  & > * {
    height: 100%;
    width: ${(props) => (props.$grow ? '100%' : 'auto')};
    box-sizing: border-box;
  }
`
