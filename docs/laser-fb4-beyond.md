# Pangolin FB4 output (BEYOND SDK)

Captivate drives **Pangolin FB4** hardware through the official **BEYOND** application and **`BEYONDIO.dll`** (Windows only). There is no public direct FB4 wire protocol; BEYOND must be running and configured for your FB4 units.

For Helios USB, Ether Dream TCP, generic UDP, arming, and projection-zone merge, see **[Laser DAC output](laser-dac.md)**.

## Requirements

1. **Windows** (same platform as Captivate’s main process).
2. **Pangolin BEYOND** installed and launched before arming laser output.
3. **`BEYONDIO.dll`** from your BEYOND install (not redistributed with Captivate—copy locally if needed).

## Setup

1. In **Laser → DAC profiles**, set **Backend** to **FB4**.
2. **Target** (optional):
   - Leave empty to search common Pangolin install paths and `CAPTIVATE_BEYOND_SDK_DLL`.
   - Or set the full path to `BEYONDIO.dll`, e.g. `C:\Program Files\Pangolin\Beyond\BEYONDIO.dll`.
3. Define **projection zones** on the profile; fixture routes assign each unit to a zone.
4. Zone order in the profile maps to **BEYOND zone index** (0-based): first zone → BEYOND zone 0, etc.
5. Connect the DAC session, arm safety, and stream.

## Behaviour

- On connect: `ldbCreate` → wait for `ldbBeyondExeReady` → `ldbEnableLaserOutput`.
- Each Captivate zone gets a BEYOND zone image (`Captivate_<session>_Z<n>`) and frames are sent with `ldbSendFrameToImage` (no merged composite for FB4).
- Helios / Ether Dream / generic UDP profiles still merge overlapping zones into one ILDA stream ([laser-dac.md](laser-dac.md)).
- FB4 `Fb4Transport` has no `stopOutput`; **PUSH TO STOP** only stops Captivate from sending frames. Disconnect to `ldbDisableLaserOutput`.

## Environment

| Variable | Purpose |
|----------|---------|
| `CAPTIVATE_BEYOND_SDK_DLL` | Full path to `BEYONDIO.dll` when auto-search fails |

## Troubleshooting

| Symptom | Check |
|---------|--------|
| `BEYONDIO.dll not found` | Set Target or `CAPTIVATE_BEYOND_SDK_DLL` |
| `BEYOND is not ready` | Start BEYOND and wait until fully loaded |
| `ldbCreateZoneImage failed` | BEYOND zone count vs. your Captivate zone indices |
| No laser light | FB4 Ethernet/QS mode in BEYOND; ILDA daughterboard is pass-through only |
