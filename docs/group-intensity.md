# Group intensity

Per named fixture-group **brightness ceilings** that sit under the global
Master fader. Use **GRP** in the left sidebar to pull a zone down without
changing scene parameters or Master.

Missing groups are full (1). Fixtures that belong to several reduced groups use
the **lowest** assigned ceiling.

## Usage

1. Assign groups on Universe / fixture types (and LED fixture group names).
2. Click **GRP** (above Master). The button shows a dot while any ceiling is
   below 100%.
3. Drag a group slider, or map MIDI (green overlay in learn mode).
4. **Reset all to 100%** clears every ceiling.

The picker lists named groups in use (including LED names and split-referenced
names). The virtual **All** group is never listed. When movers are patched, a
virtual **Movers** row appears.

## Architecture

```text
Master (0–1)
  × min(group ceilings that apply to the fixture)
  → effectiveMasterForFixture
  → DMX color / master channels and WLED LED output
```

A ceiling applies when:

| Source | When it matches |
|--------|-----------------|
| Fixture `groups[]` | Exact name, or case-insensitive alias |
| Fixture type name | Same lookup (DMX path only) |
| Virtual `Movers` | DMX fixtures that have pan/tilt / calibration / bounds |

WLED LED fixtures use fixture `groups[]` only (no virtual `Movers`, no type-name
fallback).

## Constraints

| Constraint | Value |
|------------|--------|
| Range | 0–1, shown as 0–100% |
| Default / missing key | 1 (full) |
| Sparse store | Values ≥ **0.999** are omitted (treated as full) |
| MIDI action | `setGroupIntensity` + group name (slider, 0–1) |
| MIDI action id | `setGroupIntensity{lowercase group}` — `Wash` and `wash` collide |
| Keyboard | Not bindable (`setGroupIntensity` is not a button action) |

MIDI learn: open **GRP**, then bind each slider. Bindings live with Serial
Device Settings. See [MIDI and keyboard mapping](midi-mapping.md).

## Persistence

Ceilings live on `control.groupIntensity` at runtime and are written into the
project **App UI Settings** (`gui.groupIntensity`) section of the `.cap` file —
not Light Scenes.

- Load with **App UI Settings** checked to restore ceilings.
- Uncheck that section to keep the in-memory map.
- Old saves without the field leave the current map unchanged.

Master is a separate control-state field (always loaded with the project
control snapshot, not this GUI profile).

## What it does not do

- It does not change split `brightness` or mixer overrides.
- It does not gate mover pan/tilt (axis channels use their own path).
- Blackout still zeros the universe after this scale.
- The LAN remote has no GRP control. Host-side MIDI and the sidebar still
  apply; remotes see the resulting output.

## Operator pitfalls

- **Several groups → darkest wins.** A fixture in both `Wash` at 40% and
  `Front` at 80% outputs at 40% × Master.
- **Type-name keys** can surprise you: a DMX fixture whose type is `Wash` also
  picks up a `Wash` ceiling even if that string is not in `groups[]`.
- **WLED vs movers.** Pulling the virtual **Movers** slider does not dim WLED
  fixtures unless they are actually grouped `Movers`.
- **No groups yet.** The popover stays empty until Universe / LED fixtures have
  names other than All.

## Codepaths

| Role | Path |
|------|------|
| Map normalize / lookup / min | `src/shared/groupIntensity.ts` |
| Sidebar + MIDI overlays | `src/renderer/controls/GroupIntensityButton.tsx` |
| Redux | `src/renderer/redux/controlSlice.ts` (`setGroupIntensity`) |
| MIDI playback | `src/main/engine/handleMidi.ts` |
| DMX emit | `src/main/engine/dmxEngine.ts` (`effectiveMasterForFixture`) |
| WLED emit | `src/main/engine/wled/wled_manager.ts` |
| `.cap` GUI profile | `src/renderer/project/projectFileWriter.ts` |
| Load merge | `src/renderer/redux/store.ts` |

## Related

- [DMX output and movers](dmx-movers.md)
- [WLED fixtures](wled-fixtures.md)
- [MIDI and keyboard mapping](midi-mapping.md)
- [Project files and autosave](PROJECTS.md)
