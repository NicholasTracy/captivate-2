import { useMemo, useState } from 'react'
import styled from 'styled-components'
import { useDispatch } from 'react-redux'
import WizardModal, { WizardStepDef } from '../overlays/WizardModal'
import { useDmxSelector, useTypedSelector } from '../redux/store'
import {
  setSceneGenerationWizardOpen,
  pushStatusMessage,
} from '../redux/guiSlice'
import { resetLightScenes } from '../redux/controlSlice'
import {
  analyzeRigProfile,
  generateLightScenesForRig,
  mergeGeneratedLightScenes,
  SCENE_GENERATION_COUNT_DEFAULT,
  SCENE_GENERATION_COUNT_MAX,
  SCENE_GENERATION_COUNT_MIN,
  type SceneGenerationCommitMode,
  type SceneGenerationLookPrefs,
  DEFAULT_SCENE_GENERATION_LOOK,
} from '../../shared/sceneGeneration'

const STEPS: WizardStepDef[] = [
  {
    key: 'setup',
    title: 'Your lights',
    description:
      'Captivate will build scenes that fit the lights you already have patched.',
  },
  {
    key: 'style',
    title: 'Style',
    description:
      'Pick how many scenes you want and what kinds of looks to include.',
  },
  {
    key: 'create',
    title: 'Create',
    description:
      'Add these scenes to your show, or replace your current light scenes.',
  },
]

type StyleOption = {
  key: keyof Pick<
    SceneGenerationLookPrefs,
    | 'beatReactive'
    | 'audioBands'
    | 'spatialSplits'
    | 'moverShowcases'
    | 'peakStrobe'
  >
  title: string
  detail: string
  available: boolean
  unavailableReason?: string
}

export default function SceneGenerationWizard() {
  const dispatch = useDispatch()
  const open = useTypedSelector((state) => state.gui.sceneGenerationWizardOpen)
  const dmx = useDmxSelector((state) => state)
  const existingLight = useTypedSelector((state) => state.control.present.light)

  const profile = useMemo(
    () =>
      analyzeRigProfile({
        universe: dmx.universe,
        fixtureTypesByID: dmx.fixtureTypesByID,
      }),
    [dmx.fixtureTypesByID, dmx.universe]
  )

  const [stepIndex, setStepIndex] = useState(0)
  const [sceneCount, setSceneCount] = useState(SCENE_GENERATION_COUNT_DEFAULT)
  const [epicnessBias, setEpicnessBias] = useState(0.5)
  const [look, setLook] = useState<SceneGenerationLookPrefs>({
    ...DEFAULT_SCENE_GENERATION_LOOK,
  })
  const [mode, setMode] = useState<SceneGenerationCommitMode>('append')
  const [seed, setSeed] = useState(() => String(Date.now()))
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  const styleOptions = useMemo((): StyleOption[] => {
    return [
      {
        key: 'beatReactive',
        title: 'Pulse with the beat',
        detail: 'Scenes that flash and move in time with the music.',
        available: true,
      },
      {
        key: 'audioBands',
        title: 'Follow the music',
        detail: 'React to bass, drums, and other parts of the song.',
        available: true,
      },
      {
        key: 'spatialSplits',
        title: 'Different areas of the stage',
        detail:
          'Left/right zones plus chases that run color or blanking across the stage.',
        available: true,
      },
      {
        key: 'moverShowcases',
        title: 'Moving-head looks',
        detail: 'Extra scenes for pan, tilt, and sweeping beams.',
        available: profile.hasMovers,
        unavailableReason: 'No moving lights found',
      },
      {
        key: 'peakStrobe',
        title: 'High-energy strobe',
        detail: 'Add strobe for the loudest, most intense scenes.',
        available: profile.hasStrobe,
        unavailableReason: 'No strobe channels found',
      },
    ]
  }, [profile.hasMovers, profile.hasStrobe])

  function close() {
    dispatch(setSceneGenerationWizardOpen(false))
    setStepIndex(0)
    setShowAdvanced(false)
    setIsCreating(false)
  }

  function patchLook(patch: Partial<SceneGenerationLookPrefs>) {
    setLook((prev) => ({ ...prev, ...patch }))
  }

  function generate() {
    if (isCreating) {
      return
    }
    setIsCreating(true)
    try {
      const generated = generateLightScenesForRig(
        {
          universe: dmx.universe,
          fixtureTypesByID: dmx.fixtureTypesByID,
        },
        {
          seed,
          preserveAuto: existingLight.auto,
          sceneCount,
          epicnessBias,
          look: {
            ...look,
            moverShowcases: look.moverShowcases && profile.hasMovers,
            peakStrobe: look.peakStrobe && profile.hasStrobe,
          },
        }
      )
      if (generated.ids.length <= 0) {
        throw new Error('No scenes were created. Try a higher scene count.')
      }
      const merged = mergeGeneratedLightScenes(existingLight, generated, {
        mode,
      })
      dispatch(resetLightScenes(merged))
      dispatch(
        pushStatusMessage({
          level: 'info',
          message:
            mode === 'append'
              ? `Added ${generated.ids.length} light scenes (${merged.ids.length} total).`
              : `Created ${generated.ids.length} new light scenes.`,
        })
      )
      close()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong while creating scenes.'
      console.error('Scene generation failed', err)
      dispatch(
        pushStatusMessage({
          level: 'error',
          message: `Could not create scenes: ${message}`,
        })
      )
      setIsCreating(false)
    }
  }

  if (!open) {
    return null
  }

  const energyLabel =
    epicnessBias < 0.35 ? 'Calm' : epicnessBias > 0.65 ? 'High energy' : 'Balanced'

  const foundChips: string[] = []
  if (profile.fixtureCount > 0) {
    foundChips.push(
      `${profile.fixtureCount} light${profile.fixtureCount === 1 ? '' : 's'}`
    )
  }
  if (profile.usableGroups.length > 0) {
    foundChips.push(
      profile.usableGroups.length === 1
        ? `Group: ${profile.usableGroups[0]}`
        : `${profile.usableGroups.length} groups`
    )
  }
  if (profile.groupFamilies.length > 0) {
    const best = profile.groupFamilies[0]!
    foundChips.push(
      best.label === 'Stage groups'
        ? `${best.groups.length}-way group split`
        : `${best.label} (${best.groups.length})`
    )
  }
  if (profile.hasMovers) foundChips.push('Moving heads')
  if (profile.hasStrobe) foundChips.push('Strobe')
  if (profile.hasAtmos) foundChips.push('Atmosphere')

  return (
    <WizardModal
      open={open}
      title="Create light scenes"
      steps={STEPS}
      stepIndex={stepIndex}
      onClose={close}
      onBack={() => setStepIndex((step) => Math.max(0, step - 1))}
      onNext={() =>
        setStepIndex((step) => Math.min(STEPS.length - 1, step + 1))
      }
      onSave={generate}
      saveLabel={
        isCreating
          ? 'Creating…'
          : mode === 'append'
            ? 'Create scenes'
            : 'Replace & create'
      }
      maxWidth="min(34rem, calc(100vw - 2rem))"
      minHeight="min(32rem, calc(100dvh - 2rem))"
    >
      {stepIndex === 0 && (
        <Stack>
          {profile.fixtureCount === 0 ? (
            <Notice>
              No lights are patched yet. You can still create scenes — they will
              use a simple full-stage layout. Patch lights first for the best
              results.
            </Notice>
          ) : (
            <>
              <Lead>
                Here is what Captivate found in your project. Scenes will be
                shaped around this setup.
              </Lead>
              <ChipRow>
                {foundChips.map((chip) => (
                  <Chip key={chip}>{chip}</Chip>
                ))}
              </ChipRow>
              {profile.groupFamilies.length > 0 ? (
                <Muted>
                  Smart / related groups will drive chase and split scenes:{' '}
                  {profile.groupFamilies
                    .slice(0, 2)
                    .map((family) =>
                      family.label === 'Stage groups'
                        ? family.groups.slice(0, 4).join(', ')
                        : `${family.label} (${family.groups.length})`
                    )
                    .join(' · ')}
                  {profile.groupFamilies.length > 2 ? '…' : ''}
                </Muted>
              ) : profile.usableGroups.length > 1 ? (
                <Muted>
                  Groups:{' '}
                  {profile.usableGroups.slice(0, 5).join(', ')}
                  {profile.usableGroups.length > 5 ? '…' : ''}
                </Muted>
              ) : null}
            </>
          )}
          <Muted>
            You already have {existingLight.ids.length} light scene
            {existingLight.ids.length === 1 ? '' : 's'}. You can keep them and
            add more on the last step.
          </Muted>
        </Stack>
      )}

      {stepIndex === 1 && (
        <Stack>
          <ControlBlock>
            <ControlHeader>
              <ControlTitle>Number of scenes</ControlTitle>
              <ControlValue>{sceneCount}</ControlValue>
            </ControlHeader>
            <Slider
              aria-label="Number of scenes"
              type="range"
              min={SCENE_GENERATION_COUNT_MIN}
              max={SCENE_GENERATION_COUNT_MAX}
              value={sceneCount}
              onChange={(event) => setSceneCount(Number(event.target.value))}
            />
            <SliderHints>
              <span>Fewer</span>
              <span>More</span>
            </SliderHints>
          </ControlBlock>

          <ControlBlock>
            <ControlHeader>
              <ControlTitle>Overall vibe</ControlTitle>
              <ControlValue>{energyLabel}</ControlValue>
            </ControlHeader>
            <Slider
              aria-label="Overall vibe"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={epicnessBias}
              onChange={(event) => setEpicnessBias(Number(event.target.value))}
            />
            <SliderHints>
              <span>Calm</span>
              <span>High energy</span>
            </SliderHints>
          </ControlBlock>

          <SectionLabel>Include these looks</SectionLabel>
          <OptionList>
            {styleOptions.map((option) => {
              const checked = look[option.key] === true
              const disabled = !option.available
              return (
                <OptionCard
                  key={option.key}
                  $active={checked && !disabled}
                  $disabled={disabled}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    if (disabled) return
                    patchLook({ [option.key]: !checked })
                  }}
                >
                  <OptionCheck aria-hidden>{checked && !disabled ? '✓' : ''}</OptionCheck>
                  <OptionText>
                    <OptionTitle>{option.title}</OptionTitle>
                    <OptionDetail>
                      {disabled ? option.unavailableReason : option.detail}
                    </OptionDetail>
                  </OptionText>
                </OptionCard>
              )
            })}
          </OptionList>
        </Stack>
      )}

      {stepIndex === 2 && (
        <Stack>
          <SectionLabel>What should happen to your current scenes?</SectionLabel>
          <ChoiceRow>
            <ChoiceCard
              type="button"
              $active={mode === 'append'}
              onClick={() => setMode('append')}
            >
              <ChoiceTitle>Add to my show</ChoiceTitle>
              <ChoiceDetail>
                Keep your {existingLight.ids.length} existing scene
                {existingLight.ids.length === 1 ? '' : 's'} and add about{' '}
                {sceneCount} new ones.
              </ChoiceDetail>
            </ChoiceCard>
            <ChoiceCard
              type="button"
              $active={mode === 'replace'}
              $warn
              onClick={() => setMode('replace')}
            >
              <ChoiceTitle>Start fresh</ChoiceTitle>
              <ChoiceDetail>
                Remove your current light scenes and create about {sceneCount}{' '}
                new ones.
              </ChoiceDetail>
            </ChoiceCard>
          </ChoiceRow>

          <ReviewBox>
            <ReviewLine>
              <strong>~{sceneCount}</strong> new scenes · {energyLabel.toLowerCase()}{' '}
              vibe
            </ReviewLine>
            <ReviewLine>
              {mode === 'append'
                ? `Added to your existing ${existingLight.ids.length}`
                : 'Replaces all current light scenes'}
            </ReviewLine>
          </ReviewBox>

          <AdvancedToggle
            type="button"
            onClick={() => setShowAdvanced((openAdvanced) => !openAdvanced)}
          >
            {showAdvanced ? 'Hide advanced options' : 'Advanced options'}
          </AdvancedToggle>
          {showAdvanced && (
            <AdvancedPanel>
              <Muted>
                Change this only if you want the same results again later.
              </Muted>
              <AdvancedRow>
                <AdvancedLabel htmlFor="scene-gen-seed">Random seed</AdvancedLabel>
                <AdvancedInput
                  id="scene-gen-seed"
                  value={seed}
                  onChange={(event) => setSeed(event.target.value)}
                />
                <AdvancedButton
                  type="button"
                  onClick={() => setSeed(String(Date.now()))}
                >
                  Shuffle
                </AdvancedButton>
              </AdvancedRow>
            </AdvancedPanel>
          )}
        </Stack>
      )}
    </WizardModal>
  )
}

const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
`

const Lead = styled.p`
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.4;
  color: #dceaff;
`

const Muted = styled.p`
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.4;
  color: #9eb0c8;
`

const Notice = styled.div`
  padding: 0.55rem 0.65rem;
  border-radius: 0.35rem;
  border: 1px solid #8a704088;
  background: #2a2418aa;
  color: #f0e2c8;
  font-size: 0.8rem;
  line-height: 1.4;
`

const ChipRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
`

const Chip = styled.span`
  font-size: 0.72rem;
  font-weight: 600;
  color: #e4efff;
  background: #2a4a7a66;
  border: 1px solid #5a8fd6aa;
  border-radius: 999px;
  padding: 0.18rem 0.55rem;
`

const ControlBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`

const ControlHeader = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
`

const ControlTitle = styled.div`
  font-size: 0.8rem;
  font-weight: 600;
  color: #dceaff;
`

const ControlValue = styled.div`
  font-size: 0.8rem;
  font-weight: 700;
  color: #f0f6ff;
  font-variant-numeric: tabular-nums;
`

const Slider = styled.input`
  width: 100%;
  accent-color: #6ea8fe;
`

const SliderHints = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 0.68rem;
  color: #8fa3bd;
`

const SectionLabel = styled.div`
  font-size: 0.78rem;
  font-weight: 600;
  color: #c5dcff;
  margin-top: 0.15rem;
`

const OptionList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
`

const OptionCard = styled.button<{ $active?: boolean; $disabled?: boolean }>`
  display: grid;
  grid-template-columns: 1.25rem 1fr;
  gap: 0.55rem;
  align-items: start;
  text-align: left;
  width: 100%;
  border-radius: 0.4rem;
  border: 1px solid
    ${(p) =>
      p.$disabled
        ? '#3d4f6688'
        : p.$active
          ? '#8eb8ff'
          : '#3d527066'};
  background: ${(p) =>
    p.$disabled
      ? '#151c28'
      : p.$active
        ? 'linear-gradient(180deg, #2f4f88 0%, #243a62 100%)'
        : '#182030'};
  color: ${(p) => (p.$disabled ? '#7f90a8' : '#e4efff')};
  padding: 0.45rem 0.55rem;
  cursor: ${(p) => (p.$disabled ? 'not-allowed' : 'pointer')};
  opacity: ${(p) => (p.$disabled ? 0.72 : 1)};
`

const OptionCheck = styled.span`
  width: 1.15rem;
  height: 1.15rem;
  border-radius: 0.25rem;
  border: 1px solid #8eb8ff88;
  background: #0f1520;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  font-weight: 700;
  color: #f0f6ff;
  margin-top: 0.05rem;
`

const OptionText = styled.span`
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
`

const OptionTitle = styled.span`
  font-size: 0.8rem;
  font-weight: 650;
`

const OptionDetail = styled.span`
  font-size: 0.72rem;
  line-height: 1.35;
  color: #a8bdd8;
`

const ChoiceRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.45rem;

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`

const ChoiceCard = styled.button<{ $active?: boolean; $warn?: boolean }>`
  text-align: left;
  border-radius: 0.4rem;
  border: 1px solid
    ${(p) =>
      p.$active
        ? p.$warn
          ? '#e08a8a'
          : '#8eb8ff'
        : '#3d527066'};
  background: ${(p) =>
    p.$active
      ? p.$warn
        ? 'linear-gradient(180deg, #6a3434 0%, #4a2424 100%)'
        : 'linear-gradient(180deg, #2f4f88 0%, #243a62 100%)'
      : '#182030'};
  color: #e4efff;
  padding: 0.55rem 0.6rem;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`

const ChoiceTitle = styled.span`
  font-size: 0.82rem;
  font-weight: 700;
`

const ChoiceDetail = styled.span`
  font-size: 0.72rem;
  line-height: 1.35;
  color: #c5d4e8;
`

const ReviewBox = styled.div`
  border-radius: 0.35rem;
  border: 1px solid #3d527066;
  background: #101820;
  padding: 0.5rem 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
`

const ReviewLine = styled.div`
  font-size: 0.78rem;
  color: #dceaff;
  line-height: 1.35;
`

const AdvancedToggle = styled.button`
  align-self: flex-start;
  border: none;
  background: transparent;
  color: #9eb8dc;
  font-size: 0.72rem;
  padding: 0;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 0.15rem;
`

const AdvancedPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.45rem 0.55rem;
  border-radius: 0.35rem;
  border: 1px solid #3d527066;
  background: #101820;
`

const AdvancedRow = styled.div`
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.4rem;
  align-items: center;
`

const AdvancedLabel = styled.label`
  font-size: 0.72rem;
  color: #a8bdd8;
`

const AdvancedInput = styled.input`
  min-width: 0;
  border-radius: 0.3rem;
  border: 1px solid #5a6f8888;
  background: #0f1520;
  color: #e4efff;
  padding: 0.28rem 0.45rem;
  font-size: 0.75rem;
`

const AdvancedButton = styled.button`
  border-radius: 0.3rem;
  border: 1px solid #5a6f8888;
  background: linear-gradient(180deg, #243040 0%, #1a2430 100%);
  color: #c5d4e8;
  padding: 0.28rem 0.55rem;
  font-size: 0.72rem;
  cursor: pointer;
`
