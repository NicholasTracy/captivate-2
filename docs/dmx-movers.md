# DMX output and movers

How Captivate builds DMX universes, routes them to USB / Art-Net, and drives
moving-head pan/tilt (raw pad or optional kinematics).

## Architecture

```text
Realtime loop (~90 Hz)
  → DMX compute at configured output rate
  → calculateDmx (scenes → HTP / axis overrides → mixer)
  → AtmosphericsOutputManager.apply (fog / FX channels)
  → finalizeDmxUniverses (blackout + zero unpatched)
  → USB DMX devices and/or Art-Net UDP
```

Entry points:

| Layer | Path |
|-------|------|
| Engine tick / flush | `src/main/engine/engine.ts` |
| Universe frame build + mover aim | `src/main/engine/dmxEngine.ts` |
| Channel math / coarse–fine emit | `src/shared/dmxUtil.ts` |
| Pad targets / phase / modes | `src/shared/moverPadTargets.ts` |
| Order (row-major sequence) | `src/shared/moverOrdering.ts` |
| Bounds bilinear | `src/shared/moverBoundsMath.ts` |
| Kinematics IK + joint motion | `src/shared/moverKinematics.ts` |
| Movers page / pad | `src/renderer/pages/Movers.tsx`, `src/renderer/controls/XYAxisPad.tsx` |

Live 3D placement / color preview is a separate renderer, not an output path:
[Lighting 3D](lighting-3d.md).

## Universes and rates

| Constraint | Value |
|------------|--------|
| Channels per universe | 512 (`DMX_NUM_CHANNELS`) |
| Max universes | 16 (`DMX_MAX_UNIVERSES`) |
| Open DMX USB default rate | 30 Hz (UI range 5–40) |
| USB DMX Pro | 40 Hz |
| Art-Net send period | ~44 Hz (`1000/44` ms), UDP port `0x1936` (6454) |

## Movers: pad → DMX

### Basic (Advanced off)

Shared `xAxis` / `yAxis` → linear map through calibration min/max/invert → DMX.
No groups, modes, phase, or joint motion model.

### Advanced, group kinematics **off** (default)

Same raw linear map. On the pad, only **Mirror** is available as a pattern modifier
(L/R and/or T/B by group geometry). Follow Spot / Tandem / Phase params are ignored.

### Advanced, group kinematics **on** (per mover group)

```text
order fixtures → mode geometry (mirror / tandem)
  → ideal pan/tilt (corner map or pose IK)
  → sequential joint phase (optional pan/tilt)
  → joint motion (vel/accel averages)
  → coarse/fine emit
```

| Mode (`moverMode`) | Behavior |
|--------------------|----------|
| 0 Follow Spot | Shared floor UV; each head solves to that point |
| 1 Tandem | Floor (or pad) offset by layout · `moverSpread` (max **0.65**) |
| 2 Mirror | Mirror UV for right / bottom half |

**Phase** (optional split params): `moverPhasePan` / `moverPhaseTilt` (0–1 → 0–**45°**
on the last fixture in sequence). Applied as joint-angle offset **after** IK /
bounds so pure pan phase never shifts pad Y and pure tilt phase never shifts pad
X. Legacy `moverPhase` (if present) still drives both axes.

**Sequence**: auto top→bottom rows, left→right within row (`moverOrdering`);
overridable via `dmx.moverSequenceByFixtureId`.

**Solve**: calibrated `moverBounds` bilinear preferred; else pose IK from stage
placement + rotation + mount + calibration anchors. Follow Spot pad is **floor
UV**, not raw pan/tilt — off-center heads must pan when only pad Y moves.

### Joint motion (kinematics only)

Average-mover limits (degrees, converted with each axis `rangeDeg` / DMX span):

| Axis | Max velocity | Max acceleration |
|------|--------------|------------------|
| Pan  | ~210 °/s | ~1000 °/s² |
| Tilt | ~150 °/s | ~800 °/s² |

State is owned by `stepMoverJointMotion` — not a separate DMX path planner.

### Fine channels (16-bit axes)

Coarse owns travel. When fine is mapped:

| Situation | Fine |
|-----------|------|
| Travel / large residual | Parked at **mid-scale (half DMX, ~128)** |
| Micro residual near target (≈ ≤1 coarse step, low vel) | Sub-step correction |

### Follow Spot wizard

Movers page → Advanced → **Spot Wizard** for a group: for each fixture × corner
(TL, TR, BL, BR), aim with **pan/tilt** controls (live DMX override), then **Store**.
Values are saved into `moverBounds`. Completing enables kinematics for that group.

## Operator pitfalls

- **Fine mid while moving is intentional** (not 0).
- Raw mode has **no software motion smoothing** — hardware accel still applies.
- **Unpatched → 0.** Blackout zeros everything.
- Mount suffix `(Upright|Hung)` is only for runtime group identity; settings keys
  use the base group name.

## Related

- [Project files and autosave](PROJECTS.md)
- [Atmospherics](atmospherics.md)
