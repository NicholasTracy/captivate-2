# OSC input and auto-publish

Captivate speaks **Open Sound Control** over UDP in both directions:

- **Listen** — map OSC addresses to the same button/slider actions as MIDI
- **Send** — auto-publish the live `/captivate/…` control-bus namespace

There is no per-control OSC learn for output; send always publishes the full
namespace (change-detected). Overview: [Show control hub](show-control.md).

MIDI learn and keyboard assignment remain mutually exclusive with each other.
While input learn mode is on, either MIDI or OSC can bind a selected control.

## Enable OSC

1. Open **Connections** (ethernet icon in the status bar).
2. Under **OSC**:
   - **Listen for OSC** — bind the listen UDP port (default **9000**).
   - **Send OSC** — auto-publish to host/port (defaults **127.0.0.1:9001**).
3. Captivate listens on `0.0.0.0` (all interfaces). Send uses an unbound UDP
   socket to the configured host.
4. The status-bar **osc** dot is green when listening and/or actively sending,
   amber when enabled but not ready / erroring, and red when both are off.

Settings (`oscEnabled`, `oscPort`, `oscSendEnabled`, `oscSendHost`,
`oscSendPort`) live on `control.device.connectionSettings` and save with
**Serial Device Settings (MIDI & DMX)** in the `.cap` file.

### Loop guard

If listen is enabled and the send host is localhost (`127.0.0.1`, `localhost`,
`::1`, …) and **send port === listen port**, Captivate **does not send** and
surfaces an error in Connections / OSC status. Use a different send port
(default 9001) or a non-local host.

## Learn an OSC address (input)

1. Enable OSC listen and/or a MIDI port — the piano icon needs at least one.
2. Click the status-bar **piano** icon (MIDI / OSC learn).
3. Click a control overlay, then send an OSC message to that address.
4. The overlay shows the binding id (the OSC address, e.g. `/captivate/master`).
5. Click the piano icon again, or press **Esc**, to exit.

## What you can map (input)

Same actions as MIDI: scenes, auto, TAP, blackout, atmos trigger, page,
master, base params, BPM, group intensity, etc. See
[MIDI mapping](midi-mapping.md).

### Buttons

Fire on a **rising edge** when the first numeric argument is ≥ **0.5** (or True /
Impulse / bang with no numeric args). Dropping below 0.5 clears the latch.

### Sliders

The first numeric argument maps into the slider min..max:

- Values in **0..1** are used directly.
- Values in **(1..127]** scale by 127 (MIDI CC style).
- Values in **(1..255]** scale by 255.

Learned OSC sliders use absolute CC-style options by default. Relative mode is
available on the overlay if you need delta-style senders.

## Binding identity (input)

- OSC ids are the **address string** (must start with `/`).
- Port is not part of the id.
- One input id maps to one action (shared namespace with MIDI ids — addresses
  starting with `/` do not collide with `0cc1` / `0note70`).

## Auto-publish namespace (output)

When **Send OSC** is on, each publish tick (~30 Hz) sends **changed** addresses
(ε ≈ 1e-4). Critical time addresses also heartbeat every **1 s** even if
unchanged.

| Address | Type | Meaning |
|---------|------|---------|
| `/captivate/time/bpm` | f | Master BPM. **OSC clock** for this release |
| `/captivate/time/beats` | f | Beat counter. **OSC clock** |
| `/captivate/time/phase` | f | Phase in beat (0..1-ish Link phase). **OSC clock** |
| `/captivate/time/playing` | i | 1 playing / 0 stopped. **OSC clock** |
| `/captivate/master` | f | Master intensity 0..1 |
| `/captivate/blackout` | i | 1 blackout / 0 normal |
| `/captivate/scene/light` | i | Active light scene index |
| `/captivate/group/{name}/intensity` | f | Group intensity (name sanitized) |
| `/captivate/split/{i}/param/{key}` | f | Post-modulation param |
| `/captivate/modulator/{i}/value` | f | Modulator LFO value (split 0) |
| `/captivate/audio/energy` | f | Audio energy 0..1 |
| `/captivate/audio/level` | f | Input level 0..1 |
| `/captivate/audio/beat` | i | 1 on beat detect |
| `/captivate/audio/bpm` | f | Detected audio BPM (0 if none) |

Group names are sanitized for OSC path segments (spaces → `_`, unsafe chars
stripped).

### OSC clock

`/captivate/time/bpm`, `/captivate/time/beats`, `/captivate/time/phase`, and
`/captivate/time/playing` are the OSC clock for this release. They are published
on the auto bus beside **MIDI clock out** (`0xFA` start, `0xFC` stop, `0xF8`
at 24 PPQ). There is no separate tick address.

### Performance control OSC out

A performance pad or slider can also send its own address (enabled flag + path
starting with `/`). When OSC send is on and the send-to-self loop guard is not
blocking, the engine publishes that control's 0..1 value (pads as 0 or 1) in
addition to the `/captivate/…` bus. Invalid or empty addresses are not sent.

## Runtime pipeline

```text
Input:
  UDP datagram → decodeOscPacket (messages + bundles)
    → throttle 60 Hz per address
    → handleOscMessage
         learn? midiSetButtonAction / midiSetSliderAction, return
         else fire button and/or slider (same Redux paths as MIDI)

Output:
  runRealtimeLoopTick → control bus snapshot (~30 Hz)
    → change-detect + heartbeat
    → encodeOscMessage → UDP sendTo(host, port)
```

## Codepaths

| Role | Path |
|------|------|
| Encode/decode; normalize value | `src/shared/osc.ts` |
| Snapshot helpers | `src/shared/controlBus.ts` |
| UDP listen / send / status | `src/main/engine/oscConnection.ts` |
| Publish tick | `src/main/engine/controlBusPublish.ts` |
| Learn + playback | `src/main/engine/handleOsc.ts` |
| Engine wiring | `src/main/engine/engine.ts` |
| Connections UI | `src/renderer/overlays/Devices.tsx` |
| Status | `src/renderer/menu/ConnectionStatus.tsx`, `StatusBar.tsx` |

## Related

- [Show control hub](show-control.md)
- [MIDI input, learn, out, and keyboard shortcuts](midi-mapping.md)
- [Project files and autosave](PROJECTS.md)
