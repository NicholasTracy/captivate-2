# projectM visuals

Captivate renders Milkdrop-style **projectM** presets as a visualizer layer. A
native Node addon owns a hidden OpenGL context, loads `libprojectM`, and returns
BGRA frames. If the addon or runtime is missing, a built-in fallback still draws
an audio-reactive placeholder so the layer never bricks the visualizer.

Operator UI: visualizer **ProjectM** layer editor → **Download + Install Runtime**,
preset picker, and bridge status.

Developer packaging (lipo, afterPack, verify) is in
[macOS packaging and native modules](macos-packaging-natives.md). The native
addon contract is in [`native/projectm-bridge/README.md`](../native/projectm-bridge/README.md).

## Intent

Keep Milkdrop rendering off the Electron UI thread. Each native session runs in
its own Node child (`ELECTRON_RUN_AS_NODE=1`) so a blocking `createSession` cannot
stall other sessions' audio or render IPC.

## Operator setup

1. Open the visualizer and add or select a **ProjectM** layer.
2. If status says the runtime is missing, click **Download + Install Runtime**.
   Captivate fetches a GitHub release asset for the current OS/arch and writes it
   under user data (`projectm/projectm-runtime/`) so it survives app upgrades.
3. Click **Discovering Presets** / pick a preset directory if the auto-scan is
   empty. Preset files are `.milk`, `.prjm`, and `.preset`.
4. Choose a preset. Intensity is a layer mix control, not a projectM API.

Audio for the layer comes from the same engine as other visualizers (see
[Audio input](audio-input.md)).

## Architecture

```text
ProjectM layer (visualizer renderer)
  → IPC projectm_bridge_* (main process)
  → ProjectMBridgeManager
       native: fork per session → projectm_bridge.node → libprojectM + hidden GL
       missing addon/runtime: in-process fallback BGRA generator
  → BGRA buffer → THREE.DataTexture on a full-screen quad
```

| Layer | Path |
|-------|------|
| Layer + quality clamp | `src/visualizer/threejs/layers/ProjectM.ts` |
| Editor UI | `src/renderer/visualizer/ProjectMEditor.tsx` |
| IPC (renderer / visualizer / main) | `src/renderer/ipcHandler.ts`, `src/visualizer/ipcHandler.ts`, `src/main/engine/ipcHandler.ts` |
| Session manager / workers | `src/main/engine/ProjectMBridgeManager.ts` |
| Runtime detect / preset scan | `src/main/engine/projectmRuntime.ts` |
| In-app installer | `src/main/engine/projectmInstaller.ts` |
| Native addon | `native/projectm-bridge/src/projectm_bridge.cc` |
| Prepare scripts | `tools/prepare_projectm_bridge.js`, `tools/prepare_projectm_runtime.js` |

`fbo-texture` exists only in TypeScript types. The addon reports **`bgra-buffer`**
only; the manager forces that transport.

## Constraints

| Item | Value |
|------|--------|
| Layer render dispatch | **24 fps**, skip if a frame is already in flight |
| Audio push | at most every **33 ms** |
| Layer IPC render timeout | **7 s** (then counts as a miss) |
| Native worker timeouts | create **45 s**, preset hot-swap **20 s**, render **30 s**, audio **2.5 s** |
| Layer output size | **256–640 × 144–360**, quality scale **0.26–0.45** (starts 0.36) |
| Native size clamp | **16–3840 × 16–2160**, fps **1–240** (layer always sends ~30 fps) |
| Mesh | **40 × 30** |
| Preset lock / hard cut | locked **on**, hard cut **off** |
| Preset / soft-cut duration | **120 s** / **0.2 s** |
| Preset scan | depth **8**, max **8000** files, timeout **6.5 s** |
| Preset picker page | **200** rows |
| Runtime detect cache | **3 s** |
| Consecutive render misses before session reset | **30** |

Detection without `CAPTIVATE_PROJECTM_UNSAFE_PROBE=1` treats “library file found”
as available and **does not `dlopen`**. Load is verified when a native session
starts.

## Runtime and addon search

Runtime search order (first existing `libprojectM` / `projectM` library wins):

1. `CAPTIVATE_PROJECTM_RUNTIME_PATH` (file or directory)
2. User data `projectm/projectm-runtime/` (in-app install; preferred over bundled)
3. Packaged `assets/projectm-runtime/`
4. `PROJECTM_RUNTIME_DIR` / `PROJECTM_RUNTIME_PATH` / `PROJECTM_SDK_DIR`
5. Platform defaults (Homebrew / `/usr/lib` / `Program Files\projectM`, …)
6. `PATH` entries

Addon search (`projectm_bridge.node`): `CAPTIVATE_PROJECTM_BRIDGE_PATH`, then
packaged `assets/projectm-bridge/`, then user data
`projectm/projectm-bridge/`, then (dev) `native/projectm-bridge/` build outputs.

Preset roots: `CAPTIVATE_PROJECTM_PRESET_DIR` (path-delimited), directories next
to the runtime library, and `userData/projectm/presets`.

## Build flags

| Variable | Effect |
|----------|--------|
| `CAPTIVATE_BUILD_PROJECTM_BRIDGE` | Force native addon compile (also default on win/linux/darwin) |
| `CAPTIVATE_ALLOW_PROJECTM_BRIDGE_FALLBACK` | Packaging may continue if the `.node` build fails |
| `CAPTIVATE_BUILD_PROJECTM_RUNTIME` / `CI` | Stage runtime into `assets/projectm-runtime/` |
| `CAPTIVATE_SKIP_PROJECTM_RUNTIME` | Skip runtime staging |
| `CAPTIVATE_ALLOW_PROJECTM_RUNTIME_FALLBACK` | Packaging may continue if fetch/stage fails |
| `CAPTIVATE_PROJECTM_RELEASE_MANIFEST_URL` | Override GitHub latest-release JSON |
| `CAPTIVATE_PROJECTM_UNSAFE_PROBE=1` | `koffi` load + version probe during detect |
| `CAPTIVATE_PROJECTM_BRIDGE_LOG` | Native addon log path (workers also set this) |

Worker host script and log live under `userData/projectm/bridge-host/`
(`projectmBridgeHost.js`, `projectmBridgeHost.log`).

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Fallback rainbow / no Milkdrop | Status: addon loaded? runtime path? Install runtime; rebuild bridge (`npm run prepare:projectm-bridge`) |
| Install cannot find an asset | Platform/arch not in [projectM releases](https://github.com/projectM-visualizer/projectm/releases/latest); inspect installer message |
| Preset list empty or “scan timed out” | Point the picker at a smaller folder; scan stops at 6.5 s / 8000 files |
| Status says available but session falls back | File present but load failed; set `CAPTIVATE_PROJECTM_UNSAFE_PROBE=1` or read `projectmBridgeHost.log` |
| Visualizer stutter, then reset | 30 missed renders (7 s IPC timeout or worker failure) recreate the session |
| Windows GL init fails | In-app install also fetches GLEW 2.2.0; hidden window class `Captivate projectM bridge` |

## Related

- [Audio input and music energy](audio-input.md)
- [Visualizer streaming](visualizer-streaming.md) — detached visualizer must be open
- [Multi-window UI](multi-window.md)
- [macOS packaging and native modules](macos-packaging-natives.md)
- [Telemetry](DEBUG_TELEMETRY.md)
