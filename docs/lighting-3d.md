# Lighting 3D preview

Alpha WebGL preview of the patched DMX rig and LED fixtures. Colors and
brightness follow live output so you can check looks and placement before a
show. The preview is **not** a second DMX output path.

The in-app sidebar page is a launcher only. The live view always runs in its
own detached window (`Extras → Open Lighting 3D Window (Alpha)`).

## Current preview quality

`PREVIEW_ESSENTIALS_MODE` is **on** in `previewCore.ts`. The viewport shows
fixture housings, emitter lenses (DMX color / brightness), stage, optional
room, floor outline, and curtain. It does **not** draw beam cones, dynamic
spot / fill lights, surface splats, atmosphere jets, or volumetric fog — those
code paths stay compiled but gated off.

Treat missing beams as current product behavior, not a broken GPU.

## Setup

1. Patch fixtures (and optional LED fixtures) in **DMX Setup**. Empty patch
   shows “Add fixtures in DMX Setup to see them here.”
2. Open **Lighting 3D** from the sidebar, or
   **Extras → Open Lighting 3D Window (Alpha)**.
3. The main window shows a proxy card and focuses / opens the detached window.
4. Use **Curtain**, **Floor outline**, and **Room** (width / depth / height)
   in that window. Room size is independent of stage dimensions.

Only one Lighting 3D window exists at a time; a second open focuses the first.

### Camera and gizmos

| Input | Behavior |
|-------|----------|
| Drag in the viewport | Orbit (`OrbitControls`) |
| Scroll wheel | Zoom |
| **W / A / S / D** | Truck the camera; **Shift** speeds up (5.6 vs 3.2) |
| **Home** | Reset to `[0, 6.9, 10.1]` looking at `[0, 1.8, 0.8]` |
| Left-click a fixture | Select it in the project |
| Left-click empty space | Hide the move / rotate gizmo |
| Right-click a fixture | Show the gizmo |
| **Q** / **E** | Translate / rotate while a gizmo is visible |
| **Mount** (movers) | Flip upright vs hung (`moverMountOrientation`) |

Moving-head fixtures can be translated here, not rotated — **E** snaps back to
translate. Fixed lights and LED fixtures accept both modes. Placement writes
`fixture.window` / `rotation` (or LED position / rotation) and stays in sync
with the fixture map in the main window.

Camera pose persists in the detached window’s
`localStorage` key `captivate.lighting3d.camera.v1` (session partition
`persist:captivate-lighting3d`). It is not stored in the `.cap` file.

## Architecture

```text
Engine realtime (~90 Hz)
  → send_time_state
  → if a Lighting 3D window is registered:
       throttle IPC ticks (25 / 50 / 66 ms by fixture count)
       buildLighting3dRealtimeTick (time, DMX, splits, master)
       lighting3d_realtime_tick → lighting3dPreviewRuntimeManager
  → rAF preview sync (renderer interval 25–80 ms)
       structure unchanged → applyLiveValuesToPreviewTargets
       layout / model changed → rebuild meshes (max 12 new visuals / pass)

Patch / placement / active scene changes
  → lighting3d_preview_bootstrap (380 ms debounce, fingerprint-deduped)
  → resetRemoteState in the detached window
```

The detached window **does not** consume the full `new_control_state` mirror.
It boots from `lighting3d_preview_bootstrap` and then applies slim ticks.
Placement and `dmx/*` edits dispatch locally and
`send_dispatch_to_main` so the primary window / project stay authoritative.

| Layer | Path |
|-------|------|
| Proxy (main window) | `src/renderer/pages/Lighting3DProxy.tsx` |
| Page / viewport | `src/renderer/pages/Lighting3D.tsx` |
| Mesh + DMX mapping | `src/renderer/lighting3d/previewCore.ts` |
| Tick sink | `src/renderer/lighting3d/Lighting3dPreviewRuntimeManager.ts` |
| Patch → preview rows | `src/renderer/pages/lightingPreviewSelectors.ts`, `lightingPreviewFixtures.ts` |
| Slim tick type | `src/shared/lighting3dPreviewTransport.ts` |
| IPC register / throttle / bootstrap | `src/main/engine/ipcHandler.ts` |
| Window + partition | `src/main/main.ts` (`createAppWindow`, `persist:captivate-lighting3d`) |
| Settings | `src/renderer/redux/dmxSlice.ts` (`lighting3d`) |

A utility-process helper (`lighting3dUtilityWorkerHost.ts` /
`lighting3dPreviewWorker.ts`) can build the same tick off the main thread, but
**live IPC does not call it**. `send_time_state` builds ticks in-process.
`stopLighting3dUtilityWorker()` still runs on quit.

## Settings and clamps

`dmx.lighting3d` (project-persisted):

| Field | Default | Clamp / notes |
|-------|---------|----------------|
| `showCurtain` | `true` | Backdrop behind the stage |
| `showBoundsOverlay` | `true` | Dance-floor outline |
| `roomEnabled` | `false` | Walls / ceiling |
| `roomWidthFt` / `roomDepthFt` | 36 / 28 | 5–400 ft |
| `roomHeightFt` | 12 | 5–120 ft |
| `environmentFog` | 0.65 | Persisted 0–1; **no UI and unused by the renderer** |

Stage size (`dmx.stage`, default 24 × 12 × 18 ft) is a separate object used
for floor / curtain layout. Room walls do not replace stage dimensions.

## Realtime budget

Main-process IPC (`syncLighting3dTickBudget`, patched + LED fixture count):

| Fixtures | Min tick interval |
|----------|-------------------|
| ≤ 6 | 25 ms |
| ≤ 14 | 50 ms |
| > 14 | 66 ms |

The renderer profile (`lighting3dPerformanceProfile`) also uses emitter count
and WebGL 1: 25 / 50 / 66 / **80** ms, and treats `fixtureCount > 8` or
`emitterCount > 56` as a heavy scene (no antialias, pixel ratio 1). A stall
longer than **2500 ms** posts a status-bar error. First load with fixtures
keeps a busy overlay for at least **900 ms** plus **500 ms** settle.

Ticks copy `dmxOutByUniverse` (sliced), `time`, `splitStates` (params +
randomizer only), and `master`. Atmospherics / audio bulk are omitted.

Bootstrap fingerprint includes fixture / LED ids, addresses, windows,
rotations, fixture-type list, and the active light scene. Curtain / room
toggles are **not** in the fingerprint — they live on the detached page
itself.

## WebGL fallback

`createLightingRenderer` prefers WebGL 2. If that context is missing it falls
back to WebGL 1 (`experimental-webgl` last). No context at all throws.

WebGL 1: no fixture shadows, no antialias, pixel ratio capped at 1, slower
DMX sync. Banner copy lives in `webglFallback.ts`; dismiss flag
`captivate.lighting3d.webgl1BannerDismissed`.

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Proxy card, no 3D | Detached window blocked or closed. Use **Open / Focus Lighting 3D** or the Extras menu. |
| Empty stage | Nothing in `dmx.universe` / LED fixtures. |
| No beams / fog / jets | Essentials mode is on; this is expected. |
| Placement not updating in Fixtures | Confirm the 3D window forwarded a `dmx/*` action (primary owns the project). |
| Jagged / no shadows | WebGL 1 fallback. Update GPU drivers; on laptops use the discrete GPU. |
| Stale looks after a patch edit | Bootstrap is debounced 380 ms and skipped when the structure fingerprint is unchanged. |
| Render stall message | GPU/main-thread hitch > 2.5 s. Search debug log for `lighting3d` + `frame_stall_detected`. |

## Developer pitfalls

- Do not treat `lighting3dUtilityWorkerHost` as the live tick path until
  `initLighting3dUtilityWorker` / `postLighting3dTickViaUtilityWorker` are
  wired into `send_time_state`.
- Do not add a fog slider for `environmentFog` without a renderer consumer.
- The Lighting 3D window ignores `new_control_state`. New shared fields need
  either the bootstrap fingerprint or the slim tick payload.
- `createVisualizerWindow()` is unrelated; this preview is a detached
  `Lighting3D` page via `createAppWindow`.
- Remote control does not host Lighting 3D (see [remote-control.md](remote-control.md)).
