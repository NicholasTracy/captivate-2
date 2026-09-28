# Smart fixture groupings

Assign DMX fixtures to named groups from their stage-map positions, then
optionally add a split for each new group. Open it from the Universe map:
**Smart groupings…** (disabled until at least one fixture is patched).

The dialog only previews a plan. **Apply** writes `fixture.groups` and, when
checked, creates splits. LED fixtures are not in this universe list and are
left unchanged.

## Methods

| Method | How fixtures are bucketed |
|--------|---------------------------|
| Quadrants | X at **0.5**: left if `< 0.5`, otherwise right. Y at **0.5**: front if `< 0.5`, otherwise back. Names like `Front Left`. |
| Even / odd | Sort along the chosen axis (low → high, then universe index). First is **Even**, then **Odd**. |
| Ordered strips | 2–8 bins across normalized 0–1. Position `1` stays in the last bin. |

Axis choices are X (left → right), Y (front → back), and Z (low → high). Z is
available only when Z depth is enabled. Quadrants ignore the axis control.

Unset map positions use the placement defaults: X and Y at **0.5**, Z at **1**.
A fixture that was never dragged therefore lands on the quadrant boundary
(right / back) and in the middle of an X or Y strip layout.

## Names

- Optional **name prefix**. If you leave it blank while scoped to a group, the
  parent group name is the prefix. Names look like `Wash · Front Left`.
- Reserved names are suffixed with ` Zone`: `movers`, `atmosphere`,
  `visualizer`, `all`, `leds`, `pixels` (case-insensitive).

## Scope

| Apply to | Effect |
|----------|--------|
| All patched fixtures | Every universe fixture is assigned. |
| Fixtures already in a group | Others are counted as outside scope and skipped. |

**Keep and add subgroups** leaves the parent name on the fixture and adds the
new bucket. **Replace with subgroups** removes that parent name, then adds the
bucket. Other group names on the fixture stay.

## Scene splits

**Create dedicated splits for the new groups** is on by default.

| Target | Behavior |
|--------|----------|
| Active light scene only | One split per new group on the active scene. |
| Every light scene | Same insert on each light scene. |

A split is reused only when that group is already `true` on it. A group set to
`false`, or missing, gets a new split. Apply does not delete splits or rewrite
modulation.

## Operator pitfalls

- **Apply is not undo-special.** It is a normal fixture-group edit on the DMX
  universe (and split inserts). Reload the project to discard unsaved changes.
- **Boundary fixtures.** Exactly `0.5` is right and back, not left and front.
- **Empty scope.** Apply stays disabled when the preview has no assignments
  (no fixtures, or none in the source group).
- **LED / WLED.** This planner does not read LED fixture positions.

## Codepaths

| Role | Path |
|------|------|
| Plan | `src/shared/smartFixtureGroupings.ts` (`planSmartFixtureGroupings`) |
| Dialog | `src/renderer/dmx/SmartFixtureGroupingsModal.tsx` |
| Map button + apply | `src/renderer/dmx/FixturePlacement.tsx` |
| Split insert | `src/renderer/redux/controlSlice.ts` (`ensureSplitScenesForGroups`) |

## Related

- [Group intensity](group-intensity.md) — ceilings for the groups this creates
- [Split envelopes](split-envelopes.md) — chase order uses placement, not these names
- [Scene generation](scene-generation.md) — builds scenes from the current rig
