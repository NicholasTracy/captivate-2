import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type CSSProperties } from 'react'
import styled from 'styled-components'
import { useDispatch } from 'react-redux'
import OverlayPortal from '../overlays/OverlayPortal'
import { overlayZIndex } from '../zIndexes'
import { useDmxSelector, useTypedSelector } from '../redux/store'
import {
  setActivePage,
  setAppSettings,
  setConnectionsMenu,
  setInteractiveTourActive,
} from '../redux/guiSlice'
import { persistAppSettings } from '../appSettingsClient'
import { tourSelector } from './tourIds'
import {
  FIRST_RUN_TOUR_STEPS,
  type TourAdvance,
  type TourStep,
  type TourStepContent,
} from './firstRunTourSteps'
import { useTourTargetRect, type TargetRect } from './useTourTargetRect'
import {
  readTourProjectProgress,
  type TourProjectProgress,
} from './tourProjectProgress'

function holeClipPath(rect: TargetRect): string {
  const x = rect.left
  const y = rect.top
  const r = rect.left + rect.width
  const b = rect.top + rect.height
  return `polygon(evenodd, 0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${x}px ${y}px, ${x}px ${b}px, ${r}px ${b}px, ${r}px ${y}px, ${x}px ${y}px)`
}

function holeRingStyle(rect: TargetRect): CSSProperties {
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  }
}

function coachPlacement(rect: TargetRect | null): CSSProperties {
  const cardWidth = Math.min(416, window.innerWidth - 24)
  const approxHeight = 280
  const margin = 12

  if (!rect) {
    return {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    }
  }

  const spaceBelow = window.innerHeight - (rect.top + rect.height)
  const spaceAbove = rect.top
  const preferBelow =
    spaceBelow >= approxHeight + margin || spaceBelow >= spaceAbove

  let top: number
  if (preferBelow) {
    top = rect.top + rect.height + margin
    if (top + approxHeight > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - approxHeight - margin)
    }
  } else {
    top = rect.top - approxHeight - margin
    if (top < margin) {
      top = margin
    }
  }

  const preferSide = rect.width > 160 || rect.height > 120
  let left: number
  if (preferSide) {
    const rightOf = rect.left + rect.width + margin
    const leftOf = rect.left - cardWidth - margin
    if (rightOf + cardWidth <= window.innerWidth - margin) {
      left = rightOf
    } else if (leftOf >= margin) {
      left = leftOf
    } else {
      left = Math.min(
        Math.max(margin, rect.left),
        window.innerWidth - cardWidth - margin
      )
    }
  } else {
    left = Math.min(
      Math.max(margin, rect.left),
      window.innerWidth - cardWidth - margin
    )
  }

  return {
    top,
    left,
    transform: 'none',
  }
}

function advanceSatisfied(
  advance: TourAdvance,
  ctx: {
    activePage: string
    connectionMenu: boolean
    hasParam: (param: string) => boolean
    targetExists: boolean
    seenTarget: boolean
    progress: TourProjectProgress
    baseline: TourProjectProgress
  }
): boolean {
  switch (advance.kind) {
    case 'next':
      return false
    case 'click':
      return false
    case 'page':
      return ctx.activePage === advance.page
    case 'connections':
      return ctx.connectionMenu === advance.open
    case 'paramPresent':
      return ctx.hasParam(advance.param)
    case 'targetPresent':
      return ctx.targetExists
    case 'targetGone':
      return ctx.seenTarget && !ctx.targetExists
    case 'fixtureTypesAdded':
      return ctx.progress.fixtureTypeCount > ctx.baseline.fixtureTypeCount
    case 'fixturesPatched':
      return ctx.progress.patchedFixtureCount > ctx.baseline.patchedFixtureCount
    case 'minFixtureTypes':
      return ctx.progress.fixtureTypeCount >= advance.count
    case 'minPatchedFixtures':
      return ctx.progress.patchedFixtureCount >= advance.count
    case 'hasGroupedFixture':
      return ctx.progress.fixturesWithGroups > ctx.baseline.fixturesWithGroups
    case 'hasBasicLookParams':
      return (
        ctx.progress.hasBasicColorOrIntensity &&
        !ctx.baseline.hasBasicColorOrIntensity
      )
    case 'or':
      return advance.of.some((item) => advanceSatisfied(item, ctx))
    default:
      return false
  }
}

function resolveStepContent(
  step: TourStep,
  progress: TourProjectProgress
): TourStepContent {
  const alt = step.whenAlreadyDone?.(progress)
  if (alt) {
    return {
      title: alt.title,
      body: alt.body,
      tip: alt.tip ?? step.tip,
      nextLabel: alt.nextLabel ?? step.nextLabel,
    }
  }
  return {
    title: step.title,
    body: step.body,
    tip: step.tip,
    nextLabel: step.nextLabel,
  }
}

function isWaitingAdvance(advance: TourAdvance): boolean {
  if (advance.kind === 'next' || advance.kind === 'click') return false
  if (advance.kind === 'or') {
    return advance.of.some(isWaitingAdvance)
  }
  return true
}

export default function InteractiveTour() {
  const dispatch = useDispatch()
  const active = useTypedSelector((s) => s.gui.interactiveTourActive)
  const activePage = useTypedSelector((s) => s.gui.activePage)
  const connectionMenu = useTypedSelector((s) => s.gui.connectionMenu)
  const appSettings = useTypedSelector((s) => s.gui.appSettings)
  const guiDmx = useTypedSelector((s) => s.gui.dmx)
  const guiMidi = useTypedSelector((s) => s.gui.midi)
  const control = useTypedSelector((s) => s.control.present)
  const dmx = useDmxSelector((state) => state)
  const split0Params = useTypedSelector(
    (s) =>
      s.control.present.light.byId[s.control.present.light.active]
        ?.splitScenes?.[0]?.baseParams
  )

  const progress = useMemo(
    () =>
      readTourProjectProgress(dmx, control, {
        activePage,
        dmx: guiDmx,
        midi: guiMidi,
        connectionMenu,
      }),
    [dmx, control, activePage, guiDmx, guiMidi, connectionMenu]
  )

  const [stepIndex, setStepIndex] = useState(0)
  const [seenTarget, setSeenTarget] = useState(false)
  const [baseline, setBaseline] = useState<TourProjectProgress>(progress)
  const steps = FIRST_RUN_TOUR_STEPS
  const step: TourStep | undefined = steps[stepIndex]
  const targetId = step?.target
  const rect = useTourTargetRect(targetId, active && !!step)
  const targetExists = rect !== null

  const hasParam = useCallback(
    (param: string) =>
      split0Params?.[param as keyof typeof split0Params] !== undefined,
    [split0Params]
  )

  const goToStep = useCallback(
    (fromIndex: number, direction: 1 | -1 = 1) => {
      let i = fromIndex + direction
      if (direction > 0) {
        while (i < steps.length) {
          const candidate = steps[i]
          if (!candidate?.skipWhen?.(progress)) break
          i += 1
        }
        setStepIndex(Math.min(i, steps.length - 1))
      } else {
        while (i >= 0) {
          const candidate = steps[i]
          if (!candidate?.skipWhen?.(progress)) break
          i -= 1
        }
        setStepIndex(Math.max(i, 0))
      }
    },
    [progress, steps]
  )

  useEffect(() => {
    if (!active) {
      setStepIndex(0)
      setSeenTarget(false)
      return
    }
    let i = 0
    while (i < steps.length && steps[i]?.skipWhen?.(progress)) {
      i += 1
    }
    setStepIndex(Math.min(i, steps.length - 1))
    setBaseline(progress)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when tour opens
  }, [active])

  useLayoutEffect(() => {
    setSeenTarget(false)
    setBaseline(progress)
    // Intentionally only when the step changes — freeze progress as baseline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex])

  useEffect(() => {
    if (targetExists) {
      setSeenTarget(true)
    }
  }, [targetExists])

  useEffect(() => {
    if (!active || !step) return
    if (step.closeConnections) {
      dispatch(setConnectionsMenu(false))
    }
    if (step.ensurePage) {
      dispatch(setActivePage(step.ensurePage))
    }
  }, [active, step, dispatch, stepIndex])

  // If the current step becomes skippable (e.g. fixtures appeared), move on.
  useEffect(() => {
    if (!active || !step) return
    if (step.skipWhen?.(progress)) {
      goToStep(stepIndex, 1)
    }
  }, [active, step, progress, stepIndex, goToStep])

  useEffect(() => {
    if (!active || !step) return
    if (
      advanceSatisfied(step.advance, {
        activePage,
        connectionMenu,
        hasParam,
        targetExists,
        seenTarget,
        progress,
        baseline,
      })
    ) {
      goToStep(stepIndex, 1)
    }
  }, [
    active,
    step,
    activePage,
    connectionMenu,
    hasParam,
    targetExists,
    seenTarget,
    progress,
    baseline,
    stepIndex,
    goToStep,
  ])

  useEffect(() => {
    if (!active || !step || !targetId) return
    const listenForClick =
      step.advance.kind === 'click' ||
      (step.advance.kind === 'or' &&
        step.advance.of.some((item) => item.kind === 'click'))
    if (!listenForClick) return

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target
      if (!(target instanceof Element)) return
      const anchor = document.querySelector(tourSelector(targetId))
      if (!anchor) return
      if (anchor === target || anchor.contains(target)) {
        goToStep(stepIndex, 1)
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [active, step, targetId, stepIndex, goToStep])

  const finish = useCallback(
    async (markComplete: boolean) => {
      dispatch(setInteractiveTourActive(false))
      dispatch(setConnectionsMenu(false))
      if (markComplete && !appSettings.firstRunTutorialCompleted) {
        const next = {
          ...appSettings,
          firstRunTutorialCompleted: true,
        }
        dispatch(setAppSettings(next))
        try {
          await persistAppSettings(next)
        } catch {
          // Local flag still set; persistence may fail offline.
        }
      }
    },
    [appSettings, dispatch]
  )

  const onNext = useCallback(() => {
    if (!step) return
    if (stepIndex >= steps.length - 1) {
      void finish(true)
      return
    }
    goToStep(stepIndex, 1)
  }, [step, stepIndex, steps.length, finish, goToStep])

  const content = step ? resolveStepContent(step, progress) : null
  const suppressDim =
    connectionMenu === true || step?.suppressDim === true
  const coachStyle = useMemo(() => {
    if (suppressDim && !rect) {
      return {
        top: '1.25rem',
        right: '1.25rem',
        left: 'auto',
        transform: 'none',
      } as CSSProperties
    }
    return coachPlacement(rect)
  }, [rect, suppressDim])
  const progressLabel = `${stepIndex + 1} / ${steps.length}`

  if (!active || !step || !content) return null

  const needsClick =
    step.advance.kind === 'click' ||
    (step.advance.kind === 'or' &&
      step.advance.of.some((item) => item.kind === 'click'))
  const waitingOnState = isWaitingAdvance(step.advance)
  const showContinue =
    step.advance.kind === 'next' ||
    step.allowContinue === true ||
    (!needsClick && !waitingOnState) ||
    !!step.whenAlreadyDone?.(progress)

  return (
    <>
      <OverlayPortal>
        <DimRoot>
          {!suppressDim &&
            (rect ? (
              <>
                <DimCutout style={{ clipPath: holeClipPath(rect) }} />
                <HoleRing aria-hidden style={holeRingStyle(rect)} />
              </>
            ) : (
              <DimCutout />
            ))}
        </DimRoot>
      </OverlayPortal>
      <OverlayPortal>
        <Coach role="dialog" aria-labelledby="tour-title" style={coachStyle}>
          <CoachMeta>
            <span>{progressLabel}</span>
            <Skip type="button" onClick={() => void finish(true)}>
              Skip tour
            </Skip>
          </CoachMeta>
          <CoachTitle id="tour-title">{content.title}</CoachTitle>
          <CoachBody>
            {(Array.isArray(content.body) ? content.body : [content.body]).map(
              (paragraph, index) => (
                <p key={index}>{paragraph}</p>
              )
            )}
          </CoachBody>
          {content.tip ? <CoachTip>{content.tip}</CoachTip> : null}
          {step.advance.kind === 'fixtureTypesAdded' && (
            <CoachTip>
              Library: {progress.fixtureTypeCount} type
              {progress.fixtureTypeCount === 1 ? '' : 's'}
              {progress.fixtureTypeCount > baseline.fixtureTypeCount
                ? ' — new fixture detected, continuing…'
                : ' — waiting for a new type to appear…'}
            </CoachTip>
          )}
          <CoachActions>
            {stepIndex > 0 && (
              <Ghost type="button" onClick={() => goToStep(stepIndex, -1)}>
                Back
              </Ghost>
            )}
            <Sp />
            {needsClick && !suppressDim && !showContinue && (
              <Hint>Click the highlighted control</Hint>
            )}
            {waitingOnState && step.advance.kind === 'connections' && (
              <Hint>Waiting for Connections to close…</Hint>
            )}
            {showContinue && (
              <Primary type="button" onClick={onNext}>
                {content.nextLabel ??
                  (stepIndex >= steps.length - 1 ? 'Finish' : 'Continue')}
              </Primary>
            )}
            {(needsClick || waitingOnState) && !showContinue && (
              <Ghost type="button" onClick={onNext}>
                Skip step
              </Ghost>
            )}
            {(needsClick || waitingOnState) && showContinue && (
              <Ghost type="button" onClick={onNext}>
                Skip step
              </Ghost>
            )}
          </CoachActions>
        </Coach>
      </OverlayPortal>
    </>
  )
}

const DimRoot = styled.div`
  position: fixed;
  inset: 0;
  z-index: ${overlayZIndex.tour};
  pointer-events: none;
`

const DimCutout = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.72);
  pointer-events: auto;
`

const HoleRing = styled.div`
  position: absolute;
  border-radius: 0.45rem;
  box-shadow: 0 0 0 2px #5b8fd6;
  pointer-events: none;
`

const Coach = styled.div`
  position: fixed;
  z-index: ${overlayZIndex.tourCoach};
  width: min(26rem, calc(100vw - 1.5rem));
  max-height: calc(100dvh - 1.5rem);
  overflow: auto;
  pointer-events: auto;
  background: ${(p) => p.theme.colors.bg.primary};
  border: 1px solid #5b8fd6aa;
  border-radius: 0.55rem;
  box-shadow: 0 12px 40px #000a;
  padding: 0.85rem 1rem 1rem;
  color: ${(p) => p.theme.colors.text.primary};
`

const CoachMeta = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.75rem;
  opacity: 0.7;
  margin-bottom: 0.35rem;
`

const Skip = styled.button`
  background: transparent;
  border: none;
  color: inherit;
  opacity: 0.85;
  cursor: pointer;
  text-decoration: underline;
  font-size: 0.75rem;
`

const CoachTitle = styled.h2`
  margin: 0 0 0.4rem;
  font-size: 1.05rem;
  font-weight: 650;
`

const CoachBody = styled.div`
  margin: 0 0 0.75rem;
  font-size: 0.88rem;
  line-height: 1.45;
  opacity: 0.94;

  p {
    margin: 0 0 0.55rem;
  }

  p:last-child {
    margin-bottom: 0;
  }
`

const CoachTip = styled.div`
  margin: 0 0 0.85rem;
  padding: 0.45rem 0.55rem;
  border-radius: 0.35rem;
  border-left: 3px solid #5b8fd6;
  background: #5b8fd622;
  font-size: 0.82rem;
  line-height: 1.4;
`

const CoachActions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
`

const Sp = styled.div`
  flex: 1 1 auto;
`

const Hint = styled.span`
  font-size: 0.78rem;
  opacity: 0.75;
`

const Primary = styled.button`
  border: none;
  border-radius: 0.35rem;
  padding: 0.4rem 0.85rem;
  background: #3d74c4;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
`

const Ghost = styled.button`
  border: 1px solid ${(p) => p.theme.colors.divider};
  border-radius: 0.35rem;
  padding: 0.35rem 0.7rem;
  background: transparent;
  color: inherit;
  cursor: pointer;
`
