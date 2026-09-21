import { LightScene_t } from '../Scenes'
import { LfoShape } from '../oscillator'
import { SeededRng } from './rng'
import {
  buildGroupZones,
  buildLeftRightZones,
  buildSpatialZonesFromRig,
  pickGroupFamily,
  resolveChaseGroupZones,
  RigProfile,
} from './rigProfile'
import type {
  ResolvedSceneGenerationPrefs,
  SceneGenerationCapabilities,
} from './sceneGenerationOptions'
import { capabilityActive } from './sceneGenerationOptions'
import {
  ALL_GROUPS,
  attachMoverAwareness,
  beatSquare,
  buildMoverBeatTiltSweepMods,
  buildMoverPanCascadeMods,
  buildMoverPatternMods,
  buildMoverRowColumnSplits,
  CHASE,
  defaultRandomizer,
  defaultRowColumnZones,
  directorLfo,
  pickLfoPeriod,
  mkAudioBand,
  mkEnergyLfo,
  mkLfo,
  mkSplit,
  moverChoreoSplit,
  moverSplit,
  resolveMoverColumnCount,
  RAND,
  splitModsForCount,
  wigWagFlashMod,
  withPeriodSpeedDirector,
  withSlotEnvelopes,
  zoneSplit,
  buildChaseZones,
  withStaggeredPhase,
  withOpposingHalvesPhase,
  chaseZoneSplit,
  chaseBrightnessMod,
  chasePeriodBeats,
  type ChaseDirection,
  type MoverChoreoStyle,
} from './sceneBuilders'
import {
  familyForLadderIndex,
  hueShift,
  paletteHue,
  washParams,
  type LookFamily,
} from './lookCraft'

/** Short flavors only used when two recipes collide on the same title. */
const NAME_FLAVORS = [
  'Stage',
  'Room',
  'Floor',
  'Club',
  'Hall',
  'Live',
  'Main',
  'Peak',
  'Soft',
  'Wide',
] as const

const EPICNESS_LADDER = [
  0.03, 0.06, 0.09, 0.12, 0.15, 0.18, 0.21, 0.25, 0.29, 0.33, 0.37, 0.41, 0.45,
  0.48, 0.52, 0.55, 0.58, 0.61, 0.64, 0.67, 0.7, 0.73, 0.76, 0.78, 0.79, 0.82,
  0.85, 0.88, 0.92, 0.96, 1,
] as const

type MoverShowcaseKind =
  | { kind: 'smooth'; mode: 'sweep' | 'tandem' | 'mirror' | 'peak' }
  | { kind: 'choreo'; style: MoverChoreoStyle }

const MOVER_SHOWCASES: Array<{ epicness: number } & MoverShowcaseKind> = [
  { epicness: 0.38, kind: 'smooth', mode: 'sweep' },
  { epicness: 0.58, kind: 'smooth', mode: 'tandem' },
  { epicness: 0.64, kind: 'choreo', style: 'tiltSweep' },
  { epicness: 0.71, kind: 'choreo', style: 'panCascade' },
  { epicness: 0.74, kind: 'smooth', mode: 'mirror' },
  { epicness: 0.9, kind: 'smooth', mode: 'peak' },
]

type ChaseShowcaseKind =
  | { kind: 'color'; axis: 'columns' | 'rows'; direction: ChaseDirection; label: string }
  | { kind: 'blanking'; axis: 'columns' | 'rows'; direction: ChaseDirection; label: string }
  | { kind: 'opposing'; label: string }

const CHASE_SHOWCASES: Array<{ epicness: number } & ChaseShowcaseKind> = [
  {
    epicness: 0.4,
    kind: 'color',
    axis: 'columns',
    direction: 'forward',
    label: 'Strip Chase L→R',
  },
  {
    epicness: 0.46,
    kind: 'blanking',
    axis: 'columns',
    direction: 'reverse',
    label: 'Pulse Chase R→L',
  },
  {
    epicness: 0.52,
    kind: 'color',
    axis: 'rows',
    direction: 'forward',
    label: 'Strip Cascade Top→Bottom',
  },
  {
    epicness: 0.58,
    kind: 'blanking',
    axis: 'rows',
    direction: 'reverse',
    label: 'Pulse Rise Bottom→Top',
  },
  {
    epicness: 0.64,
    kind: 'color',
    axis: 'columns',
    direction: 'mirrorOut',
    label: 'Mirror Chase Outward',
  },
  {
    epicness: 0.7,
    kind: 'opposing',
    label: 'Split Chase Opposing Halves',
  },
]

export const DEFAULT_SAVE_LIGHT_SEED = 'captivate-default-save-v1'

interface SceneBuildContext {
  rng: SeededRng
  profile: RigProfile
  epicness: number
  index: number
  capabilities: SceneGenerationCapabilities
}

type BuiltScene = Omit<LightScene_t, 'autoEnabled'> & { name: string }

/** Prefer descriptive recipe titles; add a short flavor only on collisions. */
function finalizeSceneName(
  used: Set<string>,
  rng: SeededRng,
  baseName: string
): string {
  const cleaned = baseName.trim() || 'Generated Scene'
  if (!used.has(cleaned)) {
    used.add(cleaned)
    return cleaned
  }
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const candidate = `${rng.pick(NAME_FLAVORS)} ${cleaned}`
    if (!used.has(candidate)) {
      used.add(candidate)
      return candidate
    }
  }
  const fallback = `${cleaned} ${used.size + 1}`
  used.add(fallback)
  return fallback
}

function chaseStripCount(profile: RigProfile): number {
  if (profile.fixtureCount >= 10) return 5
  if (profile.fixtureCount >= 6) return 4
  return 3
}

function ctxFamily(ctx: SceneBuildContext): LookFamily {
  return familyForLadderIndex(ctx.index)
}

function ctxHue(ctx: SceneBuildContext, family?: LookFamily): number {
  return paletteHue(ctx.rng, family ?? ctxFamily(ctx))
}

function fullStageSplit(
  ctx: SceneBuildContext,
  hue: number,
  intent: 'dim' | 'wash' | 'groove' | 'accent' | 'peak' = 'wash',
  patch: Record<string, number | undefined> = {}
) {
  return mkSplit(
    washParams(hue, intent, ctx.epicness, patch),
    defaultRandomizer,
    ALL_GROUPS,
    { modManualAnchors: { brightness: 'bottom', width: 'bottom' } }
  )
}

/** Two zones sharing one color family — partner hue is analogous, not random. */
function dualZoneSplits(ctx: SceneBuildContext, hue: number) {
  const partner = hueShift(hue, 0.1)
  const zones = buildGroupZones(ctx.profile, 2)
  if (zones.length >= 2 && zones.every((zone) => zone.groupName)) {
    return zones.slice(0, 2).map((zone, index) =>
      zoneSplit(
        zone,
        index === 0 ? hue : partner,
        {
          ...washParams(index === 0 ? hue : partner, 'groove', ctx.epicness, {
            width: 0.45,
            height: zone.height,
            x: zone.x,
            y: zone.y,
          }),
        },
        zone.groupName
      )
    )
  }
  const [left, right] = buildLeftRightZones(ctx.profile)
  return [
    zoneSplit(left, hue, {
      ...washParams(hue, 'groove', ctx.epicness, {
        width: left.width,
        height: left.height,
        x: left.x,
        y: left.y,
      }),
    }),
    zoneSplit(right, partner, {
      ...washParams(partner, 'groove', ctx.epicness, {
        width: right.width,
        height: right.height,
        x: right.x,
        y: right.y,
      }),
    }),
  ]
}

function buildWigWagScene(ctx: SceneBuildContext): BuiltScene {
  const pairFamily = pickGroupFamily(ctx.profile, {
    minGroups: 2,
    maxGroups: 4,
    preferredAxis: 'x',
  })
  const groupZones =
    pairFamily !== null
      ? buildGroupZones(ctx.profile, Math.min(4, pairFamily.groups.length))
      : null
  const useGroups =
    groupZones !== null &&
    groupZones.length >= 2 &&
    groupZones.every((zone) => zone.groupName)

  const cols = useGroups
    ? groupZones!.length
    : ctx.profile.fixtureCount >= 12
      ? 4
      : ctx.profile.fixtureCount >= 6
        ? 3
        : 2
  const rows = useGroups ? 1 : 2
  const zones = useGroups
    ? groupZones!
    : buildSpatialZonesFromRig(ctx.profile, cols, rows)
  const splitCount = zones.length
  const period = pickLfoPeriod(ctx.rng, 4)
  const peakWidth = 0.11
  const hue = ctxHue(ctx)

  return {
    name: useGroups
      ? pairFamily!.label === 'Stage groups'
        ? 'Wig-Wag Group Halves'
        : `Wig-Wag · ${pairFamily!.label}`
      : 'Wig-Wag Halves',
    epicness: ctx.epicness,
    modulators: [
      wigWagFlashMod(splitCount, 0.88, {
        period,
        parity: 0,
        sinePeakWidth: peakWidth,
      }),
      wigWagFlashMod(splitCount, 0.88, {
        period,
        parity: 1,
        phaseShift: 0.5,
        sinePeakWidth: peakWidth,
      }),
    ],
    splitScenes: zones.map((zone, index) =>
      zoneSplit(
        zone,
        hueShift(hue, (index % 2) * 0.08),
        {
          brightness: 0.08,
          saturation: 0.78,
        },
        zone.groupName
      )
    ),
  }
}

type SceneRecipe = (ctx: SceneBuildContext) => BuiltScene

const AUDIO_BAND_NAMES: Record<
  'kick' | 'snare' | 'hat' | 'vocal' | 'mid' | 'bass',
  string
> = {
  kick: 'Kick Accent',
  snare: 'Snare Accent',
  hat: 'Hi-Hat Shimmer',
  vocal: 'Vocal Wash',
  mid: 'Mid Band Glow',
  bass: 'Bass Drop',
}

function recipeCoolWash(ctx: SceneBuildContext): BuiltScene {
  const hue = paletteHue(ctx.rng, 'cool')
  return {
    name: 'Cool Stage Wash',
    epicness: ctx.epicness,
    modulators: [
      mkLfo(LfoShape.Sin, pickLfoPeriod(ctx.rng, 16), [{ brightness: 0.18 }]),
    ],
    splitScenes: [fullStageSplit(ctx, hue, 'wash')],
  }
}

function recipeWarmWash(ctx: SceneBuildContext): BuiltScene {
  const hue = paletteHue(ctx.rng, 'warm')
  return {
    name: 'Warm Stage Wash',
    epicness: ctx.epicness,
    modulators: [
      mkLfo(LfoShape.Sin, pickLfoPeriod(ctx.rng, 16), [{ brightness: 0.16 }]),
    ],
    splitScenes: [fullStageSplit(ctx, hue, 'wash', { saturation: 0.52 })],
  }
}

function recipeDimWash(ctx: SceneBuildContext): BuiltScene {
  const hue = paletteHue(ctx.rng, 'amber')
  return {
    name: 'Soft Dim Wash',
    epicness: ctx.epicness,
    modulators: [
      mkLfo(LfoShape.Sin, pickLfoPeriod(ctx.rng, 32), [{ brightness: 0.12 }]),
    ],
    splitScenes: [fullStageSplit(ctx, hue, 'dim')],
  }
}

function recipeAmbientGlow(ctx: SceneBuildContext): BuiltScene {
  const hue = ctxHue(ctx, 'cyan')
  return {
    name: 'Ambient Glow',
    epicness: ctx.epicness,
    modulators: withPeriodSpeedDirector(
      [mkLfo(LfoShape.Sin, pickLfoPeriod(ctx.rng, 16), [{ brightness: 0.28 }])],
      { targets: [0], bars: 16, depth: 'subtle', rng: ctx.rng }
    ),
    splitScenes: [fullStageSplit(ctx, hue, 'wash', { saturation: 0.48 })],
  }
}

function recipeSoftColorDrift(ctx: SceneBuildContext): BuiltScene {
  const hue = ctxHue(ctx)
  return {
    name: 'Soft Color Drift',
    epicness: ctx.epicness,
    modulators: withPeriodSpeedDirector(
      [
        mkLfo(LfoShape.Sin, pickLfoPeriod(ctx.rng, 16), [{ brightness: 0.2 }]),
        // Stay inside the family — small hue travel only.
        mkLfo(LfoShape.Sin, pickLfoPeriod(ctx.rng, 32), [{ hue: 0.1 }], {
          phaseShift: 0.15,
        }),
      ],
      { targets: [0, 1], bars: 16, depth: 'subtle', rng: ctx.rng }
    ),
    splitScenes: [fullStageSplit(ctx, hue, 'wash')],
  }
}

function recipeSoftPositionDrift(ctx: SceneBuildContext): BuiltScene {
  const hue = ctxHue(ctx, 'violet')
  return {
    name: 'Soft Position Drift',
    epicness: ctx.epicness,
    modulators: withPeriodSpeedDirector(
      [
        mkLfo(LfoShape.Sin, pickLfoPeriod(ctx.rng, 16), [{ x: 0.45 }], {
          phaseShift: 0,
        }),
        mkLfo(LfoShape.Sin, pickLfoPeriod(ctx.rng, 16), [{ y: 0.32 }], {
          phaseShift: 0.25,
        }),
        mkLfo(LfoShape.Sin, pickLfoPeriod(ctx.rng, 16), [{ brightness: 0.16 }]),
      ],
      { targets: [0, 1], bars: 16, depth: 'subtle', rng: ctx.rng }
    ),
    splitScenes: [
      mkSplit(
        washParams(hue, 'accent', ctx.epicness, {
          width: 0.5,
          height: 0.65,
          positionFeather: 0.08,
        }),
        RAND.soft,
        ALL_GROUPS,
        {
          modManualAnchors: {
            x: 'center',
            y: 'center',
            brightness: 'bottom',
          },
        }
      ),
    ],
  }
}

function recipeBeatPulse(ctx: SceneBuildContext): BuiltScene {
  const hue = ctxHue(ctx, 'magenta')
  return {
    name: 'On-Beat Pulse',
    epicness: ctx.epicness,
    modulators: [
      beatSquare([{ brightness: 0.72, width: 0.35 }], 1, {
        squareDuty: 0.18,
      }),
    ],
    splitScenes: [fullStageSplit(ctx, hue, 'groove')],
  }
}

function recipeOffbeatPulse(ctx: SceneBuildContext): BuiltScene {
  const hue = ctxHue(ctx, 'lime')
  return {
    name: 'Offbeat Pulse',
    epicness: ctx.epicness,
    modulators: [
      beatSquare([{ brightness: 0.68, width: 0.32 }], 1, {
        phaseShift: 0.5,
        squareDuty: 0.2,
      }),
    ],
    splitScenes: [fullStageSplit(ctx, hue, 'groove')],
  }
}

function recipeHalfTimeGate(ctx: SceneBuildContext): BuiltScene {
  const hue = ctxHue(ctx, 'red')
  return {
    name: 'Half-Time Gate',
    epicness: ctx.epicness,
    modulators: [
      beatSquare([{ brightness: 0.82, width: 0.3 }], 2, {
        squareDuty: 0.16,
      }),
    ],
    splitScenes: [fullStageSplit(ctx, hue, 'groove', { saturation: 0.8 })],
  }
}

function recipeAudioBand(
  ctx: SceneBuildContext,
  band: 'kick' | 'snare' | 'hat' | 'vocal' | 'mid' | 'bass'
): BuiltScene {
  const familyByBand: Record<typeof band, LookFamily> = {
    kick: 'red',
    snare: 'cyan',
    hat: 'cool',
    vocal: 'magenta',
    mid: 'lime',
    bass: 'violet',
  }
  const hue = paletteHue(ctx.rng, familyByBand[band])
  const amount =
    band === 'kick' || band === 'bass'
      ? 0.55 + ctx.epicness * 0.2
      : 0.4 + ctx.epicness * 0.15
  return {
    name: AUDIO_BAND_NAMES[band],
    epicness: ctx.epicness,
    modulators: [
      mkAudioBand([{ brightness: amount }], band, {
        audioMax: 0.42 + ctx.epicness * 0.15,
      }),
    ],
    splitScenes: [
      fullStageSplit(ctx, hue, band === 'hat' ? 'accent' : 'groove'),
    ],
  }
}

function recipeDualPulse(ctx: SceneBuildContext): BuiltScene {
  const hue = ctxHue(ctx)
  const splits = dualZoneSplits(ctx, hue)
  return {
    name: 'Dual Side Pulse',
    epicness: ctx.epicness,
    modulators: [
      beatSquare(
        splits.map((_, index) =>
          index === 0 ? { brightness: 0.78 } : { brightness: 0.78 }
        ),
        1,
        { squareDuty: 0.18 }
      ),
      directorLfo(LfoShape.Sin, pickLfoPeriod(ctx.rng, 16), [
        [0, 'phaseShift', 0.35],
      ]),
    ],
    splitScenes: splits.map((split, index) => ({
      ...split,
      splitModShaping:
        index === 1
          ? { phaseOffsetBeats: 0.5 }
          : split.splitModShaping,
    })),
  }
}

function recipeEnergySwell(ctx: SceneBuildContext): BuiltScene {
  const hue = ctxHue(ctx, 'warm')
  return {
    name: 'Energy Swell',
    epicness: ctx.epicness,
    modulators: [
      mkEnergyLfo(
        [{ brightness: 0.4 + ctx.epicness * 0.2, saturation: 0.3 }],
        ctx.epicness > 0.7 ? 'hot' : 'med'
      ),
    ],
    splitScenes: [fullStageSplit(ctx, hue, 'groove')],
  }
}

function recipeBuildRamp(ctx: SceneBuildContext): BuiltScene {
  const hue = ctxHue(ctx, 'amber')
  return {
    name: 'Build Ramp',
    epicness: ctx.epicness,
    modulators: withPeriodSpeedDirector(
      [
        mkLfo(
          LfoShape.Ramp,
          pickLfoPeriod(ctx.rng, 16),
          [{ brightness: 0.65, saturation: 0.3 }],
          { rampCurve: 0.42 }
        ),
        mkAudioBand([{ brightness: 0.22 }], 'kick', { audioMax: 0.36 }),
      ],
      {
        targets: [0],
        bars: 16,
        depth: 'subtle',
        shape: LfoShape.Ramp,
        rng: ctx.rng,
      }
    ),
    splitScenes: [fullStageSplit(ctx, hue, 'groove')],
  }
}

function recipeNoiseJourney(ctx: SceneBuildContext): BuiltScene {
  const hue = ctxHue(ctx, 'violet')
  return {
    name: 'Color Journey',
    epicness: ctx.epicness,
    modulators: withPeriodSpeedDirector(
      [
        mkLfo(
          LfoShape.Noise,
          pickLfoPeriod(ctx.rng, 16),
          [{ hue: 0.28 }],
          {
            noiseSmoothing: 0.55,
            noiseSeed: ctx.rng.next(),
          }
        ),
        beatSquare([{ brightness: 0.42 }], 2, { squareDuty: 0.22 }),
      ],
      { targets: [0], bars: 16, depth: 'subtle', rng: ctx.rng }
    ),
    splitScenes: [fullStageSplit(ctx, hue, 'groove', { width: 0.7 })],
  }
}

function recipeSpectrumZones(ctx: SceneBuildContext): BuiltScene {
  const family = pickGroupFamily(ctx.profile, { minGroups: 2, maxGroups: 4 })
  const groupZones =
    family !== null
      ? buildGroupZones(ctx.profile, Math.min(4, family.groups.length))
      : null
  const useGroups =
    groupZones !== null &&
    groupZones.length >= 2 &&
    groupZones.every((zone) => zone.groupName)

  const zoneCount = useGroups
    ? groupZones!.length
    : Math.min(
        4,
        Math.max(
          2,
          ctx.profile.usableGroups.length ||
            (ctx.profile.fixtureCount >= 8 ? 4 : 2)
        )
      )
  const zones = useGroups
    ? groupZones!
    : buildSpatialZonesFromRig(ctx.profile, zoneCount, 1)
  const baseHue = ctxHue(ctx)

  return {
    name:
      useGroups && family !== null && family.label !== 'Stage groups'
        ? `Zone Wash · ${family.label}`
        : useGroups
          ? 'Group Zone Wash'
          : 'Zone Wash',
    epicness: ctx.epicness,
    modulators: [
      mkAudioBand(
        splitModsForCount(zoneCount, () => ({ brightness: 0.4 })),
        'mid',
        { audioMax: 0.4 }
      ),
    ],
    splitScenes: zones.map((zone, index) =>
      zoneSplit(
        zone,
        // Even spread across an analogous fan — readable as one look.
        hueShift(baseHue, (index / Math.max(1, zoneCount - 1)) * 0.14 - 0.07),
        { brightness: 0.3, saturation: 0.7 },
        zone.groupName
      )
    ),
  }
}

function recipePeakDrive(ctx: SceneBuildContext): BuiltScene {
  const hue = paletteHue(ctx.rng, 'red')
  const strobe = capabilityActive(ctx.capabilities, 'strobe')
    ? { strobe: 0.38 }
    : {}
  return {
    name: 'Peak Drive',
    epicness: ctx.epicness,
    modulators: [
      beatSquare([{ brightness: 0.95, width: 0.45 }], 1, {
        squareDuty: 0.14,
      }),
      mkAudioBand([{ brightness: 0.45 }], 'kick', { audioAttack: 0.88 }),
    ],
    splitScenes: [
      mkSplit(
        withSlotEnvelopes(
          washParams(hue, 'peak', ctx.epicness, {
            width: 0.55,
            ...strobe,
          }),
          { randomize: 0.4 }
        ),
        RAND.spark,
        ALL_GROUPS,
        { modManualAnchors: { brightness: 'bottom', width: 'bottom' } }
      ),
    ],
  }
}

function recipeOpenPeak(ctx: SceneBuildContext): BuiltScene {
  const hue = paletteHue(ctx.rng, 'magenta')
  return {
    name: 'Open Peak',
    epicness: ctx.epicness,
    modulators: [
      beatSquare([{ brightness: 1, saturation: 0.25 }], 1, {
        squareDuty: 0.22,
      }),
      mkEnergyLfo([{ brightness: 0.35 }], 'hot', { audioMax: 0.7 }),
    ],
    splitScenes: [
      fullStageSplit(ctx, hue, 'peak', { width: 0.9, brightness: 0.22 }),
    ],
  }
}

function recipeMoverShowcase(
  ctx: SceneBuildContext,
  mode: 'sweep' | 'tandem' | 'mirror' | 'peak'
): BuiltScene {
  const pattern =
    mode === 'peak'
      ? 'crossScan'
      : mode === 'mirror'
        ? 'figureEight'
        : mode === 'tandem'
          ? 'horizontalArch'
          : 'slowDrift'
  const hue = paletteHue(ctx.rng, mode === 'peak' ? 'red' : 'cool')
  const moverPatch =
    mode === 'tandem'
      ? { moverMode: 1, moverSpread: 0.42 }
      : mode === 'mirror'
        ? { moverMode: 2, moverMirrorX: 1, moverMirrorY: 1 }
        : mode === 'peak'
          ? {
              moverMode: 1,
              moverSpread: 0.5,
              brightness: 0.28,
              saturation: 0.8,
            }
          : { hue, saturation: 0.55 }

  const mods = [
    ...buildMoverPatternMods(pattern, ctx.epicness, 2, ctx.rng.next()),
  ]
  if (mode === 'tandem') {
    mods.push(mkAudioBand([{ brightness: 0.2 }], 'snare', { audioMax: 0.32 }))
  }
  if (mode === 'mirror') {
    mods.push(
      beatSquare([{ brightness: 0.22 }, { brightness: 0.18 }], 2, {
        squareDuty: 0.16,
      })
    )
  }
  if (mode === 'peak') {
    mods.push(mkEnergyLfo([{ brightness: 0.28 }, { brightness: 0.22 }], 'hot'))
  }

  const moverNames = {
    sweep: 'Mover Floor Sweep',
    tandem: 'Mover Tandem Sweep',
    mirror: 'Mover Mirror Split',
    peak: 'Mover Peak Drive',
  } as const

  return {
    name: moverNames[mode],
    epicness: ctx.epicness,
    modulators: mods,
    splitScenes: [
      fullStageSplit(ctx, hue, 'wash', { brightness: 0.28, width: 0.8 }),
      moverSplit(ctx.epicness, moverPatch),
    ],
  }
}

function recipeMoverChoreoShowcase(
  ctx: SceneBuildContext,
  style: MoverChoreoStyle
): BuiltScene {
  const hue = paletteHue(ctx.rng, 'cool')
  if (style === 'tiltSweep') {
    return {
      name: 'Mover Beat Tilt Sweep',
      epicness: ctx.epicness,
      modulators: [
        ...buildMoverBeatTiltSweepMods(ctx.epicness, 2, ctx.rng.next()),
        mkAudioBand([{ brightness: 0.16 }, {}], 'kick', { audioMax: 0.3 }),
      ],
      splitScenes: [
        fullStageSplit(ctx, hue, 'wash', { brightness: 0.26, width: 0.75 }),
        moverChoreoSplit(ctx.epicness, { hue }),
      ],
    }
  }

  const columnCount = resolveMoverColumnCount(ctx.profile)
  const columns =
    ctx.profile.fixtureCount > 0
      ? buildSpatialZonesFromRig(ctx.profile, columnCount, 1).map((zone) => ({
          x: zone.x,
          y: zone.y,
          width: zone.width,
          height: 0.85,
        }))
      : defaultRowColumnZones(columnCount)
  const columnStartIndex = 1
  const totalSplits = 1 + columnCount

  return {
    name: 'Mover Pan Cascade',
    epicness: ctx.epicness,
    modulators: [
      ...buildMoverPanCascadeMods(
        totalSplits,
        columnStartIndex,
        columnCount,
        ctx.rng.next()
      ),
    ],
    splitScenes: [
      fullStageSplit(ctx, hue, 'wash', {
        brightness: 0.3,
        saturation: 0.65,
        width: 0.72,
      }),
      ...buildMoverRowColumnSplits(ctx.epicness, columns, {
        returnStaggerBeats: 16,
      }),
    ],
  }
}

function resolveRecipeChaseZones(
  ctx: SceneBuildContext,
  axis: 'columns' | 'rows',
  strips: number
) {
  const fromGroups = resolveChaseGroupZones(ctx.profile, axis, strips)
  if (fromGroups !== null) {
    return {
      zones: fromGroups.zones,
      familyLabel:
        fromGroups.family.label === 'Stage groups'
          ? null
          : fromGroups.family.label,
    }
  }
  return {
    zones: buildChaseZones(ctx.profile, axis, strips),
    familyLabel: null as string | null,
  }
}

function withFamilyLabel(base: string, familyLabel: string | null): string {
  if (familyLabel === null || familyLabel.length === 0) {
    return base
  }
  return `${base} · ${familyLabel}`
}

function recipeColorChase(
  ctx: SceneBuildContext,
  axis: 'columns' | 'rows',
  direction: ChaseDirection,
  label: string
): BuiltScene {
  const strips = chaseStripCount(ctx.profile)
  const { zones, familyLabel } = resolveRecipeChaseZones(ctx, axis, strips)
  const n = Math.max(2, zones.length)
  const beatsPerStep = 1
  const period = chasePeriodBeats(n, beatsPerStep)
  // One solid color for the chase — strips differ in time, not hue soup.
  const baseHue = ctxHue(ctx, axis === 'columns' ? 'cyan' : 'magenta')

  return {
    name: withFamilyLabel(label, familyLabel),
    epicness: ctx.epicness,
    modulators: [chaseBrightnessMod(n, period, 0.92)],
    splitScenes: withStaggeredPhase(
      zones.map((zone) =>
        chaseZoneSplit(
          zone,
          baseHue,
          {
            saturation: 0.88,
            width: zone.width,
            height: zone.height,
          },
          zone.groupName
        )
      ),
      { beatsPerStep, direction }
    ),
  }
}

function recipeBlankingChase(
  ctx: SceneBuildContext,
  axis: 'columns' | 'rows',
  direction: ChaseDirection,
  label: string
): BuiltScene {
  const strips = chaseStripCount(ctx.profile)
  const { zones, familyLabel } = resolveRecipeChaseZones(ctx, axis, strips)
  const n = Math.max(2, zones.length)
  const beatsPerStep = 1
  const period = chasePeriodBeats(n, beatsPerStep)
  const baseHue = ctxHue(ctx, 'cool')

  return {
    name: withFamilyLabel(label, familyLabel),
    epicness: ctx.epicness,
    modulators: [chaseBrightnessMod(n, period, 0.95)],
    splitScenes: withStaggeredPhase(
      zones.map((zone) =>
        chaseZoneSplit(
          zone,
          baseHue,
          {
            saturation: 0.65,
            brightness: 0,
            width: zone.width,
            height: zone.height,
          },
          zone.groupName
        )
      ),
      { beatsPerStep, direction }
    ),
  }
}

function recipeOpposingSplitChase(
  ctx: SceneBuildContext,
  label: string
): BuiltScene {
  const strips = Math.max(4, chaseStripCount(ctx.profile))
  const { zones, familyLabel } = resolveRecipeChaseZones(ctx, 'columns', strips)
  const n = Math.max(2, zones.length)
  const beatsPerStep = 1
  const period = chasePeriodBeats(Math.ceil(n / 2), beatsPerStep)
  const leftHue = paletteHue(ctx.rng, 'cool')
  const rightHue = hueShift(leftHue, 0.12)

  return {
    name: withFamilyLabel(label, familyLabel),
    epicness: ctx.epicness,
    modulators: [chaseBrightnessMod(n, period, 0.9)],
    splitScenes: withOpposingHalvesPhase(
      zones.map((zone, index) =>
        chaseZoneSplit(
          zone,
          index < n / 2 ? leftHue : rightHue,
          {
            saturation: 0.85,
            width: zone.width,
            height: zone.height,
          },
          zone.groupName
        )
      ),
      beatsPerStep
    ),
  }
}

/** Single-split traveling bar — LFO drives the position pad across the stage. */
function recipeTravelingBar(
  ctx: SceneBuildContext,
  axis: 'x' | 'y',
  label: string
): BuiltScene {
  const period = pickLfoPeriod(ctx.rng, 16)
  const hue = paletteHue(ctx.rng, axis === 'x' ? 'cyan' : 'amber')
  const barWidth = axis === 'x' ? 0.2 : 0.88
  const barHeight = axis === 'x' ? 0.92 : 0.2

  return {
    name: label,
    epicness: ctx.epicness,
    modulators: withPeriodSpeedDirector(
      [
        mkLfo(LfoShape.Ramp, period, [{ [axis]: 0.98 }], { rampCurve: 0.4 }),
        mkLfo(LfoShape.Sin, pickLfoPeriod(ctx.rng, 16), [{ brightness: 0.12 }]),
      ],
      {
        targets: [0],
        bars: 16,
        depth: 'subtle',
        shape: LfoShape.Sin,
        rng: ctx.rng,
      }
    ),
    splitScenes: [
      mkSplit(
        washParams(hue, 'accent', ctx.epicness, {
          x: 0.5,
          y: 0.5,
          width: barWidth,
          height: barHeight,
          brightness: 0.52 + ctx.epicness * 0.1,
          saturation: 0.9,
          positionFeather: 0.03,
        }),
        RAND.light,
        ALL_GROUPS,
        {
          modManualAnchors: {
            brightness: 'bottom',
            [axis]: 'center',
          },
        }
      ),
    ],
  }
}

function recipePositionSweep(ctx: SceneBuildContext): BuiltScene {
  const period = pickLfoPeriod(ctx.rng, 16)
  const hue = paletteHue(ctx.rng, 'lime')
  return {
    name: 'Position Sweep L→R',
    epicness: ctx.epicness,
    modulators: withPeriodSpeedDirector(
      [
        mkLfo(LfoShape.Sin, period, [{ x: 0.92 }], { phaseShift: 0 }),
        mkLfo(LfoShape.Sin, period, [{ width: 0.35 }], { phaseShift: 0.25 }),
      ],
      { targets: [0, 1], bars: 16, depth: 'subtle', rng: ctx.rng }
    ),
    splitScenes: [
      mkSplit(
        washParams(hue, 'accent', ctx.epicness, {
          x: 0.5,
          y: 0.5,
          width: 0.32,
          height: 0.88,
          brightness: 0.48,
          positionFeather: 0.05,
        }),
        RAND.light,
        ALL_GROUPS,
        {
          modManualAnchors: {
            x: 'center',
            width: 'center',
            brightness: 'bottom',
          },
        }
      ),
    ],
  }
}

function recipeExpandingIris(ctx: SceneBuildContext): BuiltScene {
  const period = pickLfoPeriod(ctx.rng, 16)
  const hue = paletteHue(ctx.rng, 'warm')
  return {
    name: 'Expanding Iris',
    epicness: ctx.epicness,
    modulators: withPeriodSpeedDirector(
      [
        mkLfo(LfoShape.Sin, period, [{ width: 0.7, height: 0.7 }], {
          phaseShift: 0,
        }),
        mkLfo(LfoShape.Sin, pickLfoPeriod(ctx.rng, 16), [{ brightness: 0.22 }]),
      ],
      { targets: [0], bars: 16, depth: 'subtle', rng: ctx.rng }
    ),
    splitScenes: [
      mkSplit(
        washParams(hue, 'accent', ctx.epicness, {
          x: 0.5,
          y: 0.5,
          width: 0.2,
          height: 0.2,
          brightness: 0.42,
          positionFeather: 0.07,
        }),
        RAND.light,
        ALL_GROUPS,
        {
          modManualAnchors: {
            width: 'bottom',
            height: 'bottom',
            brightness: 'bottom',
          },
        }
      ),
    ],
  }
}

function recipeCallResponse(ctx: SceneBuildContext): BuiltScene {
  const hue = ctxHue(ctx)
  const splits = dualZoneSplits(ctx, hue)
  const splitMods = splits.map((_, index) =>
    index === 0 ? { brightness: 0.82 } : {}
  )
  const splitModsB = splits.map((_, index) =>
    index === 1 ? { brightness: 0.82 } : {}
  )
  return {
    name: 'Call & Response',
    epicness: ctx.epicness,
    modulators: [
      beatSquare(splitMods, 1, { squareDuty: 0.2 }),
      beatSquare(splitModsB, 1, { phaseShift: 0.5, squareDuty: 0.2 }),
    ],
    splitScenes: splits,
  }
}

function recipeStrobeColorGate(ctx: SceneBuildContext): BuiltScene {
  const hue = paletteHue(ctx.rng, 'red')
  const strobe = capabilityActive(ctx.capabilities, 'strobe')
    ? { strobe: 0.48 }
    : {}
  return {
    name: 'Strobe Gate',
    epicness: ctx.epicness,
    modulators: [
      beatSquare([{ brightness: 1 }], 1, { squareDuty: 0.1 }),
    ],
    splitScenes: [
      mkSplit(
        washParams(hue, 'peak', ctx.epicness, {
          width: 0.72,
          ...strobe,
        }),
        RAND.spark,
        ALL_GROUPS,
        { modManualAnchors: { brightness: 'bottom' } }
      ),
    ],
  }
}

function recipeRandomSpark(ctx: SceneBuildContext): BuiltScene {
  const hue = paletteHue(ctx.rng, 'magenta')
  return {
    name: 'Random Spark Hits',
    epicness: ctx.epicness,
    modulators: [
      beatSquare([{ brightness: 0.88 }], 1, { squareDuty: 0.08 }),
    ],
    splitScenes: [
      mkSplit(
        withSlotEnvelopes(
          washParams(hue, 'peak', ctx.epicness, {
            brightness: 0.06,
            width: 0.5,
          }),
          { randomize: 0.7, chase: 0.5 }
        ),
        RAND.spark,
        ALL_GROUPS,
        {
          chase: CHASE.step,
          modManualAnchors: { brightness: 'bottom' },
        }
      ),
    ],
  }
}

/**
 * Deterministic cue-list ladder: open → groove → build/motion → peak.
 * Seed only jitters palette within families — never reshuffles recipe roles.
 */
function recipeForLadderIndex(
  index: number,
  capabilities: SceneGenerationCapabilities
): SceneRecipe {
  const wantBeat = capabilityActive(capabilities, 'beat')
  const wantAudio = capabilityActive(capabilities, 'audio')
  const wantSpatial = capabilityActive(capabilities, 'spatial')

  const beat = wantBeat ? recipeBeatPulse : recipeEnergySwell
  const offbeat = wantBeat ? recipeOffbeatPulse : recipeAmbientGlow
  const halfTime = wantBeat ? recipeHalfTimeGate : recipeEnergySwell
  const kick = wantAudio
    ? (ctx: SceneBuildContext) => recipeAudioBand(ctx, 'kick')
    : recipeEnergySwell
  const snare = wantAudio
    ? (ctx: SceneBuildContext) => recipeAudioBand(ctx, 'snare')
    : recipeDualPulse
  const hat = wantAudio
    ? (ctx: SceneBuildContext) => recipeAudioBand(ctx, 'hat')
    : recipeSoftColorDrift
  const vocal = wantAudio
    ? (ctx: SceneBuildContext) => recipeAudioBand(ctx, 'vocal')
    : recipeAmbientGlow
  const traveling = wantSpatial
    ? (ctx: SceneBuildContext) =>
        recipeTravelingBar(ctx, 'x', 'Traveling Bar L→R')
    : recipeDualPulse
  const travelingY = wantSpatial
    ? (ctx: SceneBuildContext) =>
        recipeTravelingBar(ctx, 'y', 'Traveling Bar T→B')
    : recipeNoiseJourney
  const sweep = wantSpatial ? recipePositionSweep : recipeBuildRamp
  const iris = wantSpatial ? recipeExpandingIris : recipeSoftPositionDrift
  const spectrum = wantSpatial ? recipeSpectrumZones : recipeDualPulse
  const softDrift = wantSpatial ? recipeSoftPositionDrift : recipeSoftColorDrift
  const wigwag = wantSpatial ? buildWigWagScene : recipeCallResponse
  const call = wantBeat || wantAudio ? recipeCallResponse : recipeDualPulse

  const ladder: SceneRecipe[] = [
    recipeCoolWash, // open — base looks
    recipeWarmWash,
    recipeDimWash,
    recipeAmbientGlow,
    recipeSoftColorDrift,
    softDrift,
    beat, // groove — one clear rhythmic driver
    offbeat,
    halfTime,
    kick,
    snare,
    hat,
    vocal,
    recipeEnergySwell, // build
    recipeBuildRamp,
    traveling, // motion — position pad linked
    sweep,
    (ctx) => recipeAudioBand(ctx, wantAudio ? 'bass' : 'mid'),
    iris,
    call,
    wigwag,
    spectrum,
    travelingY,
    recipeNoiseJourney,
    recipeDualPulse,
    recipeRandomSpark, // peak — intentional, not stacked chaos
    recipeStrobeColorGate,
    recipePeakDrive,
    recipeOpenPeak,
    recipePeakDrive,
    recipeOpenPeak,
  ]

  return ladder[Math.min(index, ladder.length - 1)] ?? recipePeakDrive
}

function pickRecipeForTier(
  index: number,
  _rng: SeededRng,
  capabilities: SceneGenerationCapabilities
): SceneRecipe {
  return recipeForLadderIndex(index, capabilities)
}

function buildChaseShowcase(
  ctx: SceneBuildContext,
  showcase: (typeof CHASE_SHOWCASES)[number]
): BuiltScene {
  if (showcase.kind === 'color') {
    return recipeColorChase(ctx, showcase.axis, showcase.direction, showcase.label)
  }
  if (showcase.kind === 'blanking') {
    return recipeBlankingChase(ctx, showcase.axis, showcase.direction, showcase.label)
  }
  return recipeOpposingSplitChase(ctx, showcase.label)
}

/**
 * Weighted sample of ladder indices without replacement.
 * bias 0 → prefer low epicness, 1 → prefer high.
 */
function sampleLadderIndices(
  ladderLength: number,
  count: number,
  bias: number,
  rng: SeededRng
): number[] {
  const target = Math.max(0, Math.min(ladderLength - 1, bias * (ladderLength - 1)))
  const remaining = Array.from({ length: ladderLength }, (_, i) => i)
  const picked: number[] = []

  while (picked.length < count && remaining.length > 0) {
    let weightSum = 0
    const weights = remaining.map((index) => {
      const distance = Math.abs(index - target)
      const weight = 1 / (1 + distance * distance * 0.35)
      weightSum += weight
      return weight
    })
    let roll = rng.float(0, weightSum)
    let chosenSlot = remaining.length - 1
    for (let i = 0; i < remaining.length; i++) {
      roll -= weights[i]!
      if (roll <= 0) {
        chosenSlot = i
        break
      }
    }
    picked.push(remaining[chosenSlot]!)
    remaining.splice(chosenSlot, 1)
  }

  return picked.sort((a, b) => a - b)
}

export function buildCoreScenes(
  rng: SeededRng,
  profile: RigProfile,
  prefs: ResolvedSceneGenerationPrefs,
  capabilities: SceneGenerationCapabilities
): LightScene_t[] {
  const usedNames = new Set<string>()
  const scenes: LightScene_t[] = []
  const ladder = EPICNESS_LADDER
  const indices =
    prefs.sceneCount === null
      ? ladder.map((_, index) => index)
      : sampleLadderIndices(
          ladder.length,
          Math.min(ladder.length, prefs.sceneCount),
          prefs.epicnessBias,
          rng
        )

  indices.forEach((index, buildIndex) => {
    const epicness = ladder[index]!
    const ctx: SceneBuildContext = {
      rng,
      profile,
      epicness,
      index: buildIndex,
      capabilities,
    }
    const recipe = pickRecipeForTier(index, rng, capabilities)
    const built = recipe(ctx)
    const scene: LightScene_t = {
      ...built,
      name: finalizeSceneName(usedNames, rng, built.name),
      autoEnabled: true,
    }
    scenes.push(
      attachMoverAwareness(scene, {
        enabled: capabilityActive(capabilities, 'movers'),
        patternSeed: rng.int(1_000_000) + buildIndex,
      })
    )
  })

  return scenes
}

export function buildMoverScenes(
  rng: SeededRng,
  profile: RigProfile,
  capabilities: SceneGenerationCapabilities,
  maxCount?: number
): LightScene_t[] {
  if (!capabilityActive(capabilities, 'movers')) {
    return []
  }
  const usedNames = new Set<string>()
  const showcases =
    maxCount === undefined
      ? MOVER_SHOWCASES
      : MOVER_SHOWCASES.slice(0, Math.max(0, maxCount))

  return showcases.map((showcase, index) => {
    const ctx: SceneBuildContext = {
      rng,
      profile,
      epicness: showcase.epicness,
      index: EPICNESS_LADDER.length + index,
      capabilities,
    }
    const built =
      showcase.kind === 'choreo'
        ? recipeMoverChoreoShowcase(ctx, showcase.style)
        : recipeMoverShowcase(ctx, showcase.mode)
    return {
      ...built,
      name: finalizeSceneName(usedNames, rng, built.name),
      autoEnabled: true,
    }
  })
}

export function buildChaseScenes(
  rng: SeededRng,
  profile: RigProfile,
  capabilities: SceneGenerationCapabilities,
  maxCount?: number
): LightScene_t[] {
  if (!capabilityActive(capabilities, 'spatial')) {
    return []
  }
  const usedNames = new Set<string>()
  const showcases =
    maxCount === undefined
      ? CHASE_SHOWCASES
      : CHASE_SHOWCASES.slice(0, Math.max(0, maxCount))

  return showcases.map((showcase, index) => {
    const ctx: SceneBuildContext = {
      rng,
      profile,
      epicness: showcase.epicness,
      index: EPICNESS_LADDER.length + MOVER_SHOWCASES.length + index,
      capabilities,
    }
    const built = buildChaseShowcase(ctx, showcase)
    return {
      ...built,
      name: finalizeSceneName(usedNames, rng, built.name),
      autoEnabled: true,
    }
  })
}

export function buildLightScenesList(
  rng: SeededRng,
  profile: RigProfile,
  prefs: ResolvedSceneGenerationPrefs,
  capabilities: SceneGenerationCapabilities
): LightScene_t[] {
  const wantMovers = capabilityActive(capabilities, 'movers')
  const wantSpatial = capabilityActive(capabilities, 'spatial')
  let coreBudget = prefs.sceneCount
  let moverBudget: number | undefined
  let chaseBudget: number | undefined

  if (coreBudget !== null) {
    let remaining = coreBudget
    if (wantMovers) {
      moverBudget = Math.min(
        MOVER_SHOWCASES.length,
        Math.max(1, Math.floor(remaining * 0.22))
      )
      remaining -= moverBudget
    } else {
      moverBudget = 0
    }
    if (wantSpatial) {
      chaseBudget = Math.min(
        CHASE_SHOWCASES.length,
        Math.max(1, Math.floor(remaining * 0.28))
      )
      remaining -= chaseBudget
    } else {
      chaseBudget = 0
    }
    coreBudget = Math.max(1, remaining)
  }

  const corePrefs: ResolvedSceneGenerationPrefs = {
    ...prefs,
    sceneCount: coreBudget,
  }

  return [
    ...buildCoreScenes(rng, profile, corePrefs, capabilities),
    ...buildChaseScenes(rng, profile, capabilities, chaseBudget),
    ...buildMoverScenes(rng, profile, capabilities, moverBudget),
  ].sort((a, b) => a.epicness - b.epicness)
}
