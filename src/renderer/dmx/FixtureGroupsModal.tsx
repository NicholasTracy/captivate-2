import { useEffect, useMemo, useState } from 'react'
import styled from 'styled-components'
import { Button, Checkbox, FormControlLabel, TextField } from '@mui/material'
import AppModal from '../overlays/AppModal'
import {
  ALL_GROUP_NAME,
  isAllGroupName,
  isAutoFixtureTypeGroupName,
  normalizeFixtureGroupList,
  normalizeFixtureGroupName,
} from '../../shared/fixtureGroups'
import type { FixtureType, Universe } from '../../shared/dmxFixtures'

type Props = {
  open: boolean
  fixtureLabel: string
  selectedGroups: string[]
  availableGroups: string[]
  /** When set, auto fixture-type groups are labeled in the list. */
  universe?: Universe
  fixtureTypesById?: { [id: string]: FixtureType }
  onClose: () => void
  onSave: (groups: string[]) => void
}

export default function FixtureGroupsModal({
  open,
  fixtureLabel,
  selectedGroups,
  availableGroups,
  universe,
  fixtureTypesById,
  onClose,
  onSave,
}: Props) {
  const [draft, setDraft] = useState<string[]>(selectedGroups)
  const [newGroup, setNewGroup] = useState('')

  useEffect(() => {
    if (open) {
      setDraft(normalizeFixtureGroupList(selectedGroups))
      setNewGroup('')
    }
  }, [open, selectedGroups])

  const pickerGroups = useMemo(() => {
    const merged = normalizeFixtureGroupList([...availableGroups, ...draft]).filter(
      (group) => !isAllGroupName(group)
    )
    return merged.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [availableGroups, draft])

  function groupLabel(group: string): string {
    if (
      universe !== undefined &&
      fixtureTypesById !== undefined &&
      isAutoFixtureTypeGroupName(group, universe, fixtureTypesById)
    ) {
      return `${group} (type)`
    }
    return group
  }

  if (!open) {
    return null
  }

  function toggleGroup(group: string) {
    if (isAllGroupName(group)) return
    setDraft((current) => {
      const set = new Set(current)
      if (set.has(group)) {
        set.delete(group)
      } else {
        set.add(group)
      }
      return normalizeFixtureGroupList(Array.from(set))
    })
  }

  function addNewGroup() {
    const name = normalizeFixtureGroupName(newGroup)
    if (name === null || isAllGroupName(name) || name === ALL_GROUP_NAME) {
      return
    }
    setDraft((current) => normalizeFixtureGroupList([...current, name]))
    setNewGroup('')
  }

  return (
    <AppModal
      stack="nestedModal"
      open={open}
      title="Fixture groups"
      maxWidth="28rem"
      onClose={onClose}
      actions={[
        { label: 'Cancel', onClick: onClose },
        {
          label: 'Save',
          onClick: () =>
            onSave(
              normalizeFixtureGroupList(
                draft.filter((group) => !isAllGroupName(group))
              )
            ),
        },
      ]}
    >
      <Intro>
        Assign scene/split groups for <strong>{fixtureLabel}</strong>. Each patched
        fixture can belong to different groups, even when they share the same fixture
        type. Fixture-type labels (marked <em>type</em>) match automatically by
        definition name; you can also pin them here alongside smart or custom groups.
      </Intro>

      <GroupList>
        {pickerGroups.length === 0 ? (
          <EmptyHint>
            Patch fixtures on the universe to see fixture-type groups, or add a custom
            group below.
          </EmptyHint>
        ) : (
          pickerGroups.map((group) => (
            <FormControlLabel
              key={group}
              control={
                <Checkbox
                  size="small"
                  checked={draft.includes(group)}
                  onChange={() => toggleGroup(group)}
                />
              }
              label={groupLabel(group)}
            />
          ))
        )}
      </GroupList>

      <AddRow>
        <TextField
          size="small"
          fullWidth
          label="New group"
          placeholder="e.g. Front truss, Movers left"
          value={newGroup}
          onChange={(event) => setNewGroup(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              addNewGroup()
            }
          }}
        />
        <Button
          variant="outlined"
          size="small"
          disabled={normalizeFixtureGroupName(newGroup) === null}
          onClick={addNewGroup}
        >
          Add
        </Button>
      </AddRow>
    </AppModal>
  )
}

const Intro = styled.p`
  margin: 0 0 0.75rem;
  font-size: 0.82rem;
  line-height: 1.45;
  color: ${(p) => p.theme.colors.text.secondary};
`

const GroupList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  max-height: min(40vh, 16rem);
  overflow-y: auto;
  margin-bottom: 0.75rem;
  padding: 0.35rem 0.5rem;
  border-radius: 0.3rem;
  border: 1px solid ${(p) => p.theme.colors.divider};
  background: ${(p) => p.theme.colors.bg.darker};
`

const EmptyHint = styled.div`
  font-size: 0.8rem;
  color: ${(p) => p.theme.colors.text.secondary};
  padding: 0.35rem 0;
`

const AddRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
`
