# DMX mixer

Live faders for one DMX universe. The page shows what the engine last sent.
Dragging a channel stores a manual override that replaces that address on every
later frame until you reset it.

## Usage

1. Open **DMX Out** (mixer page, or the **DMX mixer** tab on a LAN remote).
2. Step **Universe** with the arrows. The range is the connection universe count
   (still capped at 16).
3. Leave **All channels** off to list only addresses covered by fixtures patched
   on that universe. Turn it on to show all 512 slots.
4. Drag a fader to override. The channel cursor turns light blue while an
   override is stored.
5. **Reset** clears every override on the **active universe** only.

There is no per-channel clear and no MIDI or keyboard overlay on these faders.
The LAN remote uses the same actions; on a phone the fader is a drag handle.

## Where an override sits in the frame

```text
scenes (HTP for non-axis, exact write for axis)
  → mixer replace (this page)
  → zero unpatched addresses
  → atmospherics (HTP max on fog / FX channels, playing ticks only)
  → blackout zeros the universe, then unpatched addresses are zeroed again
```

| Step | What it does to a mixer value |
|------|-------------------------------|
| Mixer | `channels[i] = override × 255`, then rounded into 0–255. Replaces the scene, including pan/tilt. Ignores Master and group intensity. |
| Unpatched zero | Any address outside a patched fixture footprint is forced to 0, even if you dragged it with **All channels** on. |
| Atmospherics | `Math.max` with the fog/FX write. Atmos can raise a channel above the fader. It cannot pull a fader down. |
| Blackout | The whole universe becomes 0. Blackout wins over the mixer. |

Overrides are 0–1 in state. `0` is a real override (channel forced off), not
“no override”. Only a missing slot is ignored.

Transport **Stop** still applies mixer, Master, and blackout. That stopped
rebuild does **not** run the atmospherics pass, so a fader move while stopped
can drop fog/FX levels that were sitting in the last playing frame until Play
runs another DMX tick.

The on-screen cursor is the engine’s output byte, not a second copy of the
fader. After blackout, an unpatched zero, or an atmos raise, the cursor can
disagree with the stored override. The override is still in state.

## Save / load

Mixer state is the **DMX Mixer State** section of the `.cap` file
(`mixer.overwritesByUniverse`, plus the active universe and the All-channels
flag).

In memory, untouched slots are holes. `JSON.stringify` writes those holes as
`null`. On load, `null` is not the same as “no override”, and the engine treats
it as override `0`.

Example: override only channel 10, save, and reload. Channels 1–9 come back as
forced 0, and channel 10 keeps its level. **Reset** that universe after load if
fixtures that you never touched are dark.

`pageIndex` and `channelsPerPage` are still saved (default page size 512). The
current mixer view does not show page buttons; it wraps the visible channels.

## Codepaths

| Role | Path |
|------|------|
| Faders, universe arrows, Reset, All channels | `src/renderer/pages/Mixer.tsx` |
| Override state | `src/renderer/redux/mixerSlice.ts` |
| Apply + unpatched zero | `calculateDmxForUniverse` in `src/main/engine/dmxEngine.ts`, `zeroUnpatchedDmxChannels` in `src/shared/dmxFixtures.ts` |
| Stopped vs playing rebuild | `applyLiveOutputFlush`, `recomputeFrozenTransportDmx` in `src/main/engine/engine.ts` |
| Atmos after the mixer | `src/main/engine/AtmosphericsOutputManager.ts` (`writeChannelMax`) |
| Blackout | `finalizeDmxUniverses` in `src/main/engine/dmxEngine.ts` |
| Live cursor | `src/renderer/dmx/dmxMixerOutputBus.ts` |
| Remote allowlist | `SHARED_MIXER_ACTION_TYPES` in `src/shared/remoteControl.ts` |
| Project section | `src/shared/save.ts`, `src/renderer/project/projectFileWriter.ts` |

## Related

- [DMX output and movers](dmx-movers.md)
- [Atmospherics](atmospherics.md)
- [Project files and autosave](PROJECTS.md)
- [Remote control (LAN)](remote-control.md)
