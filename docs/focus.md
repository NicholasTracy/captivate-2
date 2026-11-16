# Focus channels

How a fixture **Focus** channel becomes a split slider, and what actually
lands on the DMX address.

Focus is the fixture channel type `focus`. One split stores a single `focus`
value from 0 to 1. When that split is allowed to write the channel, every
Focus channel on a fixture in the split uses that value with its own Min,
Max, and Default.

## Architecture

```text
Split baseParams.focus (0..1)
  → modulators (only if the base value exists)
  → getDmxValue: lerp(Min, Max, focus)
  → universe starts at Default, then highest byte wins (HTP)
  → mixer overwrite replaces the byte
  → blackout / unpatched zero
```

| Layer | Path |
|-------|------|
| Channel shape and new-channel defaults | `src/shared/dmxFixtures.ts` (`ChannelFocus`, `initChannelFocus`) |
| Fixture editor fields | `src/renderer/dmx/FocusChannel.tsx` |
| Split slider and add-menu | `src/renderer/controls/FocusControl.tsx`, `ParamAddButton.tsx` |
| Movers split seeding | `src/renderer/sync/AutoManagedSplitSync.tsx` |
| Scene byte | `src/shared/dmxUtil.ts` (`getDmxValue`, `getDefaultDmxValue`) |
| Who is allowed to write, HTP, mixer | `src/main/engine/dmxEngine.ts` |
| Byte rounding | `normalizeDmxUniverseChannels` in `src/shared/dmxFixtures.ts` |
| Load migration | `migrateLegacyFocusChannel` in `src/shared/fixState.ts` |
| OFL / QLC import | `src/shared/oflFixtureImport.ts`, `src/shared/qlcFixtureImport.ts` |
| Modulation | `getOutputParams` in `src/shared/modulation.ts` |

## Authoring a channel

New Focus channels start at:

| Field | Default |
|-------|---------|
| Min | 0 |
| Max | 255 |
| Default | 0 |

The editor stores the three bytes independently. It does not sort Min and
Max, and it does not pull Default into that span. A higher slider always
moves toward **Max**, even when Max is the smaller number.

Example, Min 0, Max 255:

| Slider | Scene math | On the wire if Default is 0 |
|--------|------------|------------------------------|
| 0 | 0 | 0 |
| 0.5 | 127.5 | **128** (the universe buffer rounds) |
| 1 | 255 | 255 |

The same channel with Default **128** stays at 128 for every slider position
whose scene math is below 128. Each universe address starts at that
channel's Default. Scene splits then keep the higher byte. A slider cannot
push the address below Default. On a patched address, a mixer overwrite
replaces the byte after that max, including a value below Default.
Unpatched addresses are forced to 0 after the mixer. Blackout zeros the
universe, Focus included.

Master, group intensity, brightness, randomizer, chase, and the XY window
are not part of the Focus formula. Dimming a split does not park focus.

Every Focus channel on one fixture shares the split's `focus` param and
keeps its own Min, Max, and Default.

### Split ranges

A Focus channel nested inside a split range still counts. The add menu walks
leaf channels, so that fixture unlocks **Focus** for a scene split that
includes it.

The address is still one byte. Each range is evaluated, clamped into its
min/max, and the range with the highest activity wins. Activity is how far
the clamped byte sits between that range's ends. A tie keeps the earlier
range.

Example: range 1 is 0–9 and outputs 0 (activity 0); range 2 is 10–255 and
holds Focus. Slider 0 clamps to 10 (activity 0) and loses the tie, so the
address stays on range 1. Slider 1 outputs 255 (activity 1) and takes the
address.

### Import

Open Fixture Library and QLC+ imports do not copy the personality's focus
range. Both create Min 0, Max 255, Default 0.

| Source | Becomes Focus immediately |
|--------|---------------------------|
| OFL | Capability type `focus`, or the channel name contains `focus` |
| QLC+ | Preset name contains `BeamFocus` |

OFL checks focus before shutter and wheel slots, and only pan/tilt use the
fine-channel shortcut. A channel named `Focus Fine` is still a full-range
Focus channel.

A QLC channel that is not a `BeamFocus` preset stays custom, even when its
name contains `focus`. Those imported custom channels are not controllable,
so the scene slider does not drive them yet. The next project load rewrites
a custom channel whose name contains `focus` into a Focus channel and keeps
that custom Min, Max, and Default. Choosing Focus from the channel type menu
instead creates a new channel at Min 0, Max 255, Default 0.

## Scene slider

The Focus slider is a normal split param (`scenes/setBaseParams`). MIDI learn
on the slider is `setBaseParam` for that split index. The LAN remote modulation
page renders the same split controls, and `scenes/` actions are allowed.
Changing the slider publishes with the 64 ms control debounce.

**Add → Focus** sets the param to **0**. It is offered only when a fixture
matched by that split has a Focus leaf.

Modulators move `focus` only when the split already has a base value. A
modulation route on a split with no `focus` key does not create one. Amount
**0.5** is no change. On the center anchor, amount 1 swings about ±0.5
around the slider, then the result is clamped to 0..1.

### The slider can be visible and still not move DMX

A split writes Focus only when its **base** params already contain a lighting
control. Checked keys:

`hue`, `saturation`, `brightness`, `white`, `warmWhite`, `amber`, `uv`,
`x`, `y`, `width`, `height`, `z`, `depth`, `intensity`, `strobe`,
`randomize`, `visStageMapMix`

`focus` itself is not one of those keys. Mover params (`xAxis`, `yAxis`,
spread, mirror, mode) are not either. A modulator that only adds `hue` on
the output does not unlock the write; the key has to be stored on the split.

While any mover is patched, Captivate keeps a **Movers** split and fills any
missing default, including `focus: 0.5` (and pan, tilt, spread, mirror, mode,
and `prism: 0`). Removing the Focus slider puts `0.5` back. That split shows
the slider whenever **any** fixture type in the project has a Focus channel,
not only the movers in the group. Until the Movers split also has one of the
lighting keys above, those slider moves are not written. The address stays
at Default.

A scene split that already stores one of the lighting keys above does write
Focus as soon as the param exists. If several of those splits match the
same fixture, the highest Focus byte wins.

Scene splits are also skipped while a color, gobo, or prism map preview is
open, and while transport is stopped with a mover calibration override
active (Advanced on). Focus stays at Default until that mode ends. Mixer
overwrites still apply. Playing transport leaves the calibration path and
runs scenes again.

## 3D preview

The fixture model editor hides **Default Beam Angle** on mover spot and mover
wash types when it finds a Focus channel, or a custom channel whose name
contains `focus`. Live Lighting 3D does not draw beam cones, so that hidden
angle is not the picture on the Lighting 3D page. Focus still goes out as
DMX.

## Related

- [DMX output and movers](dmx-movers.md)
- [MIDI and keyboard mapping](midi-mapping.md)
- [Remote control](remote-control.md)
