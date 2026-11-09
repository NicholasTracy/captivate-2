# Color, gobo, and prism maps

Color Map, Gobo Map, and Prism Map channels store a wheel as DMX slots. A
scene picks a slot. The fixture-channel editor can also push one slot to the
wire while you tune the ranges.

The slot list is part of the fixture type (saved with the fixture library and
the project `.cfx`). The live preview is GUI state and is cleared on project
load. See [Project files and autosave](PROJECTS.md).

## Slot bands

Each entry has a **DMX Max** (0–255). That number is the top of the slot, not
the value Captivate sends.

Slots are sorted by DMX Max. The first slot starts at 0. Each later slot
starts at the previous max + 1 and ends at its own max. The value on the wire
is the midpoint of that band, rounded. If the band is empty (`min >= max`),
the output is that single max.

Example: max **10**, then max **30**.

| Slot | Band | Output |
|------|------|--------|
| max 10 | 0–10 | 5 |
| max 30 | 11–30 | 21 |

Editor row order is not DMX order. Two entries with the same max do not share
a band: after sorting, the later one collapses to a single step at
`previousMax + 1`.

Scene output uses the same midpoint (`getColorMapLookup` /
`getIndexedMapSlotOutputDmx`). The editor preview uses the same math
(`getColorMapSlotPreviewDmxValue`, `getWheelMapSlotPreviewDmxValue`).

## How a scene selects a slot

| Channel | Split param | When the param is missing |
|---------|-------------|---------------------------|
| Color Map | `colorWheel` (0–1), index `round(value * (slotCount - 1))` | Nearest hue / saturation. Saturation ≤ 0.02 prefers white slots when any exist. |
| Gobo Map | `gobo` (0–1), same index math | `defaultIndex` |
| Prism Map | `prism` (0–1), same index math | `defaultIndex` |

A finite `colorWheel` wins over hue and saturation. Hybrid color-wheel + HSB
scenes therefore must not leave `colorWheel` on an open/white slot if the
scene is supposed to follow hue.

Add **gobo** or **prism** to a split only when a patched fixture in that split
has a **top-level** Gobo Map or Prism Map channel. A map nested inside
**Split (Value Ranges)** does not unlock those add-menu options. Color Map
does walk inside splits: a nested color map still enables the color wheel for
fixtures in that split.

The Gobo slider’s labels come from the project fixture type with the most
**top-level** gobo slots, not from the split. The Prism slider walks split
leaves and uses the type with the most prism slots. The color wheel uses the
richest color map on fixtures that match the split.

## Live preview in the channel editor

Open the fixture’s channel list and edit a Color Map, Gobo Map, or Prism Map
(including one nested in a split). While that editor is mounted and at least
one patched fixture uses the type:

1. The editor stores `gui.colorMapCalibrationOverride`,
   `goboMapCalibrationOverride`, or `prismMapCalibrationOverride`:
   `{ fixtureTypeId, channelIndex, dmxValue }`.
2. `dmxValue` is the midpoint for the selected slot.
3. Every universe leaves the scene path. Channels sit on their defaults, then
   the preview is written.

| Control | What it changes |
|---------|-----------------|
| Color swatch | Which color slot is previewed. Not saved as a default. |
| Gobo / prism square | Which slot is previewed. Local only. |
| Gobo / prism circle | `defaultIndex` on the channel (the scene fallback). Also selects that slot for preview. |
| DMX Max / color max | The band edge. Preview updates to the new midpoint. |

Closing the channel editor clears that kind’s override. No patched fixture of
the type clears it as well, and scene output returns.

### What the preview frame contains

`calculateDmxForUniverse` treats any non-null map override as map-only mode
for **every** universe, not only the fixture type you are editing.

1. Every channel starts at `getDefaultDmxValue` (master at `min`, color /
   color map / strobe at 0, axis at the min–max midpoint, gobo / prism at the
   default slot, custom / focus / level at their default).
2. **Master** channels on the override’s fixture type are set to that
   channel’s `max`. Grand master and group intensity are not applied.
3. The edited channel, on every patched fixture of that type, is set to the
   preview byte. The match is the fixture-type channel object at
   `channelIndex`, so a map inside a split writes the **split** address.
   Split range min/max are not applied to that byte.
4. Mixer overwrites still replace bytes afterward. An overwrite of 0 is a
   forced 0.
5. Unpatched addresses are zeroed.
6. Blackout still zeros the frame in `finalizeDmxUniverses`.

If a color override and a gobo or prism override are both set, master-at-max
follows color, then gobo, then prism (`??`). Each override can still write its
own channel. One split editor that contains two color maps shares a single
color override; the later update wins.

This runs while the transport is playing. Mover axis-only calibration does
not run in the same frame: map-only mode replaces the scene path, and the
stopped axis-only path requires every map override to be null.

While the transport is **stopped**, the live flush does not call
`AtmosphericsOutputManager.apply`. While it is **playing**, that apply still
runs after `calculateDmx` and can raise fog / FX channels on top of the
preview frame.

The preview is not restored from a `.cap` file (`mergeProjectSave` and
`sanitizeGuiTransientState` set all three overrides to null). `fixState`
also drops an override whose `fixtureTypeId` is not in the loaded library,
and drops a payload that is missing a string id or finite channel index /
DMX value. A kept value is clamped to 0–255 and the channel index is rounded
to an integer ≥ 0.

## Who can drive the preview

The primary window publishes control state. These six set/clear actions are
local-only: detached windows do not forward them, and the LAN remote rejects
them. Editing the map from the main fixture list is what hits the DMX engine.

Color-map set/clear is published on the next microtask. Gobo and prism
set/clear use the normal control-state debounce (64 ms, then a frame). The
engine still treats a change to any of the three as live DMX
(`controlStateAffectsLiveDmxOutput`), including when transport is stopped.

## Pitfalls

- Leave the channel editor open and the rig is not running the active scene.
  Other fixture types drop to channel defaults for as long as the override
  is set.
- DMX Max is the top of the band. Expect the midpoint on the wire.
- A color map inside a split can preview a value outside that range’s min/max.
- Gobo and prism scene controls ignore maps that exist only inside a split.
- The Gobo slider does not use the split’s own gobo names when another fixture
  type has more top-level slots.
- Mixer faders and blackout still win over the preview byte.
- Group intensity does not scale the master that the preview forces to `max`.
- There is no WLED path for these overrides. Output is DMX universes only.

## Code paths

| Layer | Path |
|-------|------|
| Slot midpoint math | `src/shared/fixtureMapCalibration.ts` |
| Scene color / gobo / prism DMX | `src/shared/dmxUtil.ts` (`getDmxValue`) |
| Map-only universe frame | `src/main/engine/dmxEngine.ts` (`calculateDmxForUniverse`) |
| Stopped vs playing flush | `src/main/engine/engine.ts` (`applyLiveOutputFlush`, `recomputeFrozenTransportDmx`) |
| Editor preview | `src/renderer/dmx/ColorMapChannel.tsx`, `GoboMapChannel.tsx`, `PrismMapChannel.tsx` |
| Override state | `src/renderer/redux/guiSlice.ts` |
| Load / sanitize | `src/shared/fixState.ts`, `src/renderer/redux/store.ts` |
| Publish timing | `src/renderer/index.tsx` (`IMMEDIATE_DMX_PUBLISH_ACTION_TYPES`) |
| Remote reject list | `src/shared/remoteControl.ts` |
