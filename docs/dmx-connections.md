# DMX connections (USB and Art-Net)

How Captivate chooses which universes exist, which USB adapter sends each one,
and where Art-Net packets go. Universe **contents** (scenes, movers, blackout,
unpatched zeros) are built before this step. See
[DMX output and movers](dmx-movers.md).

## Architecture

```text
Realtime loop (~90 Hz)
  → calculateDmx for universes 1..universeCount
  → USB send loop (per adapter, its assigned universe)
  → Art-Net send loop (~44 Hz, one ArtDmx per universe that has a target IP)
```

USB ports are rescanned every **1000 ms**. Art-Net does not wait for that scan;
its UDP timer starts with the engine.

| Layer | Path |
|-------|------|
| Connections dialog | `src/renderer/overlays/Devices.tsx` |
| Universe count, routes, USB assignment | `src/renderer/redux/deviceState.ts` (`connectionSettings`) |
| Port filter | `src/main/engine/connections/dmx/DmxDevice_t.ts` |
| USB open / protocol | `src/main/engine/connections/dmx/DmxConnectionUsb.ts` |
| Enttec widget framing | `src/main/engine/connections/dmx/DmxUsbPro.ts` |
| Open DMX break framing | `src/main/engine/connections/dmx/OpenDmxUsb.ts` |
| ArtDmx packet + send | `src/main/engine/connections/art-net/ArtNetManager.ts`, `artNetBuffers.ts` |
| Compute-rate helper | `src/shared/dmxOutputRate.ts` |

Settings live in the project’s **Serial Device Settings** section
([project files](PROJECTS.md)), not in the `.cfx` fixture file.

## Universe count

**Connections → Universe Count** is `connectionSettings.universeCount`, clamped
to **1–16** (`DMX_MAX_UNIVERSES`).

That number is the output width:

- `calculateDmx` builds one 512-channel buffer per universe in `1..universeCount`.
- The patch page, mixer, USB universe fields, and Art-Net rows use the same count.
- A fixture whose `fixture.universe` is **above** the count is left out of those
  buffers. Lowering the count does not rewrite patches.

Lowering the count **clamps** existing USB assignments and Art-Net routes into
`1..newCount`. Routes are applied in ascending universe order, so if universe 1
and universe 2 both land on universe 1, universe 2’s IP is the one that remains.
Enabled USB adapters stay enabled; they are not turned off, they just move down
to the new maximum.

## USB adapters

### Which ports are listed

A serial port is listed only when its USB product id is `6001` and its vendor id
is empty or `0403` (FTDI, the id used by Enttec DMX USB Pro, Euro Light USB Pro,
and many clones). Anything else is omitted from the device list.

**Connections → DMX → Troubleshoot** still lists every serial port (path, vendor,
product, serial) and can copy that JSON. Use it when an adapter never appears.

### Enable and assign

Click an adapter to toggle `device.connectable.dmx`. Each enabled id is assigned
`dmxUniverseByDevice[connectionId]`, default **1**, clamped to the universe count.
The adapter sends `dmxOutByUniverse[assigned - 1]`.

Several adapters may be enabled. Two adapters on the same universe each send
that same frame. USB and Art-Net can both carry one universe at the same time.

The connection id is the USB **serial number** when the OS reports one, otherwise
the port path. A serial number survives replug. A path-only id does not: a new
COM port shows up as a new, disabled adapter, and the old id can stay in
`connectable.dmx`. The list only shows adapters that are present, so that stale
id has no row to click. While it remains, the status-bar **dmx** dot stays amber
(“enabled but not open”) even if the list is empty. Plug that same path again
and click the row to disable it, or load a project with Serial Device Settings
applied that does not list the old id. Unchecking that section on load keeps
the in-memory ids.

The status-bar **dmx** dot follows USB only (`gui.dmx.connected` vs
`connectable.dmx`). Art-Net traffic does not turn it green. Red means no USB id
is enabled. Amber means at least one enabled id is not currently open. Green
means at least one enabled adapter is open.

### Protocol

On open, Captivate sends one Enttec **Get Widget Parameters** (`0x7E`, label
`0x03`) and waits **300 ms** for a widget frame (`0x7E` … `0xE7`).

| Result | Wire format | Rate |
|--------|-------------|------|
| Reply matches | Enttec USB Pro label `0x06`, start code `0x00` + 512 bytes | **40 Hz** fixed |
| No reply | Open DMX: 1 ms break, 1 ms mark, then 513 bytes (start code `0` + 512 channels) | `openDmxRefreshRateHz`, default **30**, UI **5–40** |

**USB Pro protocol** skips the probe and forces widget framing. Changing that
toggle closes the port and opens it again. The Open DMX rate slider is one
global value; it appears only when a listed adapter is currently typed as Open
DMX, and USB Pro output ignores it.

## Art-Net

For each universe `1..universeCount`, enter a destination in
`artNetIpByUniverse`. The send loop runs about every **22.7 ms** (`1000/44`),
UDP port **6454** (`0x1936`).

A route is used only when it is an IPv4 address (`toIpBuffer`). Hostnames are
stored if you type them and then skipped on send. An empty field deletes that
universe’s route.

| Captivate universe | ArtDmx Sub-Uni | Net | Port-address |
|--------------------|----------------|-----|--------------|
| 1 | 0 | 0 | 0 |
| 2 | 1 | 0 | 1 |
| N (max 16) | N − 1 | 0 | N − 1 |

Packets are ArtDmx, protocol version 14, physical port 0, length 512, sequence
**1–255** (wraps to 1). The socket is not bound to port 6454 and is not put in
broadcast mode. The send loop transmits **ArtDmx only**. `artPollBuffer` and
`artPollReplyBuffer` have no caller, and `POLL_PERIOD_MS` is unused. A node that
waits for ArtPoll before it accepts DMX will stay dark.

### Legacy single IP

Older saves may still have `device.connectable.artNet[0]`. The connections UI
does not write that list. On load, if the per-universe table is empty and that
legacy IP is set, Captivate copies it onto every universe in range. The legacy
string is left in place. After that, a universe whose route was cleared still
sends to `connectable.artNet[0]` (`route ?? legacy`). New projects start with
an empty legacy list, so a blank route stays off.

## Compute rate vs wire rate

Scene math is recomputed on a slower clock than the 90 Hz realtime tick. The
interval comes from `getConfiguredDmxOutputRateHz`:

| Input | Effect on compute rate |
|-------|------------------------|
| `openDmxRefreshRateHz` (default 30) | Floor, even when no Open DMX adapter is open |
| Any id in `connectable.dmx` | At least **40 Hz** |
| Non-empty `connectable.artNet[0]` | At least **~44 Hz** |

Per-universe Art-Net IPs do **not** change this helper. With only those routes
filled, compute stays at the Open DMX slider (30 Hz unless you move it) while
ArtDmx still goes out at ~44 Hz, repeating the last frame. Enabling a USB
adapter raises compute to at least 40 Hz even if that adapter’s Open DMX slider
is lower; the widget or break loop keeps its own rate from the table above.

## Operator pitfalls

- **Node universe 1 is often port-address 0.** Captivate universe 1 is Sub-Uni
  0. A node set to port-address 1 listens on Captivate universe 2.
- **dmx dot red while fixtures respond.** Art-Net is running. The dot is USB
  state.
- **Adapter missing from the list.** Product id is not `6001`, or vendor id is
  present and not `0403`. Check Troubleshoot before changing the fixture patch.
- **Clone flashes or stays dark.** Probe failed, so framing is Open DMX. Turn on
  **USB Pro protocol** for that port and let it reconnect.
- **Blank Art-Net field still sends.** A legacy `connectable.artNet[0]` is the
  fallback for missing routes. New projects do not have that fallback.
- **Broadcast address.** The UDP socket never enables broadcast. A send error
  closes the socket and opens a new one on the next tick.
- **Count lowered, a universe went dark.** Patches above the new count are not
  moved, and clamped Art-Net routes can overwrite the IP that used to be on
  universe 1.

## Related

- [DMX output and movers](dmx-movers.md)
- [Project files and autosave](PROJECTS.md)
- [WLED fixtures](wled-fixtures.md) — network LED output, separate from these universes
- [MIDI and keyboard mapping](midi-mapping.md) — the same Connections dialog
