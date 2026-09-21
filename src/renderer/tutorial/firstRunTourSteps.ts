import type { Page } from '../../shared/pages'
import type { DefaultParam } from '../../shared/params'
import { TOUR_IDS, type TourId } from './tourIds'
import type { TourProjectProgress } from './tourProjectProgress'

export type TourAdvance =
  | { kind: 'next' }
  /** User must click the spotlighted element (or any descendant). */
  | { kind: 'click' }
  /** Advance when `gui.activePage` matches. */
  | { kind: 'page'; page: Page }
  /** Advance when connections menu open state matches. */
  | { kind: 'connections'; open: boolean }
  /** Advance when the active light split has this base param. */
  | { kind: 'paramPresent'; param: DefaultParam }
  /** Advance once the spotlight target exists in the DOM. */
  | { kind: 'targetPresent' }
  /** Advance once the spotlight target is gone (after it was seen). */
  | { kind: 'targetGone' }
  /** Fixture type count grew since this step began (import / create / search). */
  | { kind: 'fixtureTypesAdded' }
  /** At least one fixture placed on the universe map since step began. */
  | { kind: 'fixturesPatched' }
  /** Absolute: library already has this many types. */
  | { kind: 'minFixtureTypes'; count: number }
  /** Absolute: universe has this many patched fixtures. */
  | { kind: 'minPatchedFixtures'; count: number }
  /** Absolute: at least one patched fixture has a group. */
  | { kind: 'hasGroupedFixture' }
  /** Absolute: basic color/intensity params exist on the active scene. */
  | { kind: 'hasBasicLookParams' }
  /** Any listed advance condition is enough. */
  | { kind: 'or'; of: TourAdvance[] }

export type TourStepContent = {
  title: string
  body: string | string[]
  tip?: string
  nextLabel?: string
}

export type TourStep = TourStepContent & {
  id: string
  /** Spotlight target; omit for centered intro/outro cards. */
  target?: TourId
  advance: TourAdvance
  /** Ensure this page is active before measuring the target. */
  ensurePage?: Page
  /** Close the connections modal before this step. */
  closeConnections?: boolean
  /**
   * Hide the page dim so portaled popups/modals stay fully usable.
   */
  suppressDim?: boolean
  /**
   * Skip this step when the project already satisfies the condition
   * (evaluated when the step becomes current).
   */
  skipWhen?: (progress: TourProjectProgress) => boolean
  /**
   * Alternate coaching when the project already completed this beat —
   * shown instead of the default body (step is not skipped).
   */
  whenAlreadyDone?: (
    progress: TourProjectProgress
  ) => TourStepContent | null | undefined
  /**
   * Show a primary Continue even while waiting on an auto-advance condition
   * (e.g. “I’ll add fixtures later”).
   */
  allowContinue?: boolean
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}

/**
 * First-run interactive tutorial — written for someone who has never used a
 * lighting desk. Steps adapt to what the open project already has.
 */
export const FIRST_RUN_TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome — let’s light something up',
    body: [
      'Captivate turns your computer into a lighting controller: you describe which lights you have, build looks (“scenes”), and Captivate sends the right signals to your fixtures.',
      'This tour uses the real buttons in the app. The rest of the screen dims so you can follow along. Skip any step you already know — you can replay the tour anytime from Help → Interactive Tutorial.',
      'You do not need prior lighting experience. We will go from “what is a fixture?” to “I can change color and save a show.”',
    ],
    tip: 'Ideal path: add (or import) at least one fixture, connect a DMX output if you have hardware, then build a simple colored scene.',
    advance: { kind: 'next' },
    nextLabel: 'Start here',
    ensurePage: 'Universe',
    closeConnections: true,
    whenAlreadyDone: (p) =>
      p.fixtureTypeCount > 0 || p.patchedFixtureCount > 0
        ? {
            title: 'Welcome back — we’ll meet you where you are',
            body: [
              `This project already has ${p.fixtureTypeCount} fixture ${plural(p.fixtureTypeCount, 'type', 'types')} and ${p.patchedFixtureCount} patched ${plural(p.patchedFixtureCount, 'fixture', 'fixtures')}.`,
              'The tour will skip setup you have finished and spend more time on scenes, parameters, and live control. You can still walk every screen if you want a refresher.',
            ],
            tip: 'Nothing will wipe your project — this is guidance only.',
            nextLabel: 'Continue',
          }
        : null,
  },
  {
    id: 'big-picture',
    title: 'The big picture (30 seconds)',
    body: [
      'Think in four layers:',
      '1) Fixtures — the physical lights (or LED controllers) and how they are addressed.',
      '2) Groups — labels like “wash”, “spots”, or “left wall” so a look can talk to the right lights.',
      '3) Scenes — complete looks you can jump between (calm blue wash, big chorus hit, blackout cue, …).',
      '4) Output — Master / Blackout / Start clock decide what actually leaves the computer.',
      'If lights stay dark later, it is almost always: no fixture patched, wrong address, Master at zero, Blackout on, or no DMX device selected — we will cover each.',
    ],
    advance: { kind: 'next' },
    nextLabel: 'Got it',
    ensurePage: 'Universe',
  },
  {
    id: 'nav-universe',
    title: 'Universe = your patch bay',
    body: [
      'Click Universe in the left sidebar (gear icon).',
      '“Universe” is lighting slang for a DMX network — up to 512 channels of control data. Captivate’s Universe page is where you invent fixture types and place them on a stage map with channel addresses.',
      'You will live here when setting up a new venue or festival stage, then spend showtime mostly on Scenes.',
    ],
    tip: 'Click the highlighted Universe button to continue.',
    target: TOUR_IDS.navUniverse,
    advance: { kind: 'click' },
    allowContinue: true,
  },
  {
    id: 'fixtures',
    title: 'Fixture library (left panel)',
    body: [
      'This list is your fixture library: definitions of light types (a PAR can, a moving head, a fog machine profile, a WLED strip, …).',
      'A definition answers: “How many DMX channels does this light use, and what does each channel do (dimmer, red, pan, …)?” Captivate needs that map before it can drive the light.',
      'You can keep many types in the library and only place the ones you actually own onto the map on the right.',
    ],
    tip: 'If this list is empty, the next steps show you how to add your first fixture type.',
    target: TOUR_IDS.fixtures,
    advance: { kind: 'next' },
    ensurePage: 'Universe',
    whenAlreadyDone: (p) =>
      p.fixtureTypeCount > 0
        ? {
            title: 'Your fixture library already has types',
            body: [
              `Nice — ${p.fixtureTypeCount} fixture ${plural(p.fixtureTypeCount, 'type is', 'types are')} already in this project.`,
              'Each type is a recipe for channels. On the right map you place instances of those types with real DMX start addresses.',
              'You can still add more types anytime with + under the list.',
            ],
            tip: 'Continue to place fixtures on the map, or add another type first if you want.',
            nextLabel: 'Continue',
          }
        : null,
  },
  {
    id: 'add-fixture',
    title: 'Add your first fixture type',
    body: [
      'Click the + under the fixture list.',
      'You are not turning a light on yet — you are teaching Captivate what kind of light exists so it knows which channels to send.',
    ],
    tip: 'Click the highlighted + to open the Add Fixture menu.',
    target: TOUR_IDS.addFixture,
    advance: {
      kind: 'or',
      of: [{ kind: 'click' }, { kind: 'fixtureTypesAdded' }],
    },
    ensurePage: 'Universe',
    skipWhen: (p) => p.fixtureTypeCount > 0,
    allowContinue: true,
  },
  {
    id: 'add-fixture-menu',
    title: 'Add a fixture — then we will notice it',
    body: [
      'Three ways in:',
      '• Import From File — load a definition you already have.',
      '• Create New — wizard if you know the channel layout from the manual.',
      '• Search For Fixture Online — browse public libraries (often the fastest for standard lights). Search brand/model, import, done.',
      'When a new fixture type appears in your library, this step continues automatically. You do not need to press Skip.',
    ],
    tip: 'Busy with the online browser or create wizard? Finish importing — the tour is watching the library count.',
    target: TOUR_IDS.addFixturePopup,
    advance: { kind: 'fixtureTypesAdded' },
    ensurePage: 'Universe',
    suppressDim: true,
    skipWhen: (p) => p.fixtureTypeCount > 0,
    allowContinue: true,
  },
  {
    id: 'universe-map',
    title: 'Place fixtures on the stage map',
    body: [
      'The right side is your patch map: where each physical light sits in space and which DMX address it starts at.',
      'Address (often called the “start channel”) must match the dials/menu on the real fixture. If Captivate says channel 1 but the light is set to 40, nothing useful will happen.',
      'Drag fixtures into the window so Captivate knows left vs right, front vs back — that powers spatial looks, chases across the stage, and smart groupings.',
    ],
    tip: 'Add at least one fixture to the map (drag from the library or use the map’s add controls). The tour continues when something is patched — or press Continue to do it later.',
    target: TOUR_IDS.universeMap,
    advance: { kind: 'fixturesPatched' },
    ensurePage: 'Universe',
    allowContinue: true,
    whenAlreadyDone: (p) =>
      p.patchedFixtureCount > 0
        ? {
            title: 'Fixtures are already on the map',
            body: [
              `This project has ${p.patchedFixtureCount} patched ${plural(p.patchedFixtureCount, 'fixture', 'fixtures')}.`,
              'Double-check start addresses against the hardware, and drag icons if the layout does not match the real stage.',
            ],
            tip: 'Continue when the layout looks right.',
            nextLabel: 'Continue',
          }
        : null,
  },
  {
    id: 'smart-groupings',
    title: 'Groups — how scenes find your lights',
    body: [
      'Groups are nametags: “wash”, “spots”, “LED wall”, “MOVERS”, etc. A scene split can say “only control fixtures in group wash.”',
      'Without groups (or with everything in one group), every look hits every light — fine for a tiny rig, messy for a real stage.',
      'Smart groupings… can invent groups from how you placed fixtures (left/right, rows, even/odd, and more). You can also assign groups per fixture with Groups… in the inspector.',
    ],
    tip: 'After you have fixtures on the map, try Smart groupings. Continue whenever you are ready.',
    target: TOUR_IDS.smartGroupings,
    advance: { kind: 'hasGroupedFixture' },
    ensurePage: 'Universe',
    allowContinue: true,
    whenAlreadyDone: (p) =>
      p.fixturesWithGroups > 0
        ? {
            title: 'Groups are already assigned',
            body: [
              `${p.fixturesWithGroups} patched ${plural(p.fixturesWithGroups, 'fixture has', 'fixtures have')} at least one group.`,
              'You can still open Smart groupings to refine families, or Continue to Connections.',
            ],
            tip: 'Groups are what scene splits filter on — keep names meaningful.',
            nextLabel: 'Continue',
          }
        : null,
  },
  {
    id: 'connections',
    title: 'Tell Captivate where to send DMX',
    body: [
      'Click Connections (ethernet icon in the top bar).',
      'Software looks great on screen, but fixtures only move when Captivate has an output path: a USB DMX interface, Art-Net / sACN network node, etc.',
      'MIDI (optional) lets controllers and keyboards trigger scenes or learn mappings. Audio input (optional) lets bass/mids drive effects.',
      'If you are only exploring the UI today, you can open Connections, look around, and close it — just remember to come back before showtime.',
    ],
    tip: 'Click the highlighted Connections button.',
    target: TOUR_IDS.connections,
    advance: { kind: 'click' },
    ensurePage: 'Universe',
    allowContinue: true,
    whenAlreadyDone: (p) =>
      p.dmxConnected
        ? {
            title: 'A DMX output is already connected',
            body: [
              'Captivate sees at least one DMX connection. You can still open Connections to review Art-Net, MIDI, or audio.',
              'Continue when you are ready — or click Connections to peek.',
            ],
            tip: p.midiConnected
              ? 'MIDI is connected too — nice for faders and scene buttons.'
              : 'MIDI is optional; add it later if you use a controller.',
            nextLabel: 'Continue',
          }
        : null,
  },
  {
    id: 'connections-close',
    title: 'Pick an output (when you have one)',
    body: [
      'Under DMX, choose your interface or enable Art-Net/sACN if you use a network node. The status lights in the bar show whether Captivate believes a port is connected.',
      'Universe count should cover every universe you patched (most small shows use 1).',
      'When you are done looking, click Close. The tour waits for this window to close.',
    ],
    tip: 'No interface plugged in? Close the window and continue — you can still build scenes.',
    target: TOUR_IDS.connectionsClose,
    advance: { kind: 'connections', open: false },
    suppressDim: true,
    skipWhen: (p) => !p.connectionsOpen,
    allowContinue: true,
  },
  {
    id: 'nav-scenes',
    title: 'Scenes — where the show lives',
    body: [
      'Click Scenes (lightbulb) in the sidebar.',
      'This page is your programming surface: a list of light scenes on the left, and on the right the “engine room” for the selected scene — modulators (motion over time) and splits (who gets which controls).',
      'Show operators mostly click scenes. Designers spend time shaping what each scene contains.',
    ],
    tip: 'Click the highlighted Scenes button.',
    target: TOUR_IDS.navScenes,
    advance: { kind: 'click' },
    closeConnections: true,
    allowContinue: true,
    whenAlreadyDone: (p) =>
      p.activePage === 'Modulation'
        ? {
            title: 'You are already on Scenes',
            body: [
              'Light scenes list on the left; modulators and splits on the right for the selected scene.',
            ],
            tip: 'Continue to inspect the scene list.',
            nextLabel: 'Continue',
          }
        : null,
  },
  {
    id: 'light-scenes',
    title: 'Light scenes are complete looks',
    body: [
      'Each entry in Light Scenes is a full look you can jump to instantly — like a cue on a traditional desk, but richer (color, motion, which fixtures, strobe, …).',
      'The colored energy strip on a scene is used later for automatic matching (e.g. calmer scenes vs peak scenes). You can sort or redistribute energy from the icons in this header.',
      'Click a scene to select it. Everything on the right edits that scene only.',
    ],
    tip: 'If you only have one default scene, that is normal for a new project — we will add another next.',
    target: TOUR_IDS.lightScenes,
    advance: { kind: 'next' },
    ensurePage: 'Modulation',
    whenAlreadyDone: (p) =>
      p.lightSceneCount > 1
        ? {
            title: 'You already have several light scenes',
            body: [
              `This project has ${p.lightSceneCount} light scenes. Click between them to see how looks differ.`,
              'Energy colors help auto scene matching — you can re-sort anytime.',
            ],
            tip: 'Continue when you have selected the scene you want to study.',
            nextLabel: 'Continue',
          }
        : null,
  },
  {
    id: 'add-scene',
    title: 'Create or duplicate a scene',
    body: [
      '+ adds a blank light scene. The copy icon duplicates the active scene — perfect when you like a look and want a louder or darker variant without starting over.',
      'Name scenes after moments (“Verse wash”, “Chorus hits”, “Speaker special”) so a nervous first show still makes sense at a glance.',
    ],
    tip: 'Try adding a scene now, or Continue if you will use the defaults.',
    target: TOUR_IDS.addScene,
    advance: { kind: 'next' },
    ensurePage: 'Modulation',
    allowContinue: true,
  },
  {
    id: 'modulators',
    title: 'LFO modulators = motion over time',
    body: [
      'Static color is nice; music wants movement. LFOs (low-frequency oscillators) are repeating shapes — sine pulses, square strobes, slow ramps — measured in beats.',
      'Add a modulator here, choose a shape and speed, then attach it to a parameter with the small modulation handle on that control (you will see those on sliders/pads once parameters exist).',
      'You can ignore modulators on day one and still run a solid manual show. Add them when you want “breathing” brightness, color sweeps, or timed chases.',
    ],
    tip: 'Start the show clock (we will visit transport soon) or LFOs will sit still.',
    target: TOUR_IDS.modulators,
    advance: { kind: 'next' },
    ensurePage: 'Modulation',
  },
  {
    id: 'splits',
    title: 'Splits = who this look applies to',
    body: [
      'A scene can have several splits. Each split has its own fixture groups and its own parameters.',
      'Example: Split A controls group “wash” with a soft blue. Split B controls group “spots” with a tight white. Same scene button, two jobs.',
      'Overlapping lighting splits combine with HTP (highest takes precedence) on intensity-style channels — so clean groups and non-overlapping windows keep looks predictable.',
      'Add Split creates another section. Most beginners start with one split that includes all groups, then refine.',
    ],
    tip: 'Check the group toggles on a split so you are not accidentally excluding every fixture.',
    target: TOUR_IDS.splits,
    advance: { kind: 'next' },
    ensurePage: 'Modulation',
    whenAlreadyDone: (p) =>
      p.splitCount > 1
        ? {
            title: 'This scene already uses multiple splits',
            body: [
              `The active scene has ${p.splitCount} splits — a good pattern for wash vs spots, or left vs right.`,
              'Confirm each split’s groups so fixtures are not double-owned unless you mean HTP blending.',
            ],
            tip: 'Continue to add or review parameters.',
            nextLabel: 'Continue',
          }
        : null,
  },
  {
    id: 'add-param',
    title: 'Add controls to a split',
    body: [
      'Click + on the split to open Add Params.',
      'Captivate does not clutter every scene with every possible control. You add only what this look needs — color, intensity, strobe, position windows, randomize, chase, mover axes, and more.',
    ],
    tip: 'Click the highlighted + .',
    target: TOUR_IDS.addParam,
    advance: {
      kind: 'or',
      of: [{ kind: 'click' }, { kind: 'hasBasicLookParams' }],
    },
    ensurePage: 'Modulation',
    skipWhen: (p) => p.hasBasicColorOrIntensity,
    allowContinue: true,
  },
  {
    id: 'add-param-menu',
    title: 'What should beginners add first?',
    body: [
      'HSB (Hue / Saturation / Brightness) — the friendliest color control for RGB lights. Start here for washes.',
      'Intensity — overall level for that split (especially useful with whites, dims, or non-RGB fixtures).',
      'Strobe — if your fixtures support it; keep it subtle until you know the room.',
      'Randomize — twinkling / sparkling across fixtures in the split.',
      'Chase — a sequential run of fixtures (great for strips and even stage rows).',
      'Position — an on-stage window so only fixtures in a region react (powerful once the map is placed).',
      'Add HSB or Intensity and this step continues when those controls exist. You can also Continue manually.',
    ],
    tip: 'Recommended first look: add HSB, set a color, raise Master, press Start.',
    target: TOUR_IDS.addParamPopup,
    advance: {
      kind: 'or',
      of: [{ kind: 'hasBasicLookParams' }, { kind: 'paramPresent', param: 'hue' }],
    },
    ensurePage: 'Modulation',
    suppressDim: true,
    skipWhen: (p) => p.hasBasicColorOrIntensity,
    allowContinue: true,
  },
  {
    id: 'params',
    title: 'Shape the look',
    body: [
      'These are the live controls for the active split. Drag pads and sliders — you should see the visualizer / fixtures respond if Master is up and output is connected.',
      'Modulation handles (when shown) let an LFO or audio source take over part of a value. Amount near zero = mostly manual; higher = more automatic motion.',
      'Randomize and Chase appear as little modules with envelope shapes and slot bars — one bar per fixture in the split. They are optional spice, not required for a first song.',
    ],
    tip: 'Remove a parameter you do not need with its remove control so the panel stays calm.',
    target: TOUR_IDS.params,
    advance: { kind: 'next' },
    ensurePage: 'Modulation',
    whenAlreadyDone: (p) =>
      p.hasBasicColorOrIntensity
        ? {
            title: 'You already have color or intensity on this scene',
            body: [
              'Drag the pads/sliders to taste. If nothing changes on hardware, check Master, Blackout, addresses, and Connections.',
              p.hasRandomizeOrChase
                ? 'Randomize/Chase are present too — slot bars show per-fixture levels.'
                : 'Optional next upgrade: Add Params → Randomize or Chase for motion across fixtures.',
            ],
            tip: 'Continue to Master and transport when the look feels right.',
            nextLabel: 'Continue',
          }
        : null,
  },
  {
    id: 'master',
    title: 'Master — the big volume knob for light',
    body: [
      'Master scales everything leaving Captivate. If Master is at the bottom, the room stays dark no matter how bright your scene is.',
      'Treat it like a PA master: park it somewhere safe, push for impact, pull back when you need headroom.',
      'It is MIDI-assignable — many people map it to a fader on a control surface.',
    ],
    tip: 'Nudge Master up now so you can see feedback while you experiment.',
    target: TOUR_IDS.master,
    advance: { kind: 'next' },
  },
  {
    id: 'blackout',
    title: 'Blackout — emergency off',
    body: [
      'Blackout forces all output dark immediately without destroying your programmed scenes. Click again to restore.',
      'Use it for safety, surprise moments, or “someone opened the door and I need dark now.”',
      'It is also MIDI-assignable — a dedicated blackout button on a surface is a good early mapping.',
    ],
    tip: 'Try toggling it once so you know the feel — then leave it off to continue.',
    target: TOUR_IDS.blackout,
    advance: { kind: 'next' },
  },
  {
    id: 'transport',
    title: 'Clock, tap tempo, and BPM',
    body: [
      'Start / Stop runs Captivate’s show clock. Beat-synced LFOs, chases, and many effects only move while the clock is running.',
      'Tap tempo: tap along with the music a few times to set BPM. Or type a BPM directly.',
      'If “nothing is pulsing,” check Start first, then BPM, then whether a modulator is actually attached to a parameter.',
    ],
    tip: 'Press Start before judging any time-based effect.',
    target: TOUR_IDS.transport,
    advance: { kind: 'next' },
    ensurePage: 'Modulation',
  },
  {
    id: 'save-load',
    title: 'Save your work',
    body: [
      'Save writes a project file (typically .cap) plus a paired fixture database. That pair is your show — looks and light definitions travel together.',
      'Load brings a project back. Prefer Save As when spinning off a festival variant so you do not overwrite last weekend’s file.',
      'Autosave can be enabled in Preferences (Ctrl+,). Still hit Save before you unplug and leave the venue.',
    ],
    tip: 'Save once after your first successful look — future-you will thank you.',
    target: TOUR_IDS.saveLoad,
    advance: { kind: 'next' },
    ensurePage: 'Modulation',
  },
  {
    id: 'done',
    title: 'You are ready to explore',
    body: [
      'You now know the loop: patch fixtures → group them → open Scenes → add parameters → raise Master → Start the clock → Save.',
      'Want a head start? Extras → Generate Scenes… builds a ladder of starter looks tailored to your rig (washes, chases, peaks). Review and tweak — it is a draft, not a finished show.',
      'Deeper reading: Help → Online Tutorials (wiki). Replay this guided tour anytime from Help → Interactive Tutorial.',
      'When something “doesn’t work,” check in order: fixture patched & addressed, group included on the split, parameter added, Master up, Blackout off, clock running, DMX output selected.',
    ],
    tip: 'Next mini-goal: one scene, HSB on a wash group, Master at 70%, clock running, color you like. That is a real first look.',
    advance: { kind: 'next' },
    nextLabel: 'Finish tour',
    closeConnections: true,
    whenAlreadyDone: (p) =>
      p.fixtureTypeCount > 0 &&
      p.patchedFixtureCount > 0 &&
      p.hasBasicColorOrIntensity
        ? {
            title: 'Strong start — you already have a usable look',
            body: [
              'This project has fixture types, patched lights, and color/intensity parameters. You are past the hardest blank-file hurdles.',
              'Polish groups, try Generate Scenes for a fuller ladder, and map Master/Blackout to MIDI when you can.',
              'Replay Help → Interactive Tutorial anytime for a refresher.',
            ],
            tip: 'Save before you walk away from the venue computer.',
            nextLabel: 'Finish tour',
          }
        : null,
  },
]
