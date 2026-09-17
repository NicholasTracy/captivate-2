# Laser DAC output (Helios, Ether Dream, generic)

How Captivate connects ILDA-style DACs, arms output, and streams sampled laser
scenes. Pangolin FB4 via BEYOND is a separate backend — see
[laser-fb4-beyond.md](laser-fb4-beyond.md).

## Intent

The Laser page drives one or more **DAC sessions**. Each enabled fixture routes
either to a **projection zone** on a DAC profile or to a **network node**. After
you hold-to-arm, Captivate samples the active laser scene and pushes frames to
hardware. Output stays off until armed; the arm button starts disarmed on every
Laser-page load (it is not persisted).

## Architecture

```text
Laser page (renderer)
  → collect required sessions (enabled fixture routes)
  → laser_dac_connect (IPC invoke)
  → hold 8s to arm  → rAF tick ≤ 30 Hz
  → sampleLaserSceneForDac → zone map / merge
  → laser_dac_push_frame (IPC send, fire-and-forget)
Main: laserDacSession
  → coalesce + contentKey dedupe
  → LaserTransport.pushFrame
       HeliosUsbTransport | EtherDreamTcpTransport
       | UdpLaserBridgeTransport | Fb4Transport
```

Entry points:

| Layer | Path |
|-------|------|
| Laser page / arm / stream | `src/renderer/pages/Laser.tsx` |
| Setup wizard | `src/renderer/laser/LaserSetupWizard.tsx` |
| Connection presets | `src/renderer/laser/laserConnectionPresets.ts` |
| Scene sampling | `src/renderer/laser/laserDacSampler.ts` |
| Zone map / merge | `src/renderer/laser/laserProjectionZoneMath.ts` |
| Multi-fixture compose | `src/renderer/laser/laserMultiFixtureOutput.ts` |
| Hardware / calibration | `src/shared/laserHardwareSettings.ts`, `src/renderer/laser/laserCalibration.ts` |
| Session + transports | `src/main/engine/laserDacSession.ts`, `src/main/engine/laser/` |
| Shared IPC types | `src/shared/laserDac.ts` |

## Backends

UI **DAC profiles** map to `protocol` + `backend` (`LASER_DAC_CONNECTION_PRESETS`):

| Preset | Backend | Protocol | Transport | Target |
|--------|---------|----------|-----------|--------|
| Helios — USB (ILDA) | `helios` | `ilda` | USB (`usb` package, VID `0x1209` / PID `0xE500`) | Device index (`0` = first). Empty / “Auto discover” also picks the first scanned device. |
| Ether Dream — network (ILDA) | `etherdream` | `ilda` | TCP port **7765** | Host or `host:port`. **Must be a real IP/hostname** — see pitfalls. |
| Pangolin FB4 — BEYOND | `fb4` | `ilda` | BEYOND SDK (Windows) | Optional path to `BEYONDIO.dll` |
| Generic ILDA — UDP bridge | `generic` | `ilda` | UDP default port **40200** | Host or `host:port` |
| Generic IDN — UDP bridge | `generic` | `idn` | UDP default port **40201** | Host or `host:port` |

Helios **IDN** is rejected: *“Helios IDN (network) mode is not wired in Captivate yet.”* Use Helios + ILDA (USB), or Generic + IDN for the UDP bridge.

`laser_dac_list_devices` only scans **Helios USB**. Other backends return an empty list.

## Setup

1. Open the **Laser** page. If `laserDacSetupComplete` is not true, the DAC
   setup wizard runs first.
2. In the wizard (or **Laser → DAC profiles**), pick a connection preset, set
   scan rate / color mode / power, then calibrate with the ILDA test pattern.
3. Define **projection zones** and assign fixtures (`dac_zone`) or create
   **network nodes** (`network_node`).
4. **Test connection** in the wizard connects, then immediately disconnects.
5. Hold **HOLD TO ARM OUTPUT** for **8 seconds**. Arming auto-connects every
   session required by enabled fixtures. **PUSH TO STOP** disarms.

Fixtures with `outputRoute.kind === 'unassigned'` are not connected and never
stream.

## Safety

| Behavior | Detail |
|----------|--------|
| Arm | Hold 8s (`LaserArmHoldButton`). Starts `false` each Laser-page mount. |
| Disarm | Click **PUSH TO STOP**. Renderer stops the 30 Hz push loop and calls `laser_dac_stop_output` per connected session. |
| Helios stop | Transport implements `stopOutput`: halt playback (`0x01`) and close shutter (`0x02`). |
| Ether Dream / generic / FB4 stop | These transports **do not** implement `stopOutput`. Disarm stops new Captivate frames; hardware may keep the last stream until you **Disconnect**. Ether Dream sends `s` (stop) only on disconnect. FB4 disables BEYOND laser output only on disconnect. |

Treat **Disconnect** as the hard stop for non-Helios backends.

## Projection zones vs network nodes

**DAC profile zones** (Quick Show–style rects on one scanner):

- Editor space is **0–1, origin top-left**. Transports flip Y for Helios and Ether Dream.
- Zone rects clamp to the canvas; width/height minimum **0.02**.
- `clipOutside` defaults **true**: lit points outside the zone are dropped. When
  false, out-of-zone lit points are sent **blank**.
- Blank hops are remapped into zone space even when the hop is outside the rect.
- **Helios / Ether Dream / generic:** overlapping zones are **merged** into one
  ILDA stream (`mergeZoneFrames`), lowest `priority` first, blank hop between
  zones. Higher priority is concatenated later (drawn on top in overlap).
- **FB4:** zones are **not** merged — one BEYOND zone image per Captivate zone.

**Network nodes** (`node:<nodeId>`):

- One TCP/UDP endpoint per node. No zone mapping, no per-profile calibration.
- Scan rate is always **30000 pps** (`LASER_DAC_SCAN_RATE_DEFAULT_PPS`).
- RGB is scaled by the Laser page’s **currently selected DAC profile**
  `outputPower01` (not a per-node hardware block).

Session IDs: `dac:<profileId>`, `node:<nodeId>`. Empty session id in IPC
defaults to `primary`.

## Hardware settings (DAC profiles)

| Setting | Range / default |
|---------|-----------------|
| Scan rate | 1000–100000 pps, default **30000** |
| Output power | 0–1, default **0.75** (multiplies RGB before DAC packing) |
| Color mode | `analog` (pass-through) or `ttl` (channel > 0.5 → 1, else 0) |
| Master size | 25–100%, default **80** |
| Size X/Y trim | 50–150%, default **100** |
| Rotation | ±45° |
| Position | ±0.25 canvas units |

Calibration is applied around canvas center **before** zone mapping.

Live scene sample budget: `clamp(round(scanRatePps / 8), 200, 4095)` points.
The ILDA test pattern ignores that budget; its scan rate snaps to **12k** if
the profile rate is ≤ 18000 pps, otherwise **30k**.

Renderer push interval is **≤ 30 Hz**. Main coalesces in-flight pushes and
skips frames whose `contentKey` matches the last successful send.

## Helios USB

1. Plug in the DAC. Close other laser software that may claim the USB device.
2. Preset **Helios — USB (ILDA)**. Captivate scans VID/PID and opens the
   selected index.
3. Connect handshake: claim interface 0, alt setting 1, drain interrupt IN,
   firmware query (`0x04` → `0x84`), SDK version **11**, then open shutter.

Point packing matches the official Helios SDK `SendFrame`: 12-bit XY, 8-bit RGB,
intensity 255 (0 when blank). Max **4095** points. PPS clamped 1000–65535. If
`(pointCount - 45) % 64 === 0`, Captivate drops one point (USB framing quirk).
Identical consecutive USB payloads are not resent (on-device loop).

## Ether Dream TCP

Protocol: [ether-dream.com/protocol.html](https://ether-dream.com/protocol.html).

1. Set **Host** to the DAC IPv4/hostname (optional `:port`, default **7765**).
2. Connect waits for the initial 24-byte status. Playback: prepare (`p`), write
   points in chunks of **400** (`0x64`), begin (`0x62`) / update rate (`0x74`).
3. NAK Full (`0x46`) retries up to 80 times with a short delay.

PPS 1000–100000. Frames with fewer than **2** points are skipped. Same
`(n - 45) % 64 === 0` point-count tweak as Helios.

**“Auto discover” is not implemented.** Empty target or a value matching
`/^auto/i` throws *“Ether Dream needs a host or IP”*. Enter a concrete address.

## Generic UDP bridge (CAP1)

Not a formal ILDA file or IDN-Stream spec. Lab / custom receivers should parse:

| Offset | Field |
|--------|--------|
| 0–3 | Magic `CAP1` |
| 4 | Protocol: `1` = ILDA preset, `2` = IDN preset |
| 6–7 | Point count (uint16 LE), max **8000** |
| 8–11 | Point rate pps (uint32 LE), clamped 1000–200000 |
| then ×11 bytes | `x` int16, `y` int16 (Y flipped), `r,g,b` u8, blank u8, 3 reserved |

Default ports: **40200** (ILDA) and **40201** (IDN) when Target has no `:port`.
Empty / “Auto discover” throws *“Generic / UDP bridge needs a host”*.

Do not point Generic IDN at unmodified IDN-Stream hardware and expect
interoperability — use a CAP1 receiver or a translator.

## IPC

| Channel | Kind | Role |
|---------|------|------|
| `laser_dac_connect` | invoke | Open/replace a session |
| `laser_dac_disconnect` | invoke | Stop output, close transport (omit id = all) |
| `laser_dac_stop_output` | invoke | Halt without disconnect (Helios shutter) |
| `laser_dac_status` | invoke | Connected sessions + last error |
| `laser_dac_list_devices` | invoke | Helios USB scan only |
| `laser_dac_push_frame` | send | Frame payload (`pointRatePps` 100–200000; max 16000 points) |

Invalid connect payloads return `{ ok: false, message: "Invalid laser DAC connect payload." }` without throwing.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| `No Helios USB DAC found (VID 1209 / PID E500)` | Cable/power; other apps holding the device; rebuild native `usb` |
| Windows `NOT_SUPPORTED` / ACCESS / BUSY / timeout | WinUSB vs another driver; unplug/replug; quit other laser software |
| `Helios DAC did not respond to firmware query` | Unclean previous session; unplug USB and retry |
| `Ether Dream needs a host or IP` | Replace “Auto discover” with `192.168.x.x` |
| Ether Dream `NAK Full` / response timeout | DAC buffer overrun or unreachable host; lower scan rate / point count |
| `Helios IDN (network) mode is not wired` | Switch protocol to ILDA, or use Generic + IDN |
| Armed but no beam (Helios) | Confirm shutter opened after connect; disarm/reconnect |
| Armed but beam continues after PUSH TO STOP (Ether Dream / FB4 / UDP) | Disconnect the session — `stopOutput` is Helios-only |
| Network node ignores DAC calibration / scan rate | Expected — nodes use 30k pps and selected-profile power only |
| FB4 zone errors | [laser-fb4-beyond.md](laser-fb4-beyond.md) |
