import { useMemo, useState } from 'react'
import { useDispatch } from 'react-redux'
import Popover from '@mui/material/Popover'
import styled from 'styled-components'
import {
  useActiveLightScene,
  useControlSelector,
  useDmxSelector,
} from '../redux/store'
import {
  resetGroupIntensities,
  setGroupIntensity,
} from '../redux/controlSlice'
import {
  ALL_GROUP_NAME,
  collectReferencedSceneGroupNames,
  filterGroupsForActiveUseLists,
  getFixtureGroupPickerOptions,
} from '../../shared/fixtureGroups'
import { universeHasMovers } from '../../shared/dmxFixtures'
import Slider from '../base/Slider'
import { SliderMidiOverlay } from '../base/MidiOverlay'
import { makeSetGroupIntensityAction } from '../redux/deviceState'

export default function GroupIntensityButton() {
  const dispatch = useDispatch()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const groupIntensity = useControlSelector((state) => state.groupIntensity)
  const splitScenes = useActiveLightScene((scene) => scene.splitScenes)
  const dmx = useDmxSelector((state) => state)
  const open = anchor !== null

  const groupNames = useMemo(() => {
    const names = new Set(
      getFixtureGroupPickerOptions(dmx.universe, dmx.fixtureTypesByID)
    )
    names.delete(ALL_GROUP_NAME)
    for (const led of dmx.led.ledFixtures) {
      for (const group of led.groups ?? []) {
        const trimmed = group.trim()
        if (trimmed.length > 0 && trimmed.toLowerCase() !== 'all') {
          names.add(trimmed)
        }
      }
    }
    if (universeHasMovers(dmx.universe, dmx.fixtureTypesByID)) {
      names.add('Movers')
    }

    // Keep intensity-keyed / split-referenced names visible even if the type
    // briefly leaves the universe; auto type-groups stay hidden until used.
    const referenced = collectReferencedSceneGroupNames(splitScenes)
    for (const name of Object.keys(groupIntensity)) {
      referenced.add(name)
    }
    for (const name of referenced) {
      if (name.toLowerCase() !== 'all') names.add(name)
    }

    return filterGroupsForActiveUseLists(Array.from(names), {
      universe: dmx.universe,
      fixtureTypesById: dmx.fixtureTypesByID,
      referencedNames: referenced,
    }).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [
    dmx.universe,
    dmx.fixtureTypesByID,
    dmx.led.ledFixtures,
    splitScenes,
    groupIntensity,
  ])

  const anyReduced = Object.values(groupIntensity).some(
    (level) => typeof level === 'number' && level < 0.999
  )

  const intensityFor = (name: string): number => {
    const direct = groupIntensity[name]
    if (typeof direct === 'number' && Number.isFinite(direct)) {
      return direct
    }
    const needle = name.toLowerCase()
    for (const [key, value] of Object.entries(groupIntensity)) {
      if (key.toLowerCase() === needle) return value
    }
    return 1
  }

  return (
    <>
      <Root
        type="button"
        title="Group max brightness — ceilings under master"
        aria-haspopup="dialog"
        aria-expanded={open}
        $active={open || anyReduced}
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        <Label>GRP</Label>
        {anyReduced ? <ActiveDot aria-hidden /> : null}
      </Root>
      <Popover
        open={open}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'center', horizontal: 'right' }}
        transformOrigin={{ vertical: 'center', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              ml: 1,
              p: 1.25,
              minWidth: '16rem',
              maxWidth: '20rem',
              maxHeight: 'min(28rem, 70vh)',
              overflow: 'auto',
            },
          },
        }}
      >
        <PopoverTitle>Group intensity</PopoverTitle>
        <PopoverHint>
          Max brightness per named group (under Master). Fixtures in several
          groups use the lowest value.
        </PopoverHint>
        {groupNames.length === 0 ? (
          <EmptyHint>No fixture groups yet — assign groups on the Universe page.</EmptyHint>
        ) : (
          <List>
            {groupNames.map((name) => {
              const value = intensityFor(name)
              const percent = Math.round(value * 100)
              return (
                <Row key={name}>
                  <RowLabel title={name}>{name}</RowLabel>
                  <SliderWrap>
                    <SliderMidiOverlay
                      action={makeSetGroupIntensityAction(name)}
                      style={{ width: '100%', height: '100%' }}
                    >
                      <Slider
                        orientation="horizontal"
                        radius={0.4}
                        value={value}
                        onChange={(next) => {
                          dispatch(
                            setGroupIntensity({ group: name, intensity: next })
                          )
                        }}
                        title={`${name} max brightness`}
                      />
                    </SliderMidiOverlay>
                  </SliderWrap>
                  <Percent>{percent}%</Percent>
                </Row>
              )
            })}
          </List>
        )}
        {groupNames.length > 0 ? (
          <ResetRow>
            <ResetButton
              type="button"
              onClick={() => dispatch(resetGroupIntensities())}
            >
              Reset all to 100%
            </ResetButton>
          </ResetRow>
        ) : null}
      </Popover>
    </>
  )
}

const Root = styled.button<{ $active: boolean }>`
  width: 100%;
  flex: 0 0 auto;
  min-height: 2.1rem;
  padding: 0.28rem 0.1rem;
  box-sizing: border-box;
  border-radius: 0;
  border-top: 1px solid ${(p) => p.theme.colors.divider};
  border-bottom: 1px solid ${(p) => p.theme.colors.divider};
  border-left: none;
  border-right: none;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.15rem;
  background: ${(p) =>
    p.$active
      ? p.theme.colors.accentMuted
      : p.theme.colors.bg.raised};
  color: ${(p) =>
    p.$active ? p.theme.colors.accent : p.theme.colors.button.text};
  box-shadow:
    ${(p) => p.theme.elevation.insetHighlight},
    ${(p) => p.theme.elevation.shadowSm};

  &:hover {
    box-shadow:
      ${(p) => p.theme.elevation.insetHighlight},
      ${(p) => p.theme.elevation.shadowMd};
  }
`

const Label = styled.span`
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  line-height: 1;
`

const ActiveDot = styled.span`
  width: 0.35rem;
  height: 0.35rem;
  border-radius: 999px;
  background: ${(p) => p.theme.colors.accent};
`

const PopoverTitle = styled.div`
  font-size: 0.85rem;
  font-weight: 700;
  color: ${(p) => p.theme.colors.text.primary};
  margin-bottom: 0.25rem;
`

const PopoverHint = styled.p`
  margin: 0 0 0.65rem;
  font-size: 0.68rem;
  line-height: 1.35;
  color: ${(p) => p.theme.colors.text.secondary};
`

const EmptyHint = styled.div`
  font-size: 0.72rem;
  color: ${(p) => p.theme.colors.text.secondary};
  padding: 0.35rem 0;
`

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
`

const Row = styled.div`
  display: grid;
  grid-template-columns: 4.2rem 1fr 2.4rem;
  align-items: center;
  gap: 0.35rem;
`

const RowLabel = styled.div`
  font-size: 0.68rem;
  font-weight: 600;
  color: ${(p) => p.theme.colors.text.primary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const SliderWrap = styled.div`
  height: 1.1rem;
  min-width: 0;
  position: relative;
`

const Percent = styled.div`
  font-size: 0.64rem;
  font-variant-numeric: tabular-nums;
  text-align: right;
  color: ${(p) => p.theme.colors.text.secondary};
`

const ResetRow = styled.div`
  margin-top: 0.7rem;
  display: flex;
  justify-content: flex-end;
`

const ResetButton = styled.button`
  border: 1px solid ${(p) => p.theme.colors.divider};
  background: ${(p) => p.theme.colors.bg.panel};
  color: ${(p) => p.theme.colors.button.text};
  border-radius: 0.28rem;
  padding: 0.22rem 0.45rem;
  font-size: 0.68rem;
  cursor: pointer;
  box-shadow: ${(p) => p.theme.elevation.shadowSm};

  &:hover {
    background: ${(p) => p.theme.colors.bg.raised};
  }
`
