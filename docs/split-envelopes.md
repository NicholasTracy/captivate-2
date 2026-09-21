# Split envelopes: randomizer, chase, and beat phase

Each lighting split can gate fixtures with two slot envelopes (**Randomizer**
and **Chase**) and shift its beat clock (**phase offset**). Mix amounts of 0
leave output unchanged; options alone do nothing until you add the mix
params.

## Add the modules

On the light-scene split, use **+** and add **Randomize** and/or **Chase**.
Newly added mix sliders start at **1** (full mix). Options (`triggerPeriod`,
`stepsOn`, …) already exist on every split; the modules only appear once the
mix param is present.

Envelope ADSR + bars live in `Randomizer` / `Chase`. Mix sliders are the
`randomize` and `chase` base params (MIDI-assignable like other split params).

## Shared slot bank

Randomizer and Chase share one ordered bank per split:

```text
DMX slots (group-filtered, one per fixture or subfixture)
  then LED fixtures (one slot per LED fixture; all pixels share it)
```

Order comes from **Chase `slotAxis`** (default horizontal), even if Chase mix
is 0:

| Axis | Order |
|------|--------|
| Horizontal (↔) | Left → right, then top → bottom (high Y is top of the pad) |
| Vertical (↕) | Top → bottom, then left → right |

Multi-cell DMX bars contribute **one slot per subfixture**. Residual shared-master
rows for those fixtures are skipped so they do not add an extra bar.

The split **intensity** param is a participation ceiling: DMX fixtures with
`fixture.intensity` **greater than** that value do not arm and are not gated
(envelope level treated as 1). LED slots always participate.

## Randomizer

On each `triggerPeriod` (beats), the engine picks a unique subset of eligible
slots and starts their attack.

| Control | Range (UI) | Role |
|---------|------------|------|
| Mix `randomize` | 0–1 | 0 = passthrough |
| Trigger density | 0–1 | 0 never fires; **> 0 always ≥ 1 slot**; 1 hits every eligible slot |
| Trigger period | 0.05–4 beats | Time between random picks |
| Envelope ratio | 0–1 | Attack fraction of duration |
| Envelope duration | 0.1–16 beats | Attack + release (engine min 0.05) |

## Chase

On each `stepPeriod`, a head advances through eligible slots and arms
`stepsOn` consecutive slots (wrap). Same attack/release envelope as
Randomizer.

| Control | Range (UI) | Role |
|---------|------------|------|
| Mix `chase` | 0–1 | 0 = passthrough |
| Direction | forward / reverse / bounce | Along the current slot axis |
| Slot axis | horizontal / vertical | Shared with Randomizer order |
| Steps on | 1–16 (engine max 64) | How many slots arm each step |
| Step period | 0.05–4 beats | Advance interval |

Chase **state** (head, bar levels) is realtime-only and is not saved. Chase
**options** save with Light Scenes.

## How envelopes mix

Both modules lerp toward `value × slotLevel`:

```text
afterRandom = lerp(value, value × randomizerLevel, randomizeAmount)
output      = lerp(afterRandom, afterRandom × chaseLevel, chaseAmount)
```

Randomize always runs first, then Chase.

They scale:

- Color / windowed emitters (`getWindowRandomizerLevel`)
- Fixture **master** dimmer when the partition uses a color wheel/map
  (`partitionBrightnessUsesMasterChannel`)
- WLED / LED RGB after HTP combine (`applyLedRandomizerToColors`)

They do **not** scale mover **axis** channels, strobe on/off pulses, or
atmospherics trigger/level channels.

## Split beat phase (and invert / stairs)

The split **tune** icon (modulation modifiers) stores `splitModShaping`:

| Field | UI | Runtime |
|-------|----|---------|
| Invert modulation | Switch | `lfoVal → 1 − lfoVal` |
| Phase offset (beats) | Snapped ticks **−32 … +32** | `beats + phaseOffsetBeats` (positive is later) |
| Quantize | Off, or 2 / 4 / 8 / 16 / 32 levels | Stair-step LFO after invert; max **32** |

Phase offset is the same clock for:

- Split LFO / inter-mod sampling (`effectiveLfosAtSplit`)
- Randomizer and Chase period edges (`beatsWithPhaseOffset` in the engine tick)
- DMX strobe timing sampled with `splitBeatTime`

Invert and stairs shape the LFO driver **after** synthesis, before the
modulation matrix. They do not invert envelope bars.

Empty shaping is omitted from the save (`normSplitShapingForStore`).

## Operator pitfalls

- **Amount 0 = off.** Generated scenes that only set options will not chase
  until `baseParams.chase` / `randomize` is > 0.
- **Adding Chase/Randomize jumps to full mix** (`initParams` default 1).
- **Slot axis lives on Chase.** There is no separate Randomizer axis control.
- **HTP still applies** across splits. Overlapping splits will wash out a
  one-hot chase unless groups/windows partition fixtures. Scene generation
  documents that pattern.
- **Phase uses floor division** for period edges, so a negative offset still
  crosses boundaries in the correct direction (`isNewPeriod`).
- **LAN remote** has no envelope editors; mix params that already exist on
  the scene can still move if the remote modulation UI exposes them.

## Codepaths

| Role | Path |
|------|------|
| Options + chase step | `src/shared/chase.ts` |
| Random picks + lerp | `src/shared/randomizer.ts` |
| Slot order | `src/shared/slotOrder.ts` |
| Mapped bank / LED apply | `src/shared/splitRandomizer.ts` |
| Envelope in DMX math | `src/shared/dmxUtil.ts` (`applyEnvelopeGates`) |
| Phase helper | `src/shared/TimeState.ts` (`beatsWithPhaseOffset`) |
| LFO invert / stairs / phase | `src/shared/modulation.ts` |
| Engine tick (resize + update) | `src/main/engine/engine.ts` |
| DMX apply | `src/main/engine/dmxEngine.ts` |
| Modules UI | `src/renderer/controls/Randomizer.tsx`, `Chase.tsx` |
| Phase UI | `src/renderer/scenes/SplitModShapingModal.tsx` |

## Related

- [Scene generation](scene-generation.md) — chase showcases and HTP partitioning
- [MIDI and keyboard mapping](midi-mapping.md) — `setBaseParam` for mix sliders
- [Audio input, beat clock, and music energy](audio-input-sync.md) — master beat clock
- [Group intensity](group-intensity.md) — overall group ceilings (separate from envelopes)
