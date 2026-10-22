# MIDI input, learn, out, and keyboard shortcuts

Captivate listens to enabled MIDI **input** ports for show control (pads,
faders, encoders) and, optionally, MIDI timing clock for master BPM. It can also
open MIDI **outputs** for CC parameter publish and MIDI clock out. Keyboard
shortcuts fire the same **button** actions. There is no MIDI Thru, Program
Change, pitch bend, or aftertouch path.

Hub overview: [Show control hub](show-control.md).

MIDI learn, MIDI out assign, and keyboard assignment are mutually exclusive:
turning one on clears the others.

## Connect MIDI ports

1. Open **Connections** (ethernet icon in the status bar).
2. Under **MIDI → Inputs**, click each input you want Captivate to open.
3. Under **MIDI → Outputs**, click each output for CC publish / clock out.
4. The status-bar **midi** dot is green when at least one in or out port is
   open.
5. Optional input: **Drive BPM from MIDI clock** follows `0xF8` (24 PPQ) and
   turns off audio beat clock **and** MIDI clock out (loop guard).
6. Optional output: **Send MIDI clock** emits `0xF8` at 24 PPQ from master BPM,
   plus `0xFA` / `0xFC` on play/stop edges. Disabled while clock-in is on.

The engine rescans ports every **1000 ms**. Clicking toggles
`device.connectable.midi` or `device.connectable.midiOut`.

## MIDI learn

1. Plug in a controller and enable its port (above). If nothing is connected,
   the piano icon opens Connections instead of learn mode.
2. Click the status-bar **piano** icon. Overlays turn green on mappable
   controls.
3. Click a control, then move a CC or press a note. The overlay shows the
   binding id (for example `0cc1` or `0note70`).
4. Click the piano icon again, or press **Esc**, to exit.

Detached page windows hide the main status bar. While mapping is on they show
an **Exit mapping** bar. The standalone Visualizer popout clears mapping mode
on open.

LAN remotes do not enter learn mode. They can still see MIDI connection status.

## Keyboard assignment

1. Click the status-bar **keyboard** icon → **Assign keys**.
2. Click a **button** overlay (green), then press a key or chord.
3. **View assigned keys** lists bindings; **Remove** unbinds one chord.
4. **Esc** or the keyboard icon exits assignment.

Keyboard bindings use `KeyboardEvent.code` (layout-stable, e.g. `KeyA`,
`Ctrl+Shift+Digit1`). Lone modifier presses are ignored while learning.
Shortcuts do not fire while typing in an input, textarea, select, or
content-editable field.

Keyboard shortcuts only run **button** actions. Sliders and XY pads cannot be
bound to keys.

## What you can map

### Buttons (note or CC)

| Action | UI | Runtime |
|--------|----|---------|
| `setActiveSceneIndex` | Scene tiles (light or visual) | Next **strict beat boundary**, not immediate |
| `toggleAutoScene` | Auto scene button | Toggles auto for that scene type |
| `tapTempo` | Status-bar TAP | Same as clicking TAP |
| `toggleBlackout` | Sidebar BLACKOUT | Toggles `gui.blackout` |
| `toggleMoverFollowOverride` | Movers follow override | Toggles follow override |
| `triggerAtmosFixture` | Atmospherics Trigger | Manual nonce for that fixture id |
| `setActivePage` | Sidebar page icons | Switches the main page |
| `firePerformancePad` | Performance page pads | Fires pad → active-scene route |

Button CCs fire on a **rising edge** through 64 (value ≥ 64). Note On always
fires, including velocity 0. Note Off does not fire a button; it only clears
the CC press latch.

### Sliders / pads (CC or note)

| Action | UI | Range |
|--------|----|-------|
| `setMaster` | Sidebar MASTER | 0..1 |
| `setBaseParam` | Split params, pads, gobo/prism/focus, HSV | 0..1, per split; **active scene only** |
| `setAutoSceneBombacity` | Auto energy slider | 0..1 |
| `setBpm` | Status-bar BPM | Learned 60..180 by default; clamp 1..1000 |
| `setPerformanceValue` | Performance page sliders | 0..1 → bank, then active-scene route |
| `setMoverFollowOverridePan` / `Tilt` | Movers follow override | 0..1 |

XY / HSV pads expose one slider zone per axis (top/bottom for two-axis pads).
Split index **0** keeps the legacy action id (`setBaseParam` + param key).
Other splits use `setBaseParam{splitIndex}:{paramKey}`.

For the **same CC** to drive **different** params per light scene, learn MIDI onto
a performance slider (`setPerformanceValue`), then assign a destination route on
each scene (Performance page).

The DMX mixer has no MIDI overlays.

## Slider options (shown on the overlay)

After a slider is learned, the overlay lets you edit min/max and mode:

| Source | Modes | Notes |
|--------|-------|-------|
| **CC** | `absolute` (default) or `relative` | Absolute maps 0..127 (or 0..255 if the raw value is > 127). Relative supports 7-bit two’s complement (64 = rest) and 8-bit signed (128 = rest). |
| **Note** | `hold` (default) or `toggle`; value `velocity` or `max` | Hold writes on Note On and restores min on Note Off. Toggle flips between min and the note value. |

Re-learning a CC always resets options to absolute. Re-learning the same note
on an existing note mapping is ignored so you can hold a pad without rewriting
options.

Legacy BPM mappings stored in 0..1 are migrated to 60..180 on load.

## Binding identity

- MIDI ids are `{channel}cc{number}` or `{channel}note{number}`. Channel is the
  MIDI channel nibble **0..15** (MIDI channel 1 → `0…`). Port name is **not**
  part of the id: the same CC on two enabled controllers is one control.
- One MIDI id maps to **one** action. Learning it on a new control unbinds the
  old one.
- Clearing the MIDI **X** on a button overlay also removes that action’s
  keyboard chord. Use the keyboard × / dialog Remove to clear only the key.

## MIDI out assign

MIDI **out** is configured manually on the orange overlays — you pick channel and
CC/note numbers. Captivate does **not** learn out mappings from MIDI input
(that would only make sense for MIDI in).

### Sliders → CC

`setMaster`, `setBaseParam`, `setBpm`, `setGroupIntensity`, `setAutoSceneBombacity`.

1. Enable at least one MIDI **output** in Connections.
2. Click the status-bar **upload** icon (orange overlays).
3. On a slider overlay, click **Assign CC**, then drag **ch** (1–16) and **cc**
   (0–127) to the values your external software expects.
4. Values are scaled 0..127 from the action’s default range and sent when they
   change. **X** clears the binding. Esc or the upload icon exits.

### Buttons → note

Stateful buttons publish note on/off on all enabled outputs:

`toggleBlackout`, `setActiveSceneIndex`, `setActivePage`, `toggleAutoScene`.

Same assign flow with **Assign note** → **ch** + **note**. Note On (vel 127)
when the state is active; Note Off when inactive.

Bindings persist as `device.midiOutActions`.

## MIDI clock vs mapped BPM

Mapped `setBpm` writes NodeLink tempo directly (subject to [Link role](show-control.md)).
**Drive BPM from MIDI clock** estimates BPM from `0xF8` on any enabled input,
clamps **45..220**, and goes stale after **450 ms** without ticks. MIDI Start
(`0xFA`) and Stop (`0xFC`) reset the clock estimator; they do **not** play or
pause Captivate transport when received as input.

**Send MIDI clock** (output) emits `0xF8` from Captivate BPM and `0xFA`/`0xFC`
on local play/stop. It cannot run while clock-in is enabled.

With MIDI clock or audio beat clock on, TAP does not write NodeLink tempo
(it can still hint the audio detector when Audio Mode is on). Link **follow**
role also blocks local `setTempo` from UI/MIDI/OSC/audio/MIDI-clock followers.

## Persistence

MIDI in/out port enables, clock flags, `buttonActions`, `sliderActions`,
`midiOutActions`, and `keyboardShortcuts` live on `control.device` and save with
**Serial Device Settings (MIDI & DMX)** in the `.cap` file. Uncheck that section
on load to keep the current mappings.

Learn-mode flags (`isEditing`, `keyboardLearnMode`, `midiOutLearnMode`,
`listening`) are on the same object and are **not** stripped on save. Exit
mapping before a manual save if you do not want overlays restored on the next
load.

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Piano icon does nothing useful | Status-bar **midi** is red. Enable a port in Connections and confirm the OS sees the device. |
| Learn never binds | You must click the overlay first (white border). Pitch bend, Program Change, and SysEx are ignored. |
| Wrong control moves | Same channel+CC on two devices share one id. Disable the extra port or use a different CC. |
| Encoder jumps | Switch the overlay from `absolute` to `relative`. |
| Scene pad feels late | Scene MIDI is quantized to the next beat. Other buttons are immediate. |
| Keyboard does nothing | Focus is in a text field; or you bound a slider (keys are buttons only). |
| MIDI clock BPM never locks | Enable **Drive BPM from MIDI clock**; the DAW must send `0xF8` on an **enabled** port. Wait for ~30 ticks. Out-of-range tempo (< 45 or > 220) is dropped. |
| Transport ignores MIDI Start/Stop | Expected. Only the clock estimator uses `0xFA` / `0xFC`. |
| Mixer faders ignore MIDI | Expected. Mixer has no MIDI overlays. |

## Runtime pipeline

```text
midi Input (enabled ports, poll 1 s)
  → 0xF8/FA/FC: handleMidiSystemRealtime (BPM estimator)
  → Note/CC: throttle 60 Hz per input id (leading + trailing)
  → handleMessage
       midi-out learn? setMidiOutAction, return
       learn? midiSetButtonAction / midiSetSliderAction, return
       else fire button (fireMidiButtonAction) and/or slider

midi Output (enabled ports, poll 1 s)
  → control bus publish (~30 Hz): CC for midiOutActions
  → MIDI clock out: 0xF8 @ 24 PPQ; 0xFA/0xFC on play/stop edges
```

Keyboard: capture-phase `keydown` → `fireMidiButtonAction` (buttons only). TAP
from a key sends the `TapTempo` user command so the engine owns tempo/phase.

## Codepaths

| Role | Path |
|------|------|
| Parse Note/CC; input ids | `src/shared/midi.ts` |
| Open input ports, poll, realtime bytes | `src/main/engine/midiConnection.ts` |
| Open output ports; sendMessage | `src/main/engine/midiOutputConnection.ts` |
| Control bus + CC/clock publish | `src/main/engine/controlBusPublish.ts` |
| Learn + playback | `src/main/engine/handleMidi.ts` |
| Clock estimator, 60 Hz throttle, TAP rules | `src/main/engine/engine.ts` |
| Action types, slider bounds, reducers | `src/renderer/redux/deviceState.ts` |
| Button side effects | `src/renderer/redux/fireMidiButtonAction.ts` |
| Overlays | `src/renderer/base/MidiOverlay.tsx`, `MidiOverlay_xy.tsx` |
| Piano / upload / Connections UI | `src/renderer/menu/StatusBar.tsx`, `src/renderer/overlays/Devices.tsx` |
| Keyboard learn + dispatch | `src/renderer/hooks/useKeyboardShortcuts.ts`, `src/renderer/input/keyboardChord.ts` |
| Load-time mapping normalize | `src/shared/fixState.ts` |

## Related

- [Show control hub](show-control.md)
- [OSC input and auto-publish](osc-mapping.md) — same action maps over UDP
- [Audio input, beat clock, and music energy](audio-input-sync.md) — MIDI clock vs audio beat clock vs Link
- [Project files and autosave](PROJECTS.md) — mappings travel with Serial Device Settings
- [Atmospherics](atmospherics.md) — `triggerAtmosFixture`
- [Remote control (LAN)](remote-control.md) — no learn UI on remotes
