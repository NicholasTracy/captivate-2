# Ableton Link

Wireless tempo (and optional play/stop) sync with [Link-enabled apps](https://www.ableton.com/en/link/products/)
on this computer and the same LAN. Captivate uses the native `node-link`
session as its **engine clock** even when Link is off — enabling Link only
joins that session to the network.

MIDI clock and audio beat clock are separate drivers that write into the same
`node-link` tempo. Details of those sources: [audio-input-sync.md](audio-input-sync.md).

## Setup

1. Open **Connections** (ethernet icon in the status bar) or use the status-bar
   **Ableton Link** control.
2. Turn **Link** on. The status line shows **No peers yet**, **1 peer**, or
   **N peers**. Peer count does **not** include this app.
3. Optionally enable **Start/stop sync** (visible only while Link is on) so
   play / stop follows other Link apps when they support it.
4. Confirm other apps have Link enabled on the same network.

Defaults (device connection settings): `linkEnabled` **false**,
`linkStartStopSyncEnabled` **false**.

The status-bar Link dot is green when `connectionSettings.linkEnabled` is
true. Tooltip / Connections help describe the same join/leave behavior.

## Architecture

```text
UI (LinkButton / StartStopSyncButton / Connections)
  → Redux setLinkEnabled / setLinkStartStopSyncEnabled
  → user command SetLinkEnabled / EnableStartStopSync
  → engine: _nodeLink.enable / enableStartStopSync (immediate)

Engine tick (~90 Hz)
  → _nodeLink.getSessionInfoCurrent()
  → TimeState.bpm / beats / phase / numPeers / isEnabled / isStartStopSyncEnabled
  → DMX LFOs, beat meter, visuals
```

`node-link` is constructed at engine boot with `setIsPlaying(true)`,
`enable(false)`, and `enableStartStopSync(false)`. Control-state apply
(`syncNodeLinkFromControlState`) keeps the native session aligned when the
project loads. User commands also write `connectionSettings` on the engine
copy so the UI cannot show “off” while the session is still joined (1.1.1).

| Layer | Path |
|-------|------|
| Toggle / peer readout | `src/renderer/menu/LinkButton.tsx` |
| Start/stop sync | `src/renderer/menu/StartStopSyncButton.tsx` |
| Connections panel | `src/renderer/overlays/Devices.tsx` (`AbletonLinkConnections`) |
| Status dot | `src/renderer/menu/ConnectionStatus.tsx` |
| Settings | `src/renderer/redux/deviceState.ts` (`linkEnabled`, `linkStartStopSyncEnabled`) |
| Commands | `src/shared/ipc_channels.ts` (`SetLinkEnabled`, `EnableStartStopSync`) |
| Session + clock | `src/main/engine/engine.ts` (`_nodeLink`) |
| Packaging | `tools/prepare_node_link_runtime.js`, [macos-packaging-natives.md](macos-packaging-natives.md) |

## What writes tempo

All of these call `_nodeLink.setTempo` (or MIDI `setBpm`):

| Source | When |
|--------|------|
| Status-bar BPM / drag (`IncrementTempo`, `SetBPM`) | Always |
| Tap tempo | When MIDI clock BPM and audio beat clock are both off |
| Audio beat clock | Audio Mode + **Use Audio Beat Clock**; nudges phase vs Link beats |
| MIDI clock (`0xF8`) | **Drive BPM from MIDI clock** in Connections |
| MIDI mapped `setBpm` | Mapped slider / encoder |

Turning Link **on does not** disable MIDI clock or audio beat clock. Those two
disable **each other**, but either can still overwrite the Link session tempo.
Run one external clock into NodeLink at a time unless you intend to fight.

While transport is playing, session BPM is clamped to **45–220**. The
status-bar editor accepts a wider draft range (20–300) before the engine
clamps. Audio BPM range-lock UI is hidden while Link is on
(`Bpm.tsx` `showBpmRangeLock`).

Play / stop:

- Captivate **Stop** freezes authoritative beat/LFO time and
  `_nodeLink.setIsPlaying(false)`.
- **Play** restores the frozen beat (`forceBeat`) then
  `_nodeLink.setIsPlaying(true)`.
- With **Start/stop sync** on, other Link peers can drive that same playing
  flag when they support it.

## Troubleshooting

| Symptom | Check |
|---------|-------|
| No peers | Other apps have Link on; same LAN / machine; OS firewall not blocking Link multicast (handled inside `node-link`, not Captivate-specific ports in this repo). |
| Toggle looks off while playing | Fixed in 1.1.1: commands update engine `connectionSettings` immediately. If it regresses, compare `time.isEnabled` vs `connectionSettings.linkEnabled`. |
| Tempo jumps when Link is on | Another app or Captivate MIDI / audio beat clock is writing `_nodeLink.setTempo`. Turn those off. |
| Tap tempo does nothing to BPM | MIDI clock or audio beat clock is enabled — tap is reserved for those paths (audio also stores a detector hint). |
| Start/stop control missing | Link is off; the Connections start/stop row renders only when `linkEnabled`. |
| Packaged app missing Link | `node-link` native missing from the app `node_modules` (see `npm run verify:release-assets` and macOS packaging). |

Realtime UI may extrapolate beats for display; Link session fields
(`isEnabled`, `numPeers`, `isStartStopSyncEnabled`) are merged from engine
updates (`src/shared/timeExtrapolation.ts`).

## Developer pitfalls

- `_nodeLink.enable(false)` is “leave the LAN session,” not “stop using
  NodeLink as the clock.”
- Do not assume Link and MIDI / audio clocks are mutually exclusive in
  `deviceState` — only MIDI clock ↔ audio beat clock are.
- `SetLinkEnabled` / `EnableStartStopSync` must keep `_lastSyncedLinkEnabled`
  / `_lastSyncedLinkStartStopSync` in sync or the next control-state apply
  will skip the native call.
- Energy tempo (`resolveEnergyTempoBpm`) can fall back to Link/session BPM
  when detected-BPM confidence is low; that is independent of `linkEnabled`.
