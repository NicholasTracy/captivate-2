import React from 'react'
import { useDispatch } from 'react-redux'
import styled from 'styled-components'
import Modulators from '../scenes/Modulators'
import SplitPane from '../base/SplitPane'
import SplitScenes from 'renderer/scenes/SplitScenes'
import StatusBar from '../menu/StatusBar'
import { LfoModulatorsHelpButton } from '../scenes/sceneHelpButtons'
import { ButtonMidiOverlay } from '../base/MidiOverlay'
import { useControlSelector } from '../redux/store'
import { useRealtimeSelector } from '../redux/realtimeStore'
import { OneShotEditProvider } from '../redux/oneShotEdit'
import {
  addOneShot,
  removeOneShot,
  setOneShotBeats,
  setOneShotEditing,
  setOneShotName,
  triggerOneShot,
} from '../redux/controlSlice'
import type { OneShot_t } from '../../shared/oneShots'

export default function OneShots() {
  const dispatch = useDispatch()
  const oneShots = useControlSelector((state) => state.oneShots)
  const beatsNow = useRealtimeSelector((state) => state.time.beats)
  const editing = oneShots.editingId
    ? oneShots.byId[oneShots.editingId]
    : undefined

  const splitPaneStyle: React.CSSProperties = {
    flex: '1 1 0',
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
  }

  return (
    <Root>
      <StatusBar />
      <SplitPane
        style={splitPaneStyle}
        type="vertical"
        initialSplit={0.34}
        rem={0.5}
        min={0.22}
        max={0.5}
      >
        <Pane>
          <ListHeader>
            <ListTitle>One-shots</ListTitle>
            <AddButton type="button" onClick={() => dispatch(addOneShot())}>
              Add
            </AddButton>
          </ListHeader>
          <Hint>
            Each trigger plays once for the beats you set, over the current
            scene. Add only the parameters it should take over. When it
            finishes, the scene has those parameters again.
          </Hint>
          <List>
            {oneShots.ids.length === 0 ? (
              <Empty>No one-shots yet.</Empty>
            ) : (
              oneShots.ids.map((id) => {
                const shot = oneShots.byId[id]
                if (!shot) return null
                return (
                  <OneShotRow
                    key={id}
                    id={id}
                    shot={shot}
                    selected={id === oneShots.editingId}
                    beatsNow={beatsNow}
                    startBeat={
                      oneShots.playing.find((play) => play.id === id)?.startBeat
                    }
                  />
                )
              })
            )}
          </List>
        </Pane>
        <Pane>
          {editing && oneShots.editingId ? (
            <OneShotEditProvider id={oneShots.editingId}>
              <Column>
                <ModulatorsHeader>
                  <ModulatorsTitle>LFO Modulators</ModulatorsTitle>
                  <LfoModulatorsHelpButton />
                </ModulatorsHeader>
                <ModulatorsHost>
                  <Modulators />
                </ModulatorsHost>
                <Sp />
                <SplitScenes />
              </Column>
            </OneShotEditProvider>
          ) : (
            <EmptyEditor>Add a one-shot to set what it overrides.</EmptyEditor>
          )}
        </Pane>
      </SplitPane>
    </Root>
  )
}

function OneShotRow({
  id,
  shot,
  selected,
  beatsNow,
  startBeat,
}: {
  id: string
  shot: OneShot_t
  selected: boolean
  beatsNow: number
  startBeat: number | undefined
}) {
  const dispatch = useDispatch()
  const remaining =
    startBeat === undefined ? 0 : shot.beats - (beatsNow - startBeat)
  const active = remaining > 0.001

  return (
    <Row
      $selected={selected}
      onClick={() => dispatch(setOneShotEditing(id))}
    >
      <ButtonMidiOverlay
        action={{ type: 'fireOneShot', oneShotId: id }}
        style={{ flex: '0 0 auto' }}
      >
        <Trigger
          type="button"
          $active={active}
          onClick={(event) => {
            event.stopPropagation()
            dispatch(setOneShotEditing(id))
            dispatch(triggerOneShot({ id, startBeat: beatsNow }))
          }}
        >
          {active ? remaining.toFixed(1) : 'Trigger'}
        </Trigger>
      </ButtonMidiOverlay>
      <NameInput
        value={shot.name}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) =>
          dispatch(setOneShotName({ id, name: event.target.value }))
        }
      />
      <Beats
        type="number"
        min={0.25}
        max={64}
        step={0.25}
        value={shot.beats}
        title="Beats this one-shot plays"
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => {
          const beats = Number(event.target.value)
          if (!Number.isFinite(beats)) return
          dispatch(setOneShotBeats({ id, beats }))
        }}
      />
      <BeatsLabel>beats</BeatsLabel>
      <Remove
        type="button"
        title="Delete one-shot"
        onClick={(event) => {
          event.stopPropagation()
          dispatch(removeOneShot(id))
        }}
      >
        ×
      </Remove>
    </Row>
  )
}

const Root = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
`

const Pane = styled.div`
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`

const ListHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.75rem 0.75rem 0.25rem;
`

const ListTitle = styled.div`
  font-size: ${(props) => props.theme.font.size.h1};
  color: ${(props) => props.theme.colors.text.primary};
`

const Hint = styled.p`
  margin: 0;
  padding: 0 0.75rem 0.5rem;
  color: ${(props) => props.theme.colors.text.secondary};
  font-size: 0.85rem;
  line-height: 1.35;
`

const List = styled.div`
  flex: 1 1 0;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0 0.75rem 0.75rem;
`

const Row = styled.div<{ $selected: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem;
  border-radius: 0.35rem;
  border: 1px solid
    ${(props) =>
      props.$selected ? '#ffd64a' : props.theme.colors.divider};
  background: ${(props) =>
    props.$selected
      ? 'rgba(255, 214, 74, 0.12)'
      : props.theme.colors.bg.panel};
`

const Trigger = styled.button<{ $active: boolean }>`
  min-width: 4.6rem;
  height: 2rem;
  border: 0;
  border-radius: 0.3rem;
  cursor: pointer;
  font-weight: 600;
  color: #1a1404;
  background: ${(props) => (props.$active ? '#ffe38a' : '#ffd64a')};
`

const NameInput = styled.input`
  flex: 1 1 0;
  min-width: 0;
  height: 2rem;
  border-radius: 0.3rem;
  border: 1px solid ${(props) => props.theme.colors.divider};
  background: ${(props) => props.theme.colors.bg.darker};
  color: ${(props) => props.theme.colors.text.primary};
  padding: 0 0.45rem;
`

const Beats = styled.input`
  width: 3.6rem;
  height: 2rem;
  border-radius: 0.3rem;
  border: 1px solid ${(props) => props.theme.colors.divider};
  background: ${(props) => props.theme.colors.bg.darker};
  color: ${(props) => props.theme.colors.text.primary};
  padding: 0 0.3rem;
`

const BeatsLabel = styled.span`
  color: ${(props) => props.theme.colors.text.secondary};
  font-size: 0.8rem;
`

const AddButton = styled.button`
  height: 1.8rem;
  padding: 0 0.7rem;
  border: 0;
  border-radius: 0.3rem;
  cursor: pointer;
  font-weight: 600;
  color: #1a1404;
  background: #ffd64a;
`

const Remove = styled.button`
  width: 1.8rem;
  height: 2rem;
  border: 0;
  border-radius: 0.3rem;
  cursor: pointer;
  background: transparent;
  color: ${(props) => props.theme.colors.text.secondary};
  font-size: 1.2rem;
  line-height: 1;
`

const Empty = styled.div`
  color: ${(props) => props.theme.colors.text.secondary};
  padding: 0.5rem 0.15rem;
`

const EmptyEditor = styled.div`
  margin: auto;
  color: ${(props) => props.theme.colors.text.secondary};
`

const Column = styled.div`
  display: flex;
  flex-direction: column;
  padding: 1rem;
  min-width: 0;
  min-height: 0;
  flex: 1 1 0;
  overflow: hidden;
`

const ModulatorsHost = styled.div`
  flex-shrink: 0;
  min-width: 0;
  width: 100%;
`

const ModulatorsHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.15rem;
  flex-shrink: 0;
  margin-bottom: 0.35rem;
`

const ModulatorsTitle = styled.div`
  font-size: ${(props) => props.theme.font.size.h1};
  color: ${(props) => props.theme.colors.text.primary};
`

const Sp = styled.div`
  flex-shrink: 0;
  height: 1rem;
`
