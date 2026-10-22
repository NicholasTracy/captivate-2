# Show control hub (MIDI, OSC, Link)

Captivate can act as a **bidirectional show-control hub**: follow external
controllers and clocks, and publish live transport / mixer / modulation state
out to other software over MIDI and OSC. Ableton Link role policy controls who
authors tempo in a shared session.

## Pieces

| Path | Direction | Docs |
|------|-----------|------|
| MIDI learn (CC/note → actions) | In | [midi-mapping.md](midi-mapping.md) |
| MIDI CC out + MIDI clock out | Out | [midi-mapping.md](midi-mapping.md) |
| OSC learn (address → actions) | In | [osc-mapping.md](osc-mapping.md) |
| OSC auto-publish `/captivate/…` | Out | [osc-mapping.md](osc-mapping.md) |
| Ableton Link + tempo role | Sync | This page |
| LAN remote UI | In/out | [remote-control.md](remote-control.md) |

Settings live on `control.device` / `connectionSettings` and save with
**Serial Device Settings (MIDI & DMX)** in the `.cap` file.

## Control bus

The engine builds a ~30 Hz snapshot after each realtime tick:

- Time: BPM, beats, phase, playing
- Master, blackout, active light scene index
- Group intensities
- Per-split post-modulation params
- Modulator LFO values (read after envelopes advance, without double-advance)
- Audio energy / level / beat / detected BPM

OSC send and MIDI CC out both consume this snapshot. Continuous floats are
change-detected (ε ≈ 1e-4); critical time addresses also heartbeat once per
second.

Code: `src/shared/controlBus.ts`, `src/main/engine/controlBusPublish.ts`.

## Ableton Link roles

When Link is on (Connections → Ableton Link), choose a **Link role**:

| Role | Tempo authorship |
|------|------------------|
| **Full** (default) | Captivate follows peer tempo and may push local tempo (UI, MIDI, OSC, tap, audio/MIDI clock followers). Current behavior. |
| **Leader** | Captivate owns tempo. Local sources call `setTempo`; the engine also re-asserts Captivate’s authoritative BPM so peers cannot steal tempo. Beats/phase still come from the Link session. |
| **Follow** | Only the Link session tempo drives BPM. Captivate UI / MIDI / OSC / audio beat clock / MIDI clock **do not** call `setTempo`. You can still enable Link and start/stop sync. |

Start/stop sync remains the separate **Start/stop sync** toggle; role mainly
affects **tempo authorship**.

## Loop guards

- **OSC:** If listen is on and send host is localhost and send port equals the
  listen port, send is blocked and Connections shows an error.
- **MIDI clock:** Clock out cannot run while **Drive BPM from MIDI clock** is
  on (and vice versa when enabling out). Prevents feedback when a port loops
  back.

## Status bar

- **Piano** — MIDI / OSC input learn (green overlays)
- **Upload** — MIDI out assign (orange overlays; set channel + CC/note manually)
- **osc / midi / link** dots reflect listen+send and in+out where applicable

## Performance bank

The **Performance** page (sidebar) holds a snap-grid of pads and sliders. MIDI/OSC
can learn directly onto a performance control (`setPerformanceValue` /
`firePerformancePad`). Each **light scene** stores a **list** of destinations for
a control (master, base param, group intensity, bombacity, and so on). Moving a
slider writes every continuous destination on the **active** scene only. Firing
a pad runs every button destination on the active scene only. Inactive scenes
keep their own lists and are not written. Older saves that stored a single
destination object are wrapped into a one-element list on load.

Pads also publish **MIDI note out** when a note is assigned in upload mode
(note on while the pad value is high, note off when it returns to 0). Sliders
still publish MIDI CC via `setPerformanceValue`.

A control can additionally send its **own OSC address** (inspector: OSC out
enabled + a path starting with `/`). That value (sliders 0..1, pads 0 or 1) is
published on the same OSC send socket as the auto bus, and only when OSC send
is on and the send-to-self loop guard is not blocking. The `/captivate/…` bus
is unchanged.

Modulation-matrix depth sliders assign MIDI CC out with `setModulationAmount`
(active scene, `splitModulations` or `lfoInterModulation`).

Direct `setBaseParam` MIDI still writes the **active scene only**. To use the
same CC for **different** params per scene, bind MIDI → a performance control,
then add a different destination on each light scene.

## OSC clock

The OSC clock for this release is the existing `/captivate/time` namespace,
published with the rest of the auto bus:

| Address | Meaning |
|---------|---------|
| `/captivate/time/bpm` | Master BPM |
| `/captivate/time/beats` | Beat counter |
| `/captivate/time/phase` | Phase in the beat |
| `/captivate/time/playing` | 1 playing / 0 stopped |

These sit beside **MIDI clock out** (`0xFA` start, `0xFC` stop, `0xF8` at 24 PPQ).
There is no discrete OSC tick protocol.

## Related

- [MIDI input, learn, out, and keyboard shortcuts](midi-mapping.md)
- [OSC input and auto-publish](osc-mapping.md)
- [Audio input, beat clock, and music energy](audio-input-sync.md)
- [Remote control (LAN)](remote-control.md)
