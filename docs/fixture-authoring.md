# Fixture types, segments, and universe patch

A **fixture type** is the channel map for one product (a PAR, a wash bar, a
mover). A **patched fixture** is one of those types sitting at a DMX start
address on a universe, with a stage window and scene groups. **Subfixtures**
(segments) split that one address block into separate cells so a bar can have
per-pixel color, groups, and randomizer slots without a second start address.

LED / WLED fixtures are a different list. See [WLED fixtures](wled-fixtures.md).
Sharing a finished type is covered in
[Community fixture library](CAPTIVATE-FIXTURE-LIBRARY.md). Live output after
the patch is covered in [DMX output and movers](dmx-movers.md).

## Architecture

```text
Fixture type (channels + subfixtures)
  → patched fixture (universe, start channel, window, groups)
  → flatten_fixture (one row per segment, plus leftover channels)
  → scene groups / spatial window / randomizer slot
  → DMX byte at (start + channel index)
```

| Piece | Path |
|-------|------|
| Types, footprint, labels | `src/shared/dmxFixtures.ts` |
| Flatten, defaults, group match | `src/shared/dmxUtil.ts` |
| Randomizer / chase slots | `src/shared/splitRandomizer.ts` |
| Creation wizard + segment suggestion | `src/shared/fixtureWizardHelpers.ts`, `src/renderer/dmx/CustomFixtureCreationWizard.tsx` |
| Channel editor | `src/renderer/dmx/FixtureChannels.tsx`, `FixtureChannelPopup.tsx` |
| Segment editor | `src/renderer/dmx/Subfixtures.tsx` |
| Patch strip | `src/renderer/dmx/MyUniverse.tsx`, `UniverseSlot.tsx` |
| Reducers | `src/renderer/redux/dmxSlice.ts` (`addFixture`, `assignChannelToSubFixture`, `duplicateSubFixture`) |
| Universe frame | `src/main/engine/dmxEngine.ts` (`calculateDmxForUniverse`) |

## Create a fixture type

**Fixtures → Add → Create New** opens a four-step wizard: Basics, Channels,
Segments, Review. Opening the wizard inserts a draft type immediately
(`initFixtureTypeForCreation`: name `New Fixture`, template **Dimmer + RGB**).
**Discard** deletes that draft. **Save** keeps it. The optional “open 3D model
wizard” checkbox is stored in `localStorage`
(`captivate.fixtureWizard.openModelAfterCreate`). Live DMX does not require a
model; the model is preview layout.

Channel templates replace the whole channel list **and clear segments**:

| Template | Channels |
|----------|----------|
| Dimmer only | Master |
| RGB | Red, Green, Blue |
| Dimmer + RGB | Master, Red, Green, Blue |
| Dimmer + RGBW | Master, Red, Green, Blue, White |
| Dimmer + Pan + Tilt | Master, Pan, Tilt |

On the Segments step, if the type has **no segments yet**, at least **two** RGB
triplets, and a color-channel count divisible by 3, Captivate offers to build
one segment per triplet (`suggestSubfixtureSegments`). Every **Master** row is
copied onto **each** segment. Names are `Pixel N` up to 12 pixels, then
`Zone N`. Dismissing the offer leaves the channels unassigned.

**Add → Import From File**, **Search For Fixture Online**, **Load DB**, and
**Save DB** are the other ways types enter the project. Project save also
writes the sibling `.cfx` (see [Project files and autosave](PROJECTS.md)).

## Channel map

Each row in `channels` is **one DMX slot**. The patched start address is
1-based `fixture.ch`. Row `i` (0-based) drives address `ch + i`.

| Type | Role |
|------|------|
| `master` | Dimmer. Default output is `min`. An untouched Master is `min` 0, `max` 255, `isOnOff` false. Output is global master × split brightness. It does not follow the spatial window. Randomizer and chase scale it only when that same flattened row also contains a color map. `isOnOff` snaps at 0.5. |
| `color` | Direct color channel (RGB, white, warm white, amber, UV). |
| `colorMap` / `goboMap` / `prismMap` / `focus` | Wheel or focus slot. |
| `strobe` | Strobe vs solid defaults. |
| `axis` | Pan (`dir: 'x'`) or tilt (`dir: 'y'`). `isFine: true` is a **separate row**, not a second byte packed into the coarse row. A mover type is coarse pan **and** coarse tilt. |
| `fxtrTrigger` / `fxtrLevel` | Atmospherics on/off and level. See [Atmospherics](atmospherics.md). |
| `custom` | Named extra. The Channels **+** button appends this (`initFixtureChannel('custom')`). |
| `split` | Still **one** address. Each range computes its nested channel and clamps into that range. The range whose value sits furthest through its span is sent. A tie keeps the earlier range. |

Changing a row’s type can rewrite the **next** row, and only that row, when the
next row is still an untouched Master (`min` 0, `max` 255, `isOnOff` false).
The rewrite follows the type you picked (next auto color, another split, or the
same type). A Master you have narrowed or marked on/off is left alone. Earlier
rows are not rewritten.

### Editing while the type is patched

`isInUse` is true when any patched fixture’s `type` is this id.

| Action | While patched |
|--------|----------------|
| Add channel, remove channel, delete the type | Hidden or disabled in the editor |
| Change a row’s type, ranges, or min/max | Still allowed; output updates immediately |
| Add, assign, duplicate, or remove segments | Still allowed |

`removeFixtureChannel` splices the array and **does not renumber** segment
indexes. Delete channel 0 and a segment that pointed at index 2 now points at
whatever slid into index 2, or at an index past the new end. Do that editing
before the type is patched, then re-check the colored markers.

## Segments (subfixtures)

A segment stores **indexes into the parent channel list**, a name, optional
groups, an optional intensity, and an optional `relative_window`.

Labels are `a`…`z`, then `aa`, `ab` (`subFixtureLabel`). Older files used `{`,
`|`, and the characters after `z` for index 26+. Load rewrites those group
names and segment names (`migrateLegacySubFixtureGroupLabelsOnFixtureType`).

**+** creates a segment and assigns **every channel index that no segment owns
yet**. The first segment on a fresh type therefore takes the whole map. The
next **+** gets only what is left, often an empty list.

The colored marker on a channel row:

- With a segment selected, click to move that index onto it (exclusive).
- Click again to clear it.
- With nothing selected, click an assigned marker to select that segment.

Assignment removes the index from every other segment first. The segment
**suggestion** is the exception: it lists each Master index on every pixel on
purpose.

**Duplicate** tries to shift the source indexes forward by the source’s channel
count when those indexes exist and are not owned by a different segment. When
that shift does not fit, it **appends copies of the source channel rows** and
points the new segment at them. That grows `channels.length` even while the
type is patched, so every patched copy of the type gets a longer footprint.

Channels that no segment lists stay on one **residual** row: the parent
fixture’s window and groups, no segment index. Randomizer and chase bars skip
that residual when the fixture has any segment. Scene output still writes those
leftover addresses.

Flatten order for one fixture is segment order, then the residual row. Color
rows are split again by emitter family, which adds groups `Emitters RGB`,
`Emitters Cool White`, `Emitters Warm White`, `Emitters Amber`, or
`Emitters UV` when those colors are present. Family partitions of one segment
share one randomizer / chase slot.

### What segment intensity does

The slider stores 0–1. An unset segment intensity uses the type’s `intensity`
(0 on types created in the app). That number is a **ceiling test**, not a DMX
multiplier: this row’s randomizer and chase levels are the slot’s levels only
when `intensity <=` the split’s intensity parameter. When the test fails, those
levels stay at 1 (the gates do not run). Color channels consume the levels
together with the spatial window. A Master row ignores them unless a color map
is on that same row. Intensity 0 passes every non-negative ceiling, so the
gates apply.

### Groups and windows

Scene matching for a segment row uses the patched fixture’s groups **plus**
that segment’s groups **plus** any emitter-family group. These names also
match without being stored on the fixture:

| Split group | Matches |
|-------------|---------|
| `All` | Every flattened row |
| The fixture type’s name | Rows of that type |
| `Movers` | Rows with pan/tilt (or mover calibration / bounds) |
| `Atmosphere` | `fxtrTrigger` / `fxtrLevel`. A `custom` row also matches when `isControllable` is true and the name contains volume, fan, fog, haze, or a similar token (not pan, tilt, speed, gobo, prism, zoom, or focus). |
| `Visualizer` | No DMX fixture |

On project load, if a patched fixture’s group list is empty and the type has
groups, those type groups are copied onto the fixture. After that, **Groups…**
on the placement map edits the fixture, not the type.

A segment’s `relative_window` is mapped into the parent fixture window. When
it is missing, emitter layout can fill a window from the segment centroid.
New patches start at center stage: X/Y position 0.5 with width 0, Z position 1
with width 0. Width 0 gives that axis no extent, so a moving window hits the
fixture only when the window reaches the point.

**Smart groupings…** only rewrites group names from placement (quadrants,
even/odd, axis strips). It does not move start addresses.

## Patch a universe

The right-hand **Patching** strip is the active universe. The Universe field’s
spinner stops at the connection **Universe Count**, but the stored value is
clamped to **1–16**. A fixture with no universe loads as universe 1.

Click a gap, pick a start channel inside that gap, then pick a type. The type
is offered only when `channels.length` fits from that start to the end of the
gap. An empty library and a gap that is too narrow show different messages.
`addFixture` also ignores a type with zero channels. The list is sorted by
universe, then start channel.

The strip’s width for a fixture is `channels.length` (at least 1). The output
footprint (`fixtureDmxFootprintChannelCount`) is the larger of that length and
one past the highest segment index. They match while every index is inside the
channel list. A stale index past the end makes the engine reserve extra
addresses that the strip does not draw as part of the fixture, so the next gap
can be placed on top of them.

Lowering **Universe Count** in Connections clamps USB assignments and Art-Net
routes. It does not move or delete patched fixtures. Output buffers still
cover universe `1` through `max(Universe Count, highest patched universe)`.

Addresses at or beyond 512 are not written. After scene math and mixer
overwrites, any address outside every footprint on that universe is forced to
0, including a mixer fader sitting on an empty address.

### When two fixtures share an address

The gap dialog will not place a new fixture on top of an existing span. Overlap
still happens when a patched type **grows** (segment duplicate appending
channels), when a stale segment index extends the footprint, or when a loaded
project already overlaps.

On a shared address:

| Write | Rule |
|-------|------|
| Axis (pan/tilt) | Last write wins. Order is patched fixtures by start channel, then that fixture’s segments, then its residual row. |
| Every other channel | Highest value wins (HTP) during the scene pass. |
| Defaults, before scenes | Last write, not HTP. Master defaults to `min`, axis to the midpoint, color / strobe / color-map to 0. |
| Same parent index on two segments | Both rows compute it, then non-axis keeps the higher byte. A plain Master ignores the spatial window, so two pixels that share it usually write the same dimmer. The values diverge when the segments’ groups pick different group-intensity ceilings, or when a color map on that row lets randomizer / chase scale the dimmer. |

## Example: two-pixel bar

Channels, in order: Master, R, G, B, R, G, B. That is 7 slots. The segment
suggestion builds:

| Segment | Indexes | Addresses if the fixture starts at 1 |
|---------|---------|--------------------------------------|
| Pixel 1 | 0, 1, 2, 3 | 1 (Master), 2–4 |
| Pixel 2 | 0, 4, 5, 6 | 1 (Master), 5–7 |

Two randomizer bars, one per pixel. Family split puts the Master on its own row
and the RGB channels on another, so each pixel’s color still follows that
pixel’s window. Both pixels write address 1; with no color map on the Master
row those two dimmer values match, and the shared dimmer does not chase the
spatial window. The next fixture on that universe must start at channel **8**
if it is placed from the gap after this one. Duplicating Pixel 2 when the
shifted indexes do not fit appends more rows and can run this footprint into
whatever is already patched at channel 8.
