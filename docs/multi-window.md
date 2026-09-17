# Multi-window UI

Captivate can open extra BrowserWindows for heavy or live pages so the main
editor stays responsive. Detached windows **mirror** Redux control state from the
main window; they do not publish it back.

Window layout is an **app preference**, not project content. It is not stored in
`.cap` files. See [Project files and autosave](PROJECTS.md).

## How to open

| Action | What opens |
|--------|------------|
| Status bar **pop-out** icon | The **active** page (`title`: `Pop <page> out to its own window`) |
| Sidebar visualizer icon | `Video` (full visualizer chrome) |
| Visualizer display picker | `VideoViewport` on a chosen display |
| Lighting 3D / Laser in-page **Open** | Matching dedicated window |
| **Extras → Open Lighting 3D Window (Alpha)** | `Lighting3D` |
| **Extras → Open Laser Window (Alpha)** | `Laser` |

The pop-out icon is hidden on **Atmospherics**. Choosing Atmospherics from
`open_page_window` focuses the **main** window and switches its page instead of
creating a pop-out.

Navigating to Visualizer, Lighting 3D, or Laser **in the main window** shows a
proxy card and auto-opens the dedicated window once per session
(`sessionStorage` keys). Use **Open / Focus** if you closed it.

## Page rules

| Pages | Behavior |
|-------|----------|
| `Lighting3D`, `Laser`, `Video`, `VideoViewport`, `Streaming` | **Single-instance**: a second open **focuses** the existing window |
| `Universe`, `Movers`, `Modulation`, `Mixer`, `Led`, `Share`, … | Each pop-out **creates another** window |
| `Atmospherics` | Never detached |

Dedicated windows load `index.html?page=<Page>`. Heavy visualizer / 3D / laser
windows hide the native menu bar.

### Session isolation

Detached windows use persistent Electron partitions so GPU/renderer work does not
share the main session cookie jar:

| Page | Partition |
|------|-----------|
| `Lighting3D` | `persist:captivate-lighting3d` |
| `Laser` | `persist:captivate-laser` |
| `Video`, `VideoViewport`, `Streaming` | `persist:captivate-visualizer` |
| `Atmospherics` (if it were detached) | `persist:captivate-atmos` — unused; the page is forced onto main |

### Visualizer vs streaming

`Video`, `VideoViewport`, and `Streaming` all count as **detached visualizer**
windows. The engine binds `visualizerContainer` to the first of those that is
open (prefer viewport, then Video, then Streaming). Closing one falls back to
another if present.

[Visualizer streaming](visualizer-streaming.md) requires an open visualizer
window. Closing the last visualizer detached window stops capture.

`VideoViewport` can be placed on a display (`displayId`) and starts maximized.
OS fullscreen is toggled only for that page via
`visualizer_detached_fullscreen`.

While no visualizer detached window is open, lighting UI hides Visualizer-only
splits. The same pattern hides laser fixture-group splits when the Laser window
is closed.

## Close confirmation

Closing a detached window (title-bar close or OS shortcut) is **intercepted**:

1. Main `preventDefault`s `close` unless quit is in progress or this window was
   already approved.
2. Renderer shows **Close Window?** — “Closing this window will not close the
   main window.”
3. Confirm calls IPC `request_window_close`, which records approval and closes.

The main window close path is a separate quit confirm. Geometry listeners on
move/resize/maximize/fullscreen wrap `captureWindowPlacement` in try/catch so a
close race cannot throw (fix in `4592003`).

`createVisualizerWindow.ts` still exports a dedicated visualizer factory and
`VisualizerContainer` type. Live visualizer windows are created through
`createAppWindow` (detached pages), not that factory.

## Layout persistence

Path: `userData/window-state/captivate-window-layout.json` (version `1`).

Stores main bounds, up to the live detached set, and last visualizer placement.
Writes are debounced **220 ms**. On launch, Captivate restores at most **12**
detached placements and **skips** `Atmospherics` entries. Bounds that no longer
intersect a display work area drop x/y and keep size (min **320×240**).

Closing the last visualizer window does **not** clear saved placement; it is
reused the next time one opens.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Pop-out missing | Active page is Atmospherics — use the main-window page |
| Second Lighting 3D / Laser / Visualizer did nothing new | Single-instance: the existing window was focused |
| Two Mixer windows | Expected — Mixer is not in the single-instance set |
| Close does nothing after confirm | Dialog could not invoke `request_window_close` (window already gone) |
| Layout not restored | File missing/corrupt; Atmospherics entries ignored; >12 windows truncated |
| Streaming: `Open the visualizer window first.` | Open Video / VideoViewport / Streaming |

## Codepaths

| Role | Path |
|------|------|
| Open / restore / close | `src/main/main.ts` (`openOrFocusDetachedPage`, `createAppWindow`) |
| Layout IO | `src/main/windowStateStorage.ts` |
| Close prompt UI | `src/renderer/index.tsx` (`on_detached_window_close_prompt`) |
| Pop-out control | `src/renderer/menu/StatusBar.tsx` |
| Visualizer / 3D / Laser proxies | `src/renderer/pages/VisualizerProxy.tsx`, `Lighting3DProxy.tsx`, `Laser.tsx` |
| Viewport display picker | `src/renderer/visualizer/OpenVisualizerButton.tsx` |
| Page query routing | `src/renderer/App.tsx` (`?page=`) |
| Split visibility vs detached flags | `src/renderer/scenes/splitUiVisibility.ts` |
| Menu extras | `src/main/menu.ts` |

## Related

- [Visualizer streaming](visualizer-streaming.md)
- [projectM visuals](projectm.md)
- [Atmospherics](atmospherics.md) — stays on the main window
- [Laser FB4 / Pangolin BEYOND](laser-fb4-beyond.md)
- [Telemetry](DEBUG_TELEMETRY.md) — `window.detached` / `visualizer.window` marks
