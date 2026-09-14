# MIDI input, learn, and keyboard shortcuts

Captivate listens to enabled MIDI **input** ports for show control (pads,
faders, encoders) and, optionally, MIDI timing clock for master BPM. Keyboard
shortcuts fire the same **button** actions. There is no MIDI output, MIDI Thru,
Program Change, pitch bend, or aftertouch path.

MIDI learn and keyboard assignment are mutually exclusive: turning one on
clears the other.

## Connect a MIDI port

1. Open **Connections** (ethernet icon in the status bar).
2. Under **MIDI**, click each input you want Captivate to open.
3. The status-bar **midi** dot is green when at least one enabled port is
   actually open. It is red when no ports are open (including “enabled in the
   list but unplugged”).
4. Optional: with at least one port open, turn on **Drive BPM from MIDI clock**.
   That follows `0xF8` timing clock (24 PPQ) and turns off **Use Audio Beat
   Clock**. Details: [Audio input, beat clock, and music energy](audio-input-sync.md).

The engine rescans ports every **1000 ms**. Clicking a port toggles
`device.connectable.midi`; only those IDs are opened.

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
| `laserTool` | Laser editor tools | Selects that tool (`select`, `line`, `freehand`, …) |

Button CCs fire on a **rising edge** through 64 (value ≥ 64). Note On always
fires, including velocity 0. Note Off does not fire a button; it only clears
the CC press latch.

### Sliders / pads (CC or note)

| Action | UI | Range |
|--------|----|-------|
| `setMaster` | Sidebar MASTER | 0..1 |
| `setBaseParam` | Split params, pads, gobo/prism/focus, HSV | 0..1, per split |
| `setAutoSceneBombacity` | Auto energy slider | 0..1 |
| `setBpm` | Status-bar BPM | Learned 60..180 by default; clamp 1..1000 |
| `setMoverFollowOverridePan` / `Tilt` | Movers follow override | 0..1 |

XY / HSV pads expose one slider zone per axis (top/bottom for two-axis pads).
Split index **0** keeps the legacy action id (`setBaseParam` + param key).
Other splits use `setBaseParam{splitIndex}:{paramKey}`.

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

## MIDI clock vs mapped BPM

Mapped `setBpm` writes NodeLink tempo directly. **Drive BPM from MIDI clock**
is a separate path: it estimates BPM from `0xF8` on any enabled input, clamps
**45..220**, and goes stale after **450 ms** without ticks. MIDI Start (`0xFA`)
and Stop (`0xFC`) reset the clock estimator; they do **not** play or pause
Captivate transport.

With MIDI clock or audio beat clock on, TAP does not write NodeLink tempo
(it can still hint the audio detector when Audio Mode is on).

## Persistence

MIDI port enables, clock flag, `buttonActions`, `sliderActions`, and
`keyboardShortcuts` live on `control.device` and save with **Serial Device
Settings (MIDI & DMX)** in the `.cap` file. Uncheck that section on load to
keep the current mappings.

Learn-mode flags (`isEditing`, `keyboardLearnMode`, `listening`) are on the
same object and are **not** stripped on save. Exit mapping before a manual
save if you do not want overlays restored on the next load.

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
       learn? midiSetButtonAction / midiSetSliderAction, return
       else fire button (fireMidiButtonAction) and/or slider
```

Keyboard: capture-phase `keydown` → `fireMidiButtonAction` (buttons only). TAP
from a key sends the `TapTempo` user command so the engine owns tempo/phase.

## Codepaths

| Role | Path |
|------|------|
| Parse Note/CC; input ids | `src/shared/midi.ts` |
| Open ports, poll, realtime bytes | `src/main/engine/midiConnection.ts` |
| Learn + playback | `src/main/engine/handleMidi.ts` |
| Clock estimator, 60 Hz throttle, TAP rules | `src/main/engine/engine.ts` |
| Action types, slider bounds, reducers | `src/renderer/redux/deviceState.ts` |
| Button side effects | `src/renderer/redux/fireMidiButtonAction.ts` |
| Overlays | `src/renderer/base/MidiOverlay.tsx`, `MidiOverlay_xy.tsx` |
| Piano / Connections UI | `src/renderer/menu/StatusBar.tsx`, `src/renderer/overlays/Devices.tsx` |
| Keyboard learn + dispatch | `src/renderer/hooks/useKeyboardShortcuts.ts`, `src/renderer/input/keyboardChord.ts` |
| Load-time mapping normalize | `src/shared/fixState.ts` (`normalizeDeviceMidiMappings`) |

## Related

- [Audio input, beat clock, and music energy](audio-input-sync.md) — MIDI clock vs audio beat clock vs Link
- [Project files and autosave](PROJECTS.md) — mappings travel with Serial Device Settings
- [Atmospherics](atmospherics.md) — `triggerAtmosFixture`
- [Remote control (LAN)](remote-control.md) — no learn UI on remotes
