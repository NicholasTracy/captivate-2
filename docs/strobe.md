# Strobe channels and color blanking

One split slider, `strobe`, drives two DMX behaviors. A fixture channel whose
type is `strobe` flips between two stored bytes (the shutter / strobe macro).
Direct `color` channels can also be blanked on and off in time with the same
slider. The two paths use different thresholds and different clocks.

## Architecture

```text
Split base param strobe (0–1) + mask buttons
  → output params (base + modulation), beats + split phase offset
  → strobe channel: Solid byte or Strobe byte from beat phase
  → color channel: normal color, or 0, from the DMX output frame clock
  → HTP with other splits → mixer overwrite → blackout
```

| Piece | Path |
|-------|------|
| Channel defaults | `src/shared/dmxFixtures.ts` (`ChannelStrobe`, `initChannelStrobe`) |
| Pulse math | `src/shared/dmxUtil.ts` (`isStrobePulseOpen`, `isSyntheticStrobePulseOpen`, `getDmxValue`) |
| Frame rate for color blanking | `src/main/engine/dmxEngine.ts` (`getSyntheticStrobeFrameRateHz`), `src/shared/dmxOutputRate.ts` |
| Split phase | `beatsWithPhaseOffset` in `src/shared/TimeState.ts`, applied in `calculateDmxForUniverse` |
| Slider and masks | `src/renderer/controls/StrobeControl.tsx`, `ParamAddButton.tsx` |
| QLC+ import | `src/shared/qlcFixtureImport.ts` |
| Open Fixture Library import | `src/shared/oflFixtureImport.ts` |

## Add the slider

**Add Params** lists the entry as `strobe` (the param id is the label). Choosing
it stores `strobe: 0` from `initParams`. The row is a normal parameter slider
with a MIDI overlay, plus five mask buttons: **RGB**, **W**, **WW**, **A**,
**UV**. Each button writes `0` or `1`.

`strobe` is one of `LIGHTING_CONTROL_PARAM_KEYS`. The write gate reads
**base** params. On a split that has none of those keys yet, adding `strobe`
starts master, color, and strobe writes for every fixture that split matches.
Color then uses the hue, saturation, and brightness already stored on the
split, or `0.5` when those keys are absent. Amount `0` keeps the shutter on
**Solid** and keeps color blanking open. A modulator aimed at `strobe` does
not open this gate by itself.

The LAN remote renders the same split row. `scenes/setBaseParams` is allowed
from the remote. That action publishes with the 64 ms control-state debounce,
then one frame.

Load fills any missing mask with `1`. The engine treats a missing mask as `1`
as well (`getParam`). A button with no stored value draws as on. A mask is
active when its value is above `0.5`.

| Mask | Gates |
|------|--------|
| Any of the five above `0.5` | The dedicated `strobe` channel may leave Solid |
| All five at or below `0.5` | The dedicated channel stays on Solid, at any slider amount |
| The color's own mask above `0.5` | That `color` channel may drop to `0` |
| That color's mask at or below `0.5` | That `color` channel keeps its normal level |

The color's mask comes from `inferColorKind`. A stored `kind` of `warmWhite`,
`amber`, or `uv` selects **WW**, **A**, or **UV**. With no kind, saturation
below `0.02` selects **W**, and every other color channel selects **RGB**.
The fixture editor's hue / saturation fields rewrite `kind` with that same
rule, so those fields leave only white or RGB.

## Shutter channel

`initChannelStrobe` sets **Solid** to `0` and **Strobe** to `255`. The channel
editor shows both numbers (`Solid` and `Strobe`). The type menu label is
**Strobe**. Picking that type replaces the row with a fresh channel (Solid `0`,
Strobe `255`). When the next row is still an untouched Master (`min` 0, `max`
255, on/off off), that next row is replaced with another strobe channel.

| Slider amount | Byte sent |
|---------------|-----------|
| At or below `0.001` | Solid |
| Above `0.001`, and at least one mask above `0.5`, pulse-open half | Strobe |
| Same, pulse-closed half | Solid |

Pulse-open is Captivate's half of the cycle (`phase < 0.5`). It sends the
**Strobe** byte. On a fast-to-slow import that byte is `0` and Solid is `255`,
so the pulse-open half is the low byte.

The beat clock is the split's beats plus `splitModShaping.phaseOffsetBeats`.

```text
pulsesPerBeat = lerp(0.5, 24, amount)
phase = fractional(beats * pulsesPerBeat)
open when phase < 0.5
```

Duty is one half. At 120 BPM, amount `1` is 24 pulses per beat, which is 48
pulses per second. Amount `0.5` is 12.25 pulses per beat. This phase is not
quantized to the DMX frame rate, so a rate above the output rate aliases on
the wire.

Master, group intensity, brightness, randomizer, chase, and the spatial window
leave this byte unchanged. The universe prefill, before any split writes, is
`0` (`DMX_DEFAULT_VALUE`), which can differ from Solid.

### Import

In-app QLC+ import (`parseQlcFixtureDefinition`):

| Preset | Solid | Strobe |
|--------|-------|--------|
| `ShutterStrobeSlowFast` | 0 | 255 |
| `ShutterStrobeFastSlow` | 255 | 0 |

Any other shutter preset becomes a `custom` channel. The offline parser in
`tools/qlc_fixture_parser/qlc_channel.ts` uses the same two presets.

Open Fixture Library import returns `initChannelStrobe` (Solid `0`, Strobe
`255`) when a capability type is `shutterstrobe`, or when the channel name
contains `strobe` or `shutter`. That check runs after pan/tilt, after
intensity / dimmer / `master`, and after focus. A channel that already matched
one of those is imported as that earlier type. OFL import does not swap Solid
and Strobe for a fast-to-slow range.

A strobe leaf nested in a `split` still returns Solid or Strobe. The split
then clamps that byte into the leaf's range and keeps the range whose value
sits furthest through its span. Solid `0` inside a range that starts at 10 is
sent as 10.

## Color blanking

Direct `color` channels use a second clock, quantized to whole DMX frames.
`colorMap`, gobo, prism, focus, master, and axis channels stay on their own
formulas.

Color blanking is off while `strobe` is at or below `0.02`
(`SYNTHETIC_STROBE_OFF_THRESHOLD`). From just above `0.02` to `1`, the rate
runs from `0.5` Hz up to half the DMX compute rate, then rounds to a whole
number of frames on and the same number off.

```text
maxRate = max(0.5 Hz, outputFrameRate / 2)
desired = lerp(0.5 Hz, maxRate, (amount - 0.02) / 0.98)
halfCycleFrames = max(1, round(outputFrameRate / (desired * 2)))
```

The frame index is `floor(beats * 60 / bpm * outputFrameRate)`, using the same
phase-shifted beats as the shutter. The pulse-open half writes the normal
color level (master, group intensity, brightness, window, randomizer, and
chase). The pulse-closed half writes `0` before those scales.

The frame rate is `getConfiguredDmxOutputRateHz`:

| Connection state | Rate used for blanking |
|------------------|------------------------|
| Open DMX refresh, default | 30 Hz (UI can set this; the floor in the rate helper is 1 Hz) |
| Any id in `connectable.dmx` | at least 40 Hz |
| `connectable.artNet[0]` non-empty | at least 44 Hz |

The highest of those applies. Per-universe Art-Net IP fields do not change
this rate. At 30 Hz and amount `1`, the cap is 15 Hz: one frame on, one frame
off. At 44 Hz the cap is 22 Hz.

Amounts from just above `0.001` through `0.02` pulse the shutter channel and
leave color channels steadily lit.

## Highest value wins

Strobe and color are non-axis writes, so each address keeps the higher byte
after every matching split. A `0` from one split leaves a `255` from another
split in place.

| Personality | What a second split does |
|-------------|--------------------------|
| Solid `0`, Strobe `255` | The address is `255` whenever any matching split is on its pulse-open half. A split sitting at amount `0` writes `0` and leaves the pulsing split in charge. |
| Solid `255`, Strobe `0` (QLC fast-to-slow) | A split at amount `0` writes `255` on every frame and holds the address there. The Strobe byte `0` is visible only on a frame where every matching split writes `0`. |

A mixer overwrite on that address replaces the scene byte. **Blackout** then
zeros the universe. While a color, gobo, or prism map preview is active, the
scene pass is skipped, so neither strobe path runs.

## Other outputs

| Output | Clock |
|--------|-------|
| WLED pixels and PWM | `getLedValues` builds color from hue, saturation, brightness, the window, and master. The `strobe` param is unread. |
| Built-in visualizer effect named Strobe | Layer effect amount mixed with beat pulse and music energy (`BuiltinVisualizer`). Separate from the fixture param. |
| `LightSync` countdown | Implemented in `src/visualizer/threejs/util/animations.ts` and `LightSync.ts`. `EffectManager` has no callers, so this countdown is not on the live visualizer path. |

## Scene generation

**High-energy strobe** in Extras → Generate Scenes… is available when a
patched fixture type has a `strobe` leaf, including a leaf inside a split.
`analyzeRigProfile` also looks for a channel type named `strobeRgb`; no
channel type has that name, so RGB-only fixtures leave the toggle unavailable
("No strobe channels found") even though the slider can still blank their
color channels.

When that capability is active (the rig has a strobe leaf and the toggle is
on), Peak Drive stores `strobe: 0.38` and Strobe Gate stores `strobe: 0.48`.
See [Scene generation](scene-generation.md).
