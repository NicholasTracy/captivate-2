import { useEffect, useMemo, useState } from 'react'
import styled from 'styled-components'
import {
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Checkbox,
  TextField,
} from '@mui/material'
import AppModal from '../overlays/AppModal'
import {
  listAssignedFixtureGroupNames,
  planSmartFixtureGroupings,
  type SmartGroupingAxis,
  type SmartGroupingMode,
  type SmartGroupingOptions,
  type SmartGroupingParentMode,
  type SmartGroupingPlan,
  type SmartGroupingScope,
} from '../../shared/smartFixtureGroupings'
import {
  ALL_GROUP_NAME,
  getFixtureGroupPickerOptions,
} from '../../shared/fixtureGroups'
import type { FixtureType, Universe } from '../../shared/dmxFixtures'

export type SmartGroupingsApplyResult = {
  plan: SmartGroupingPlan
  addSplits: boolean
  splitTarget: 'active' | 'all'
}

type Props = {
  open: boolean
  universe: Universe
  fixtureTypesById: { [id: string]: FixtureType }
  zDepthEnabled: boolean
  onClose: () => void
  onApply: (result: SmartGroupingsApplyResult) => void
}

type ModeKey = 'quadrants' | 'evenOdd' | 'axisBins'

function buildMode(
  modeKey: ModeKey,
  axis: SmartGroupingAxis,
  binCount: number
): SmartGroupingMode {
  if (modeKey === 'quadrants') {
    return { type: 'quadrants' }
  }
  if (modeKey === 'evenOdd') {
    return { type: 'evenOdd', axis }
  }
  return { type: 'axisBins', axis, binCount }
}

export default function SmartFixtureGroupingsModal({
  open,
  universe,
  fixtureTypesById,
  zDepthEnabled,
  onClose,
  onApply,
}: Props) {
  const assignedGroups = useMemo(() => {
    const fromPicker = getFixtureGroupPickerOptions(
      universe,
      fixtureTypesById
    ).filter((name) => name !== ALL_GROUP_NAME)
    const assigned = listAssignedFixtureGroupNames(universe)
    const merged = new Set([...fromPicker, ...assigned])
    return Array.from(merged).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    )
  }, [fixtureTypesById, universe])

  const [modeKey, setModeKey] = useState<ModeKey>('quadrants')
  const [axis, setAxis] = useState<SmartGroupingAxis>('x')
  const [binCount, setBinCount] = useState(4)
  const [scopeType, setScopeType] = useState<'all' | 'group'>('all')
  const [scopeGroup, setScopeGroup] = useState('')
  const [parentMode, setParentMode] = useState<SmartGroupingParentMode>('keep')
  const [namePrefix, setNamePrefix] = useState('')
  const [addSplits, setAddSplits] = useState(true)
  const [splitTarget, setSplitTarget] = useState<'active' | 'all'>('active')

  useEffect(() => {
    if (!open) {
      return
    }
    setModeKey('quadrants')
    setAxis('x')
    setBinCount(4)
    setScopeType('all')
    setScopeGroup(assignedGroups[0] ?? '')
    setParentMode('keep')
    setNamePrefix('')
    setAddSplits(true)
    setSplitTarget('active')
  }, [open, assignedGroups])

  useEffect(() => {
    if (axis === 'z' && !zDepthEnabled) {
      setAxis('x')
    }
  }, [axis, zDepthEnabled])

  const options: SmartGroupingOptions = useMemo(() => {
    const scope: SmartGroupingScope =
      scopeType === 'group' && scopeGroup.trim().length > 0
        ? { type: 'group', groupName: scopeGroup.trim() }
        : { type: 'all' }
    return {
      mode: buildMode(modeKey, axis, binCount),
      scope,
      parentMode,
      namePrefix: namePrefix.trim().length > 0 ? namePrefix.trim() : undefined,
    }
  }, [axis, binCount, modeKey, namePrefix, parentMode, scopeGroup, scopeType])

  const plan = useMemo(
    () => planSmartFixtureGroupings(universe, options, fixtureTypesById),
    [fixtureTypesById, options, universe]
  )

  const canApply = plan.assignments.length > 0
  const needsAxis = modeKey !== 'quadrants'
  const scopedToGroup = options.scope.type === 'group'

  if (!open) {
    return null
  }

  return (
    <AppModal
      stack="nestedModal"
      open={open}
      title="Smart groupings"
      maxWidth="34rem"
      onClose={onClose}
      actions={[
        { label: 'Cancel', onClick: onClose },
        {
          label: 'Apply',
          onClick: () => {
            if (!canApply) {
              return
            }
            onApply({ plan, addSplits, splitTarget })
          },
        },
      ]}
    >
      <Intro>
        Auto-assign fixtures to groups from stage placement so chases and split
        scenes can target halves, quadrants, or ordered strips without hand-picking
        each fixture.
      </Intro>

      <Section>
        <SectionTitle>Apply to</SectionTitle>
        <RadioGroup
          value={scopeType}
          onChange={(_, value) => setScopeType(value as 'all' | 'group')}
        >
          <FormControlLabel
            value="all"
            control={<Radio size="small" />}
            label="All patched fixtures"
          />
          <FormControlLabel
            value="group"
            control={<Radio size="small" />}
            label="Fixtures already in a group"
            disabled={assignedGroups.length === 0}
          />
        </RadioGroup>
        {scopeType === 'group' ? (
          <FieldRow>
            <FormControl size="small" fullWidth>
              <InputLabel id="smart-group-scope">Source group</InputLabel>
              <Select
                labelId="smart-group-scope"
                label="Source group"
                value={scopeGroup}
                onChange={(event) => setScopeGroup(String(event.target.value))}
              >
                {assignedGroups.map((group) => (
                  <MenuItem key={group} value={group}>
                    {group}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel id="smart-group-parent-mode">Parent group</InputLabel>
              <Select
                labelId="smart-group-parent-mode"
                label="Parent group"
                value={parentMode}
                onChange={(event) =>
                  setParentMode(event.target.value as SmartGroupingParentMode)
                }
              >
                <MenuItem value="keep">Keep and add subgroups</MenuItem>
                <MenuItem value="replace">Replace with subgroups</MenuItem>
              </Select>
            </FormControl>
          </FieldRow>
        ) : null}
      </Section>

      <Section>
        <SectionTitle>Grouping method</SectionTitle>
        <RadioGroup
          value={modeKey}
          onChange={(_, value) => setModeKey(value as ModeKey)}
        >
          <FormControlLabel
            value="quadrants"
            control={<Radio size="small" />}
            label="Quadrants (front/back × left/right)"
          />
          <FormControlLabel
            value="evenOdd"
            control={<Radio size="small" />}
            label="Even / odd by position order"
          />
          <FormControlLabel
            value="axisBins"
            control={<Radio size="small" />}
            label="Ordered strips along an axis"
          />
        </RadioGroup>

        {needsAxis ? (
          <FieldRow>
            <FormControl size="small" fullWidth>
              <InputLabel id="smart-group-axis">Axis</InputLabel>
              <Select
                labelId="smart-group-axis"
                label="Axis"
                value={axis}
                onChange={(event) =>
                  setAxis(event.target.value as SmartGroupingAxis)
                }
              >
                <MenuItem value="x">X · Left → Right</MenuItem>
                <MenuItem value="y">Y · Front → Back</MenuItem>
                <MenuItem value="z" disabled={!zDepthEnabled}>
                  Z · Low → High{zDepthEnabled ? '' : ' (enable Z depth)'}
                </MenuItem>
              </Select>
            </FormControl>
            {modeKey === 'axisBins' ? (
              <FormControl size="small" fullWidth>
                <InputLabel id="smart-group-bins">Strip count</InputLabel>
                <Select
                  labelId="smart-group-bins"
                  label="Strip count"
                  value={binCount}
                  onChange={(event) => setBinCount(Number(event.target.value))}
                >
                  {[2, 3, 4, 5, 6, 8].map((count) => (
                    <MenuItem key={count} value={count}>
                      {count}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            ) : null}
          </FieldRow>
        ) : null}

        <TextField
          size="small"
          fullWidth
          label="Name prefix (optional)"
          placeholder={
            scopedToGroup
              ? `Defaults to “${options.scope.type === 'group' ? options.scope.groupName : 'Group'}”`
              : 'e.g. Wash, Truss'
          }
          value={namePrefix}
          onChange={(event) => setNamePrefix(event.target.value)}
          helperText="New groups are named like “Wash · Front Left”."
        />
      </Section>

      <Section>
        <SectionTitle>Scene splits</SectionTitle>
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={addSplits}
              onChange={(_, checked) => setAddSplits(checked)}
            />
          }
          label="Create dedicated splits for the new groups"
        />
        {addSplits ? (
          <RadioGroup
            value={splitTarget}
            onChange={(_, value) => setSplitTarget(value as 'active' | 'all')}
          >
            <FormControlLabel
              value="active"
              control={<Radio size="small" />}
              label="Active light scene only"
            />
            <FormControlLabel
              value="all"
              control={<Radio size="small" />}
              label="Every light scene"
            />
          </RadioGroup>
        ) : null}
      </Section>

      <Preview>
        <PreviewTitle>
          Preview · {plan.assignments.length} fixture
          {plan.assignments.length === 1 ? '' : 's'}
          {plan.skippedCount > 0
            ? ` (${plan.skippedCount} outside scope)`
            : ''}
        </PreviewTitle>
        {plan.buckets.length === 0 ? (
          <EmptyHint>
            {universe.length === 0
              ? 'Patch fixtures first, then place them on the map.'
              : scopedToGroup
                ? 'No fixtures found in that group.'
                : 'Nothing to assign.'}
          </EmptyHint>
        ) : (
          <BucketList>
            {plan.buckets.map((bucket) => (
              <BucketRow key={bucket.name}>
                <span>{bucket.name}</span>
                <strong>
                  {bucket.count} fixture{bucket.count === 1 ? '' : 's'}
                </strong>
              </BucketRow>
            ))}
          </BucketList>
        )}
      </Preview>
    </AppModal>
  )
}

const Intro = styled.p`
  margin: 0 0 0.85rem;
  font-size: 0.82rem;
  line-height: 1.45;
  color: ${(p) => p.theme.colors.text.secondary};
`

const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  margin-bottom: 0.9rem;
`

const SectionTitle = styled.h3`
  margin: 0;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: ${(p) => p.theme.colors.text.secondary};
`

const FieldRow = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.55rem;

  @media (min-width: 520px) {
    grid-template-columns: 1fr 1fr;
  }
`

const Preview = styled.div`
  border-radius: 0.3rem;
  border: 1px solid ${(p) => p.theme.colors.divider};
  background: ${(p) => p.theme.colors.bg.darker};
  padding: 0.55rem 0.65rem;
`

const PreviewTitle = styled.div`
  font-size: 0.78rem;
  font-weight: 600;
  margin-bottom: 0.4rem;
`

const BucketList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-height: 9rem;
  overflow-y: auto;
`

const BucketRow = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.8rem;
`

const EmptyHint = styled.div`
  font-size: 0.8rem;
  color: ${(p) => p.theme.colors.text.secondary};
`
