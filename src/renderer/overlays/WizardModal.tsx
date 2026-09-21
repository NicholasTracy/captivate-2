import styled from 'styled-components'
import zIndexes from '../zIndexes'
import OverlayPortal from './OverlayPortal'

const wizardZ = zIndexes.overlay.wizard

export type WizardStepDef = {
  key: string
  title: string
  description: string
  /** Optional help link rendered under the step description (e.g. wiki). */
  help?: React.ReactNode
}

interface Props {
  open: boolean
  title: string
  steps: WizardStepDef[]
  stepIndex: number
  onClose: () => void
  onBack: () => void
  onNext: () => void
  onSave: () => void
  children: React.ReactNode
  saveLabel?: string
  maxWidth?: string
  minHeight?: string
  /** Shown above the action buttons on the last step (e.g. post-save options). */
  footerSlot?: React.ReactNode
}

export default function WizardModal({
  open,
  title,
  steps,
  stepIndex,
  onClose,
  onBack,
  onNext,
  onSave,
  children,
  saveLabel = 'Save',
  maxWidth = 'min(42rem, calc(100vw - 2rem))',
  /** Prefer a definite height so the body scrolls and footer actions stay clickable. */
  minHeight = 'min(30rem, calc(100dvh - 2rem))',
  footerSlot,
}: Props) {
  if (!open) {
    return null
  }

  const isFirst = stepIndex <= 0
  const isLast = stepIndex >= steps.length - 1
  const step = steps[stepIndex]
  const cardHeight =
    minHeight === 'auto' ? 'min(30rem, calc(100dvh - 2rem))' : minHeight

  return (
    <OverlayPortal>
      <Root
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            onClose()
          }
        }}
      >
      <Card $maxWidth={maxWidth} $height={cardHeight}>
        <Title>{title}</Title>
        <StepRail>
          {steps.map((s, index) => (
            <StepChip
              key={s.key}
              $active={index === stepIndex}
              $done={index < stepIndex}
            >
              {index + 1}. {s.title}
            </StepChip>
          ))}
        </StepRail>
        <StepHeading>{step.title}</StepHeading>
        <StepDescription>{step.description}</StepDescription>
        {step.help !== undefined && step.help !== null && (
          <StepHelp>{step.help}</StepHelp>
        )}
        <Body>{children}</Body>
        {isLast && footerSlot !== undefined && footerSlot !== null && (
          <FooterSlot>{footerSlot}</FooterSlot>
        )}
        <Actions>
          <ActionButton type="button" onClick={onClose}>
            Cancel
          </ActionButton>
          <Spacer />
          {!isFirst && (
            <ActionButton type="button" onClick={onBack}>
              Back
            </ActionButton>
          )}
          {isLast ? (
            <ActionButton type="button" $primary onClick={onSave}>
              {saveLabel}
            </ActionButton>
          ) : (
            <ActionButton type="button" $primary onClick={onNext}>
              Next
            </ActionButton>
          )}
        </Actions>
      </Card>
      </Root>
    </OverlayPortal>
  )
}

const Root = styled.div`
  position: fixed;
  inset: 0;
  z-index: ${wizardZ};
  background: #000c;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  box-sizing: border-box;
`

const Card = styled.div<{ $maxWidth: string; $height: string }>`
  width: ${(p) => p.$maxWidth};
  height: ${(p) => p.$height};
  max-height: calc(100dvh - 2rem);
  overflow: hidden;
  border: 1px solid ${(p) => p.theme.colors.divider};
  border-radius: 0.5rem;
  background: linear-gradient(
    165deg,
    ${(p) => p.theme.colors.bg.raised} 0%,
    ${(p) => p.theme.colors.bg.panel} 48%,
    ${(p) => p.theme.colors.bg.primary} 100%
  );
  box-shadow:
    ${(p) => p.theme.elevation.shadowMd},
    ${(p) => p.theme.elevation.insetHighlight};
  padding: 0.9rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  box-sizing: border-box;
`

const Title = styled.div`
  font-size: 1.05rem;
  font-weight: 700;
  color: ${(p) => p.theme.colors.text.primary};
`

const StepRail = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
`

const StepChip = styled.div<{ $active: boolean; $done: boolean }>`
  font-size: 0.68rem;
  padding: 0.15rem 0.4rem;
  border-radius: 0.25rem;
  border: 1px solid
    ${(p) =>
      p.$active
        ? '#8eb8ff'
        : p.$done
          ? '#5a8fd6aa'
          : p.theme.colors.divider};
  background: ${(p) =>
    p.$active
      ? 'linear-gradient(180deg, #3a5f9e 0%, #2a4a7a 100%)'
      : p.$done
        ? '#2a4a7a44'
        : p.theme.colors.bg.darker};
  color: ${(p) =>
    p.$active
      ? '#f0f6ff'
      : p.$done
        ? p.theme.mode === 'light'
          ? '#1a3a6a'
          : '#c5dcff'
        : p.theme.colors.text.secondary};
  font-weight: ${(p) => (p.$active ? 700 : 500)};
`

const StepHeading = styled.div`
  font-size: 0.95rem;
  font-weight: 600;
  color: ${(p) => p.theme.colors.text.primary};
`

const StepDescription = styled.div`
  font-size: 0.8rem;
  color: ${(p) => p.theme.colors.text.secondary};
  line-height: 1.35;
`

const StepHelp = styled.div`
  flex-shrink: 0;
`

const FooterSlot = styled.div`
  flex-shrink: 0;
  padding: 0.15rem 0 0.25rem;
`

const Body = styled.div`
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 0.45rem 0.5rem;
  margin: 0 -0.15rem;
  border-radius: 0.35rem;
  background: ${(p) => p.theme.colors.bg.darker};
  border: 1px solid ${(p) => p.theme.colors.divider};
  box-shadow: ${(p) => p.theme.elevation.insetDepth};
`

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-shrink: 0;
  padding-top: 0.35rem;
`

const Spacer = styled.div`
  flex: 1 1 auto;
`

const ActionButton = styled.button<{ $primary?: boolean }>`
  min-width: 5.5rem;
  border-radius: 0.35rem;
  border: 1px solid
    ${(p) => (p.$primary ? p.theme.colors.accent : p.theme.colors.divider)};
  background: ${(p) =>
    p.$primary
      ? p.theme.mode === 'light'
        ? 'linear-gradient(180deg, #4a7fd6 0%, #2f5aa8 100%)'
        : `linear-gradient(180deg, ${p.theme.colors.accentMuted} 0%, ${p.theme.colors.bg.raised} 100%)`
      : p.theme.colors.bg.panel};
  color: ${(p) =>
    p.$primary
      ? p.theme.mode === 'light'
        ? '#f4f8ff'
        : p.theme.colors.accent
      : p.theme.colors.button.text};
  padding: 0.35rem 0.65rem;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: ${(p) => (p.$primary ? 700 : 500)};
  box-shadow: ${(p) => p.theme.elevation.shadowSm};
  :not(:disabled):hover {
    filter: brightness(1.08);
  }
`
