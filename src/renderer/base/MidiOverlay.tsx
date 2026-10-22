import styled from 'styled-components'
import {
  clampMidiCc,
  clampMidiChannel,
  findKeyboardChordIdForAction,
  getActionID,
  getMidiSliderBounds,
  midiOutBindingKind,
  nextFreeMidiOutNumber,
  supportsMidiOut,
  type MidiAction,
  type MidiOutBinding,
} from '../redux/deviceState'
import {
  midiListen,
  keyboardListen,
  midiSetSliderAction,
  removeMidiAction,
  removeMidiOutAction,
  setMidiOutAction,
  clearButtonMapping,
  removeKeyboardChord,
} from '../redux/controlSlice'
import { useDeviceSelector } from '../redux/store'
import { useDispatch } from 'react-redux'
import DraggableNumber from './DraggableNumber'
import Button from './Button'
import { formatChordId } from '../input/keyboardChord'

interface Props {
  children?: React.ReactNode
  action: MidiAction
  style?: React.CSSProperties
}

const outEditorStyle: React.CSSProperties = {
  padding: '0.1rem 0.25rem',
  margin: '0.15rem',
  color: 'white',
  backgroundColor: '#0009',
  fontSize: '0.75rem',
}

export function ButtonMidiOverlay({ children, action, style }: Props) {
  const isEditing = useDeviceSelector((state) => state.isEditing)
  const keyboardLearnMode = useDeviceSelector((state) => state.keyboardLearnMode)
  const midiOutLearnMode = useDeviceSelector((state) => state.midiOutLearnMode)
  const mappingVisible = isEditing || keyboardLearnMode

  const controlledAction = useDeviceSelector((state) => {
    return state.buttonActions[getActionID(action)] || null
  })
  const chordId = useDeviceSelector((state) =>
    findKeyboardChordIdForAction(state.keyboardShortcuts, action)
  )
  const isListeningMidi = useDeviceSelector((state) => {
    if (!state.listening) return false
    return getActionID(state.listening) === getActionID(action)
  })
  const isListeningKeyboard = useDeviceSelector((state) => {
    if (!state.keyboardListening) return false
    return getActionID(state.keyboardListening) === getActionID(action)
  })
  const isListening = isListeningMidi || isListeningKeyboard
  const dispatch = useDispatch()

  const onClick = () => {
    if (keyboardLearnMode && !isEditing) {
      dispatch(keyboardListen(action))
      window.focus()
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }
    } else {
      dispatch(midiListen(action))
    }
  }

  if (midiOutLearnMode) {
    if (!supportsMidiOut(action) || midiOutBindingKind(action) !== 'note') {
      return <Root style={style}>{children}</Root>
    }
    return (
      <Root style={style}>
        {children}
        <MidiOutAssignOverlay action={action} kind="note" />
      </Root>
    )
  }

  return (
    <Root style={style}>
      {children}
      {mappingVisible && (
        <Overlay selected={isListening} onClick={onClick}>
          {(controlledAction || chordId) && (
            <BindingRow>
              {controlledAction ? (
                <>
                  <span>{controlledAction.inputID}</span>
                  <ClearMappingsX action={action} />
                </>
              ) : null}
              {chordId ? (
                <span style={{ marginLeft: controlledAction ? '0.35rem' : 0 }}>
                  {formatChordId(chordId)}
                  <ClearKeyboardX chordId={chordId} />
                </span>
              ) : null}
            </BindingRow>
          )}
        </Overlay>
      )}
    </Root>
  )
}

function ClearMappingsX({ action }: { action: MidiAction }) {
  const dispatch = useDispatch()
  return (
    <div
      onClick={(e) => {
        e.stopPropagation()
        dispatch(clearButtonMapping(action))
      }}
      style={{ cursor: 'pointer', marginLeft: '0.5rem' }}
    >
      X
    </div>
  )
}

function ClearKeyboardX({ chordId }: { chordId: string }) {
  const dispatch = useDispatch()
  return (
    <span
      onClick={(e) => {
        e.stopPropagation()
        dispatch(removeKeyboardChord(chordId))
      }}
      style={{ cursor: 'pointer', marginLeft: '0.35rem' }}
    >
      ×
    </span>
  )
}

export function SliderMidiOverlay({ children, action, style }: Props) {
  const isEditing = useDeviceSelector((state) => state.isEditing)
  const midiOutLearnMode = useDeviceSelector((state) => state.midiOutLearnMode)
  const controlledAction = useDeviceSelector((state) => {
    return state.sliderActions[getActionID(action)] || null
  })
  const isListening = useDeviceSelector((state) => {
    if (!state.listening) return false
    return getActionID(state.listening) === getActionID(action)
  })
  const dispatch = useDispatch()

  const onClick = () => {
    dispatch(midiListen(action))
  }

  const onChangeMin = (newVal: number) => {
    dispatch(
      midiSetSliderAction({
        ...controlledAction,
        options: {
          ...controlledAction.options,
          min: newVal,
        },
      })
    )
  }

  const onChangeMax = (newVal: number) => {
    dispatch(
      midiSetSliderAction({
        ...controlledAction,
        options: {
          ...controlledAction.options,
          max: newVal,
        },
      })
    )
  }

  const onClickMode = () => {
    dispatch(
      midiSetSliderAction({
        ...controlledAction,
        options: {
          ...controlledAction.options,
          mode: controlledAction.options.mode === 'hold' ? 'toggle' : 'hold',
        },
      })
    )
  }

  const onClickMode_cc = () => {
    dispatch(
      midiSetSliderAction({
        ...controlledAction,
        options: {
          ...controlledAction.options,
          mode:
            controlledAction.options.mode === 'relative'
              ? 'absolute'
              : 'relative',
        },
      })
    )
  }

  const onClickValue = (value: 'max' | 'velocity') => () => {
    dispatch(
      midiSetSliderAction({
        ...controlledAction,
        options: {
          ...controlledAction.options,
          value: value === 'max' ? 'velocity' : 'max',
        },
      })
    )
  }

  const minMaxStyle: React.CSSProperties = {
    padding: '0.1rem 0.2rem',
    margin: '0.2rem',
    color: 'white',
    backgroundColor: '#0009',
  }

  const sliderBounds = getMidiSliderBounds(action)

  if (midiOutLearnMode) {
    if (!supportsMidiOut(action) || midiOutBindingKind(action) !== 'cc') {
      return <Root style={style}>{children}</Root>
    }
    return (
      <Root style={style}>
        {children}
        <MidiOutAssignOverlay action={action} kind="cc" />
      </Root>
    )
  }

  return (
    <Root style={style}>
      {children}
      {isEditing && (
        <Overlay selected={isListening} onClick={onClick}>
          <Wrapper>
            {controlledAction && (
              <>
                {controlledAction.inputID}
                <X action={action} />
                <MinMax>
                  <DraggableNumber
                    type="continuous"
                    style={minMaxStyle}
                    value={controlledAction.options.min}
                    min={sliderBounds.min}
                    max={controlledAction.options.max}
                    onChange={onChangeMin}
                    noArrows
                  />
                  <DraggableNumber
                    type="continuous"
                    style={minMaxStyle}
                    value={controlledAction.options.max}
                    min={controlledAction.options.min}
                    max={sliderBounds.max}
                    onChange={onChangeMax}
                    noArrows
                  />
                </MinMax>
                {controlledAction.options.type === 'note' && (
                  <>
                    <Button
                      fontSize="0.8rem"
                      label={controlledAction.options.mode}
                      onClick={onClickMode}
                    />
                    <Button
                      fontSize="0.8rem"
                      label={controlledAction.options.value}
                      onClick={onClickValue(controlledAction.options.value)}
                    />
                  </>
                )}
                {controlledAction.options.type === 'cc' && (
                  <Button
                    fontSize="0.8rem"
                    label={controlledAction.options.mode}
                    onClick={onClickMode_cc}
                  />
                )}
              </>
            )}
          </Wrapper>
        </Overlay>
      )}
    </Root>
  )
}

function MidiOutAssignOverlay({
  action,
  kind,
}: {
  action: MidiAction
  kind: 'cc' | 'note'
}) {
  const dispatch = useDispatch()
  const midiOutActions = useDeviceSelector((state) => state.midiOutActions)
  const binding = midiOutActions[getActionID(action)] || null

  const assignDefault = () => {
    const channel = 0
    const number = nextFreeMidiOutNumber(midiOutActions, kind, channel)
    dispatch(
      setMidiOutAction({
        action,
        channel,
        cc: number,
        type: kind,
      })
    )
  }

  const patchBinding = (patch: Partial<Pick<MidiOutBinding, 'channel' | 'cc'>>) => {
    if (!binding) return
    dispatch(
      setMidiOutAction({
        ...binding,
        ...patch,
        action,
        type: kind,
      })
    )
  }

  return (
    <Overlay
      selected={binding !== null}
      $tone="out"
      onClick={(e) => e.stopPropagation()}
    >
      <Wrapper $tone="out" onClick={(e) => e.stopPropagation()}>
        {binding ? (
          <OutEditorRow>
            <OutLabel>ch</OutLabel>
            <DraggableNumber
              type="snap"
              style={outEditorStyle}
              value={clampMidiChannel(binding.channel) + 1}
              min={1}
              max={16}
              onChange={(ch) =>
                patchBinding({ channel: clampMidiChannel(ch - 1) })
              }
              noArrows
            />
            <OutLabel>{kind === 'note' ? 'note' : 'cc'}</OutLabel>
            <DraggableNumber
              type="snap"
              style={outEditorStyle}
              value={clampMidiCc(binding.cc)}
              min={0}
              max={127}
              onChange={(n) => patchBinding({ cc: clampMidiCc(n) })}
              noArrows
            />
            <OutX action={action} />
          </OutEditorRow>
        ) : (
          <Button
            fontSize="0.75rem"
            label={kind === 'note' ? 'Assign note' : 'Assign CC'}
            onClick={assignDefault}
          />
        )}
      </Wrapper>
    </Overlay>
  )
}

const BindingRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.15rem;
  font-size: 0.72rem;
`

const OutEditorRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.1rem;
`

const OutLabel = styled.span`
  font-size: 0.7rem;
  font-weight: 600;
  margin: 0 0.1rem;
`

const Root = styled.div`
  position: relative;
  box-sizing: border-box;
  min-width: 0;
  min-height: 0;
`

const Overlay = styled.div<{ selected: boolean; $tone?: 'in' | 'out' }>`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  cursor: default;
  border: ${(props) => props.selected && '2px solid white'};
  background: ${(props) =>
    props.$tone === 'out' ? '#f5a623b7' : '#56fd56b7'};
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  align-content: center;
  color: black;
`

const Wrapper = styled.div<{ $tone?: 'in' | 'out' }>`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  align-content: center;
  background-color: ${(props) =>
    props.$tone === 'out' ? '#f5a623b7' : '#56fd56b7'};
`

const MinMax = styled.div`
  display: flex;
  flex-wrap: wrap-reverse;
  font-size: 0.75rem;
  justify-content: center;
`

function X({ action }: { action: MidiAction }) {
  const dispatch = useDispatch()
  const onClick = () => dispatch(removeMidiAction(action))
  return (
    <div onClick={onClick} style={{ cursor: 'pointer', marginLeft: '0.5rem' }}>
      X
    </div>
  )
}

function OutX({ action }: { action: MidiAction }) {
  const dispatch = useDispatch()
  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    dispatch(removeMidiOutAction(action))
  }
  return (
    <div onClick={onClick} style={{ cursor: 'pointer', marginLeft: '0.5rem' }}>
      X
    </div>
  )
}
