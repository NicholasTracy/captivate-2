# projectM native bridge

Node-API addon that loads **libprojectM**, renders into a hidden OpenGL context,
and returns **BGRA8** frames to Electron.

Operator setup, env vars, search paths, and troubleshooting:
**[docs/projectm.md](../../docs/projectm.md)**.

## Status

This is a **working renderer**, not a scaffold. The TypeScript IPC contract,
main-process manager, per-session worker, and C++ addon are implemented.

| Piece | Role |
|-------|------|
| `src/projectm_bridge.cc` | Load runtime symbols, hidden GL, session lifecycle |
| `binding.gyp` | node-gyp target `projectm_bridge` (C++17, N-API exceptions) |
| `ProjectMBridgeManager` | Loads the `.node`, forks one worker per native session |

If the `.node` or runtime library is missing, Captivate keeps running with an
in-process fallback visual (same BGRA contract).

## Addon API

```text
createSession(request) → boolean
loadPreset(request) → boolean
pushAudio(chunk) → void
render(request) → Uint8Array | null   // BGRA8, width*height*4
destroySession(sessionId) → void
getSupportedTransports() → ['bgra-buffer']
```

`createSession` / `loadPreset` request fields: `sessionId`, `width`, `height`,
`fps`, optional `presetPath`, optional `texturePath` (`;`-separated search dirs).

Native clamps: width **16–3840**, height **16–2160**, fps **1–240**. Mesh is
**40×30**. Presets are locked; hard cuts are off.

`fbo-texture` is **not** implemented.

## Build

From the repo root (matches packaging):

```bash
npm run prepare:projectm-bridge
```

That compiles against the Electron ABI via node-gyp. On Darwin with
`CAPTIVATE_DARWIN_UNIVERSAL_NATIVE=1` or `CI=true`, it builds arm64 + x64 and
`lipo`s the result.

Windows: `JOBS=1` / `/MP1` to avoid intermittent MSBuild access-violation crashes.

## Output paths

The manager probes these (see `getAddonCandidates()`):

- `CAPTIVATE_PROJECTM_BRIDGE_PATH`
- Packaged: `resources/assets/projectm-bridge/projectm_bridge.node`
- Dev: `assets/projectm-bridge/projectm_bridge.node`
- Dev: `native/projectm-bridge/projectm_bridge.node`
- Dev: `native/projectm-bridge/build/Release/projectm_bridge.node`
- User data: `projectm/projectm-bridge/projectm_bridge.node`

Runtime libraries (`libprojectM`) are **not** compiled here. They are staged by
`npm run prepare:projectm-runtime` or installed in-app.

## Logging

Set `CAPTIVATE_PROJECTM_BRIDGE_LOG` to a file path. Session workers write to
`userData/projectm/bridge-host/projectmBridgeHost.log` by default.
