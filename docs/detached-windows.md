# Detached windows

Captivate can show a page in its own OS window. The main window still owns the
show. A detached window is another Electron renderer with `?page=` in the URL.

Use a detached window for a second display (visualizer, laser, lighting
preview) or to keep the mixer or fixture editor visible beside the scenes page.

## Open a window

| How | What opens |
|-----|------------|
| Status-bar pop-out icon | The **active** sidebar page, except Atmospherics |
| Sidebar **Visualizer**, or **Window** menu | `Video` (editor + output) |
| Visualizer **Open detached viewport** | `VideoViewport` on a chosen display, then maximized |
| Sidebar **Lighting 3D**, or **Extras → Open Lighting 3D Window** | `Lighting3D` |
| Sidebar **Laser**, or **Extras → Open Laser Window** | `Laser` |
| Screenshot harness `openPageWindow` | Any page id you pass |

Choosing **Atmospherics** does not create a window. Main focuses itself and
switches the sidebar to that page.

`Lighting3D`, `Laser`, `Video`, `VideoViewport`, and `Streaming` are
single-instance: opening one again focuses the existing window. Other pages
are not. Popping **Universe** or **Mixer** out twice creates two windows.

The in-app Visualizer, Lighting 3D, and Laser pages are proxies. The first
visit sends the open IPC. Visualizer remembers
`sessionStorage` key `captivate:autoOpenedVideoWindow` so a renderer reload
does not pop the window again after you closed it.

## What each window renders

Dedicated shells (no main menu bar, status bar, or project dialogs):

| `page` | UI | Session partition |
|--------|----|-------------------|
| `Lighting3D` | 3D preview | `persist:captivate-lighting3d` |
| `Laser` | Laser editor | `persist:captivate-laser` |
| `Video`, `Streaming` | Visualizer page | `persist:captivate-visualizer` |
| `VideoViewport` | Output only, plus an OS-fullscreen bar | `persist:captivate-visualizer` |

`Lighting3D`, `Video`, `VideoViewport`, and `Streaming` also hide the native
menu bar. The Laser window does not.

Any other `page` value (`Universe`, `Movers`, `Modulation`, `Mixer`, `Led`,
`Share`) still mounts the full app chrome in that window, with the sidebar
page preset. It is still a detached renderer: it does not publish show state.

Default size is **1300×900**, clamped to at least **320×240**. Placement is
saved and restored (below).

## Who owns the show

```text
Main renderer  --publish-->  engine control state  --snapshot-->  other renderers
Detached UI    --forward some actions-->  main renderer  --publish-->  engine
```

Only the main window publishes (`_canPublishControlState`). Ordinary edits
publish **64 ms** after the last change, on the next animation frame. These
publish on the next microtask instead: `control/*`, blackout, fixture-depth,
manual atmos trigger, mixer overwrites, and mover/color-map calibration
overrides.

A detached window applies `new_control_state` at most once per animation
frame. It does **not** apply broadcast `dispatch` messages (that would double
edits). It forwards only:

- `dmx/*`, `scenes/*`, `laser/*`
- `gui/setBlackout`, `gui/setFxtrDepthOn`, `gui/fireAtmosManualTrigger`
- `mixer/setPageIndex`, `setChannelsPerPage`, `setActiveMixerUniverse`,
  `setOverwrite`, `clearOverwrites`, `setMixerShowAllChannels`

Page changes, dialogs, MIDI learn, and the connections menu stay in that
window.

**Lighting 3D** does not apply `new_control_state` after load. On
`did-finish-load` it receives one `lighting3d_preview_bootstrap` snapshot,
then `lighting3d_realtime_tick` for the preview. Later edits in the main
window are not copied into the 3D window’s Redux store.

`videoEnabled` is true while any `Video`, `VideoViewport`, or `Streaming`
window is open, and false when the last one closes. `laserWindowOpen` follows
the Laser window the same way. Scene UI uses those flags to show or hide
visualizer-only and laser-only splits.

While more than one visualizer window is open, the streaming capture window is
whichever of `Video`, `VideoViewport`, or `Streaming` was opened last. Live
visualizer resource updates go to that same window. When it closes, the
fallback is `VideoViewport`, then `Video`, then `Streaming`. See
[Visualizer streaming](visualizer-streaming.md).

## Close

The window’s `close` event is cancelled until you confirm, unless the app is
already quitting or this webContents was approved.

**Close Window?** says the main window stays open. **Close** calls
`request_window_close`, which approves that webContents and closes it. The
same IPC returns **false** for the main window, so a detached page cannot quit
the app through it. If `close()` throws, main destroys the window.

The confirm is a critical dialog (z-index **19995**), above the tour coach.
If that window’s tour flag is on, the prompt sets `interactiveTourActive` to
false **in that window only**. It does not set `firstRunTutorialCompleted`.

While the app is quitting, detached windows close without this prompt.

## Layout restore

Placements are written to:

`userData/window-state/captivate-window-layout.json` (version **1**)

Moves, resizes, maximize, and fullscreen update an in-memory snapshot and
flush it **220 ms** later. Quit flushes that snapshot. Capture ignores a
window that is already destroyed, so closing a preview cannot throw
“Object has been destroyed”.

On the next launch Captivate reopens up to **12** saved detached pages.
`Atmospherics` entries are skipped. A saved rectangle that misses every
display work area keeps its size and drops its position, so an unplugged
monitor does not leave the window off-screen.

`VideoViewport` can also be placed on a display id from the viewport menu,
then maximized.

## Autosave from a second window

Every renderer, including detached ones, runs the autosave setup in
`src/renderer/index.tsx`:

- `autoSave()` starts session snapshots (`state-cache-*` in `localStorage`,
  every **5 s**).
- If app settings include a last project path, `setFileAutosaveEnabled` runs
  in that process. With **File > Autosave** on, that starts the **15 s**
  `.cap` / `.cfx` writer and pauses the session timer. With it off, the
  session timer keeps running.

The fingerprint that skips an unchanged file write is per window. The first
tick in a detached window writes, because its fingerprint starts empty.

Dedicated partitions do not share `localStorage` with the main window. A
pop-out without a partition (`Mixer`, `Universe`, and the other full-chrome
pages) **does** share the default session. While session recovery is the
active path, that window writes the same `state-cache-*` keys as the main
window.

The Lighting 3D store stays on the bootstrap snapshot. Its file autosave can
write that older show, including `activePage: "Lighting3D"`, over the `.cap`
the main window is editing. Synced windows (visualizer, laser, mixer pop-out)
do track later snapshots, but `activePage` stays the detached page, and that
is what `buildProjectSaveState` writes.

Prefer editing the show from the main window while those windows are open, and
save from the main window after you close a preview if the sidebar page on
disk looks wrong.

## Recovery and process limits

Unresponsive and crashed **main** renderers reload after **250 ms**, at most
once every **5 s**, with a **4 s** lock after the attempt. Detached windows
log the same failures and are not reloaded.

A second Captivate process exits. The first process focuses the main window.

`src/main/engine/createVisualizerWindow.ts` is not on this path. Live windows
are created by `createAppWindow` in `src/main/main.ts`.

## Code map

| Piece | Path |
|-------|------|
| Create, focus, close, restore | `src/main/main.ts` |
| Layout file | `src/main/windowStateStorage.ts` |
| Page shells | `src/renderer/App.tsx` |
| Publish / forward | `src/renderer/index.tsx` |
| Open IPC | `src/renderer/ipcHandler.ts` (`send_open_page_window`) |
| Pop-out button | `src/renderer/menu/StatusBar.tsx` |
| Viewport display picker | `src/renderer/visualizer/OpenVisualizerButton.tsx` |
| Snapshot fan-out | `src/main/engine/ipcHandler.ts` |

## Related

- [Project files and autosave](PROJECTS.md)
- [Visualizer streaming (RTSP / NDI)](visualizer-streaming.md)
- [MIDI and keyboard mapping](midi-mapping.md) — detached mapping bar
