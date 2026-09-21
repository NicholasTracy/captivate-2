# Scene generation

Extras menu wizard that builds a rig-tailored set of light scenes (beat, audio,
spatial, mover showcases). Visual scenes are never modified. By default scenes
are **appended** to whatever light scenes already exist; replace is opt-in.

## Intent

Use this to bootstrap or expand a show-ready light-scene ladder for the current
fixture layout instead of hand-building every scene. Generation is seeded and
pseudo-random within recipe bands, customized via `analyzeRigProfile`.

## Usage

1. Patch fixtures and assign groups / window positions as needed.
2. Choose **Extras → Generate Scenes…**.
3. Walk the wizard:
   - **Rig** — summary of fixtures, groups, movers, strobe, gobo/prism flags
   - **How many** — scene count + calm ↔ peak energy bias
   - **Look & feel** — beat / audio / spatial / mover / peak-strobe toggles
   - **Generate** — Append (default) or Replace; optional seed
4. Confirm. A status toast reports how many scenes were added or replaced.

Cancel leaves the project unchanged.

## Architecture

```text
Extras → "Generate Scenes…"
  → send_main_command({ type: 'generate-scenes' })
  → IPC main_command
  → focused renderer window
  → runGenerateScenesFromMenu()
       setSceneGenerationWizardOpen(true)
  → SceneGenerationWizard
       analyzeRigProfile → generateLightScenesForRig(options)
       mergeGeneratedLightScenes(existing, generated, { mode })
       dispatch resetLightScenes(merged)
```

| Layer | Path |
|-------|------|
| Menu | `src/main/menu.ts` (`Extras` → `Generate Scenes…`) |
| IPC command | `generate-scenes` on `main_command` |
| Renderer handler | `src/renderer/index.tsx` |
| Menu glue | `src/renderer/sceneGeneration/runGenerateScenesFromMenu.ts` |
| Wizard UI | `src/renderer/sceneGeneration/SceneGenerationWizard.tsx` |
| Generator API | `src/shared/sceneGeneration/generateLightScenes.ts` |
| Options / capabilities | `src/shared/sceneGeneration/sceneGenerationOptions.ts` |
| Append / replace | `src/shared/sceneGeneration/mergeGeneratedLightScenes.ts` |
| Recipes / ladder | `src/shared/sceneGeneration/generateLightScenesInternals.ts` |
| Rig analysis | `src/shared/sceneGeneration/rigProfile.ts` |
| Docs | this file |

## Options framework

`GenerateLightScenesOptions` supports:

| Option | Role |
|--------|------|
| `seed` | Deterministic RNG |
| `sceneCount` | Target scene count (4–48); omit for full ladder |
| `epicnessBias` | 0 calm … 1 peak sampling when count &lt; full ladder |
| `look` | Beat / audio / spatial / mover / strobe toggles |
| `look.enhancements` | Opt-in flags for **future** recipes |
| `preserveAuto` | Keep project auto-scene settings |

### Capabilities (extension points)

Recipes should gate features through `resolveSceneGenerationCapabilities` /
`capabilityActive`, not ad-hoc booleans. Each capability has:

- `available` — rig + wizard prefs allow it
- `implemented` — recipe code actually uses it today

| Capability | Implemented today | Notes |
|------------|-------------------|--------|
| movers / strobe / spatial / beat / audio | yes | Look toggles |
| moverKinematics | **no** | Scaffold for group kinematics-aware aiming |
| moverAiming | **no** | Scaffold for bounds / Spot Wizard awareness |
| gobo / prism / colorMap | **partial** | Detected on rig; colorMap follows hue/sat (do not stamp open/white `colorWheel`) |
| atmosphere / led | **no** | Separate runtime paths today |

When adding kinematics or gobo/prism recipes later: flip `implemented: true` on
the capability and teach recipes to call `capabilityActive(...)`.

## What is replaced / preserved

| State | Behavior |
|-------|----------|
| Light scenes | Append (default) or full replace via wizard mode |
| Visual scenes | Untouched |
| Auto-scene settings | Preserved from the current project |
| Per-scene `autoEnabled` | Set `true` on every generated scene |
| Active scene | Kept on append; first id after epicness sort on replace |
| Scene ids / names | New `nanoid()` ids; descriptive recipe titles (flavor prefix only on collisions) |

## Generated content

Without a scene-count override, generation builds a **deterministic** epicness
ladder (~31 core recipes — seed only jitters palette within look families, not
which recipe runs), plus chase showcases when spatial is on, plus up to 6 mover
showcases when movers + look.moverShowcases are on. With a count, the ladder is
subsampled (bias-weighted) and a fraction of the budget is reserved for chase
and mover showcases.

### Cue-list philosophy

Looks are built like a console programmer’s song file — **one job per cue**, a
tight color family, and few competing drivers:

| Band | Role | Examples |
|------|------|----------|
| Open | Static / slow-breathe washes | Cool / Warm / Dim Stage Wash, Ambient Glow |
| Groove | One rhythmic driver, fixed color | On-Beat / Offbeat / Half-Time, Kick–Vocal accents |
| Build / motion | Energy or position-pad motion | Energy Swell, Build Ramp, Traveling Bar, Sweep, Iris |
| Peak | Controlled intensity, not stacked chaos | Spark (randomize armed), Strobe Gate, Peak / Open Peak |

Color uses **look families** (cool, warm, magenta, …) with ~±3% hue variance —
not ±22% random walks. Dual zones use analogous partners (~+0.1 hue). Strip
chases keep **one solid color**; timing differs across strips, not hue soup.

Modulator stacks stay short: typically one brightness/beat driver, optional slow
color or position LFO. Peak looks no longer stack noise + stairs + chase +
randomize + five LFOs.

Scene titles always come from the recipe that built them (default-save catalog
ids stay stable; names follow the recipe).

### How lighting splits actually combine

Captivate merges overlapping lighting splits with **HTP** (highest channel value
wins), not “later split overrides earlier.” Axis/mover channels are last-write.
Generated multi-split looks therefore **partition** fixtures (smart groups or
non-overlapping windows) so each fixture is owned by roughly one strip — that is
what makes chases read cleanly under HTP.

### Chase / motion showcases

When **Different areas of the stage** is enabled, generation includes chase and
motion scenes:

| Scene title | What it does |
|-------------|----------------|
| Strip Chase L→R | One-hot square pulse across column strips (exclusive under HTP) |
| Pulse Chase R→L | Dark-field brightness-only pulse (no hue thrash) |
| Strip Cascade Top→Bottom | Row strips, top → bottom |
| Pulse Rise Bottom→Top | Dark-field rise, bottom → top |
| Mirror Chase Outward | Center-out mirrored stagger |
| Split Chase Opposing Halves | Left half forward / right half reverse |
| Traveling Bar / Position Sweep / Expanding Iris / Soft Position Drift | **Single-split** looks with LFOs linked to the **position pad** (`x` / `y` / `width` / `height`) |

Strip chases use low-duty square LFOs + staggered `phaseOffsetBeats`, tight zones
(`positionFeather: 0`), and group filters when smart groupings exist. Period is
locked to `strips × 1 beat` so the step timing matches the strip count.

Spark / peak recipes also arm the **Randomizer** and **Chase** envelope modules
(`baseParams.randomize` / `chase` > 0) so slot envelopes actually mix — options
alone are inert at amount 0. Operator controls: [Split envelopes](split-envelopes.md).

Full-stage splits use the virtual **All** group (same as a new manual split).

### Speeds

| Driver | Typical period |
|--------|----------------|
| Position pad motion | 16 beats (full-stage travel) |
| Hue / color | ≥8 beats (16 preferred); beat-locked strobe brightness stays intentional |
| Mover pan/tilt | 8–32 beats by epicness (never faster than 8 except beat-tilt) |

### Scene speed (LFO inter-modulation)

LFO rate is `period` (beats). Generated scenes either keep a **constant** period
or add a slow **director** LFO whose `lfoInterModulation` routes
`intermod:lfo:{target}:period` onto the look drivers.

| Mode | Typical recipes | Director |
|------|-----------------|----------|
| Constant | Beat / offbeat / half-time gates, strip chases, strobe spark | No period intermod (beat grid stays locked) |
| Breathe (Sin, ~16 bars) | Calm wash, ambient/mist, traveling bar, sweep, iris, spectrum | Gentle ±period (~12–25%) |
| Ramp (accelerate/reset) | Build Ramp, Energy Swell hue | Mild Ramp-shaped period director |

Period directors never target LFOs with period &lt; 8 beats (or audio LFOs), and
never use Square for period (stepped octave jumps). Full intermod depth
(`amount = 1` = ±1 octave) is **not** used by generation — depths stay near 0.5.

## Rig profiling

`analyzeRigProfile` reads the patched universe + fixture types:

| Detected | Affects generation today? |
|----------|---------------------------|
| Fixture count / window anchors | Zones, wig-wag, spectrum, chase strips (fallback) |
| Movers | Showcases + mover awareness |
| Strobe | Peak-drive strobe param |
| Usable groups (≥2, non-reserved) | Dual-zone / group splits |
| Smart group families (prefix / even-odd / quadrants / strips) | Preferred chase + multi-split recipes with group filters |
| Atmosphere | Summary only |
| Gobo / prism / color maps | Detected; reserved for later recipes |

Reserved group names: `Movers`, `Atmosphere`, `Visualizer`, `All`, `LEDs`,
`Pixels`.

Use **Fixture Mapping → Smart groupings…** before generating scenes so chase /
dual-zone / spectrum recipes can target real group membership.

## Undo and focus

- Undo targets the `control` history when the active page is **Modulation** or
  **Video**. Switch there before undoing a generate.
- The `generate-scenes` command runs only when the renderer document has focus.

## Developer: default save

Shipping defaults still use the full ladder + fixed seed (unchanged catalog
counts):

```bash
npm run generate:default-save
```
