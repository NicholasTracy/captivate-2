# Modulation matrix and LFO inter-modulation

Each light scene owns a list of modulators. A modulator is one LFO plus the
amounts that LFO applies to split parameters, and optional routes that bend
**other** LFOs.

Scene generation’s period “director” LFOs are one use of inter-modulation.
Recipes and depths used by the wizard: [Scene generation](scene-generation.md).

## Add a modulator

On the light-scene page, the **+** tile dispatches `addModulator`. A new
modulator is a **Ramp** with period **4** beats, empty split amounts, and no
inter-mod routes. Audio-band defaults on that LFO are threshold **0.02**, max
**0.6**, attack **0.35**, decay **0.55**, energy smoothing **0.78**.

The shape menu is Ramp, Sine, Square, Saw, Noise, Audio Band, Audio Energy.
Audio shapes hide the period control. The reset icon replaces that modulator
with a fresh default, **including its routes**. The close icon removes it and
renumbers inter-mod targets above it.

## Amount strips

Under each LFO, one strip is one split parameter (or one inter-mod target).
Drag sideways. The **+** under the strips opens Add Modulation.

Turning a row **On** writes amount **1**. **Off** deletes the key. Amount is
not “percent of travel” with 0 meaning off:

| Amount | Center anchor (default) |
|--------|-------------------------|
| **0.5** | No contribution |
| **1** | Up to **+0.5** at LFO high, **−0.5** at LFO low |
| **0** | The opposite sign |

Deltas from every modulator on that parameter are **added** to the manual
value, then clamped to 0–1. `moverMode` clamps to 0–2 instead.

Right-click a manual slider’s dot to set the anchor (`modManualAnchors` on
that split). A missing key is **center**.

| Anchor | Behavior |
|--------|----------|
| **Center** | Swing around the manual value, at most ±0.5 before clamp. |
| **Bottom** | Manual value is the floor. Amount above 0.5 pushes toward 1 as the LFO rises. Amount below 0.5 pulls toward 0 as the LFO falls. |
| **Top** | Manual value is the ceiling. Amount above 0.5 pulls toward 0 as the LFO rises. Amount below 0.5 pushes toward 1 as the LFO falls. |

Add Modulation only lists parameters that already exist on that split. These
are omitted even when present: `xMirror`, `moverSpread`, `moverMirrorX`,
`moverMirrorY`, `moverMode`.

Splits hidden in the UI are also omitted from the matrix: visual splits while
video is off, the Movers split when no mover is patched, and laser splits while
the laser window is closed or the split’s groups are not laser groups. The
stored amounts remain.

## Split shaping

The split header opens shaping for **that split only**. It runs after the LFO
(and after inter-mod), before amounts combine with the manual value.

| Control | Stored as | UI ticks | Engine |
|---------|-----------|----------|--------|
| Invert | `invertModulation: true` | on/off | `1 − value` |
| Phase offset | `phaseOffsetBeats` | −32, −16, −8, −4, −2, −1, −0.5, 0, 0.5, 1, 2, 4, 8, 16, 32 | Added to the beat clock for this split, including audio envelopes |
| Stair-step | `modulationStairSteps` | Off, or 2 / 4 / 8 / 16 / 32 | Quantize; values under 2 are smooth; cap **32** |

Zero phase and “smooth” are omitted from the save. Phase is applied **per
split** inside `effectiveLfosAtSplit`, so the same inter-mod route can differ
across splits that do not share a phase offset.

## LFO → LFO routes

Inter-mod keys are `intermod:lfo:{targetIndex}:{prop}` on
`modulator.lfoInterModulation`. They are not split parameters. A modulator
cannot target itself. Turning a route **On** stores amount **1**.

Depth uses the source LFO **before** split shaping:

```text
delta = (amount − 0.5) × (source − 0.5) × 2
```

Amount **0.5** is zero depth. Amount **0** or **1** reaches delta **±0.5**.

| Target prop | Effect of that delta |
|-------------|----------------------|
| `period` | Multiply period by `2^(delta × 2)`, then clamp to **0.125–64** beats. Full depth is one octave (×2 or ×½). |
| `audioBandLowHz` / `audioBandHighHz` | Slide across the band slider, then keep at least **20 Hz** between low and high. |
| `audioMax` | Add delta. Audio Band max is capped at **0.65**. Stays at least 0.01 above threshold. |
| Other listed props | Add delta and clamp 0–1. |

The Add Modulation list only offers props that match the **target’s current
shape**. A saved prop the shape no longer accepts is skipped.

| Target shape | Extra props besides wave controls |
|--------------|-----------------------------------|
| Sine | `sinePeakWidth` |
| Ramp | `rampCurve` |
| Square | `squareDuty` |
| Saw | `sawFlatten` |
| Noise | `noiseSeed`, `noiseSmoothing` |
| Audio Band | `skew`, band Hz, threshold, max, attack, decay, band smoothing. No period. |
| Audio Energy | `skew`, threshold, max, energy smoothing. No period. |

Wave controls are `period`, `phaseShift`, `flip`, and `skew`, except the audio
shapes above.

The period **buttons** only offer 0.25, 0.5, 1, 2, 4, 8, 16, 32. An inter-mod
period can sit between those (and as low as 0.125) until something snaps it
back to a button value.

Audio Band and Audio Energy output **0** while audio capture is off. Their
envelope state is per modulator and per split. Inter-mod **peeks** that
envelope; the split output sample is what advances it. Capture, meters, and
clock choice: [Audio input, beat clock, and music energy](audio-input-sync.md).

Square duty is not a full 0–100% gate: the wave is high for
`0.02 + duty × 0.96` of the cycle. Noise is 32 steps per cycle.

## What is saved

Modulators, amounts, anchors, and split shaping live in the **Light Scenes**
section of the project. Empty modulators are not removed during normal editing.
Scene generation calls `pruneUnusedModulators`, which drops a modulator that
drives no split param and has no inter-mod route in either direction.

The LAN remote renders this same page. `scenes/…` actions (including
`setModulation`) are allowed. Mixer faders are separate: [DMX mixer](dmx-mixer.md).

## Codepaths

| Role | Path |
|------|------|
| Matrix UI | `src/renderer/scenes/ModulationMatrix.tsx`, `ModulationSlider.tsx` |
| Shape, period, reset, delete | `src/renderer/scenes/LfoMenu.tsx`, `LfoPeriod.tsx` |
| Anchors | `src/renderer/controls/ManualSliderCursor.tsx` |
| Split shaping UI | `src/renderer/scenes/SplitModShapingModal.tsx` |
| Amount math, inter-mod, shaping | `src/shared/modulation.ts` (`getOutputParams`, `effectiveLfosAtSplit`) |
| Waveforms | `src/shared/oscillator.ts` |
| UI period grid | `src/shared/lfoPeriod.ts` |
| Redux | `scenes` slice in `src/renderer/redux/controlSlice.ts` |
| Engine sample | `getOutputParams` call in `src/main/engine/engine.ts` |

## Related

- [Scene generation](scene-generation.md) — period directors and look recipes
- [Audio input, beat clock, and music energy](audio-input-sync.md)
- [DMX output and movers](dmx-movers.md) — params the matrix does not drive
- [Remote control (LAN)](remote-control.md)
