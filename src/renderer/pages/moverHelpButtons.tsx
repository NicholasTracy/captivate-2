import SectionHelpButton, {
  FieldHelpButton,
  HelpIntro,
  HelpList,
  HelpTitle,
} from '../base/SectionHelpPopover'

export function MoverGroupsHelpButton() {
  return (
    <SectionHelpButton ariaLabel="How movers work">
      <HelpTitle>How movers work</HelpTitle>
      <HelpIntro>
        In basic mode, the pan/tilt pad aims each fixture directly with raw DMX.
        Advanced unlocks groups, calibration, kinematics, and the dance floor map.
      </HelpIntro>
      <HelpList>
        <li>
          <strong>Advanced</strong> unlocks renaming groups, calibration, corner
          bounds, sequence numbers, and kinematics.
        </li>
        <li>
          <strong>Kinematics</strong> (per group) enables Follow Spot / Tandem and
          velocity-limited joint motion from corner or pose aim.
        </li>
        <li>
          List colors match the floor map dots so you can tell fixtures apart at a
          glance.
        </li>
        <li>
          <strong>Upright</strong> / <strong>Hung</strong> should match how the fixture
          is mounted on the truss.
        </li>
      </HelpList>
    </SectionHelpButton>
  )
}

export function DanceFloorMapHelpButton() {
  return (
    <SectionHelpButton ariaLabel="How the dance floor map works">
      <HelpTitle>How the dance floor map works</HelpTitle>
      <HelpIntro>
        Stage plan of every mover: solid dot = fixture placement position (same
        color as the list); larger glow = estimated floor aim when corner bounds are
        calibrated.
      </HelpIntro>
      <HelpList>
        <li>
          With fixture depth off, dots use placement <strong>X / Y</strong>. With
          depth on, the map is a true <strong>top-down X / Z</strong> plan (width ×
          depth), matching fixture placement.
        </li>
        <li>
          Back of stage is at the top; audience is at the bottom (same orientation as
          the placement map).
        </li>
        <li>
          Corner bounds (Spot Wizard or Bound Area Corners) make floor spots accurate.
          Without them only placement dots show.
        </li>
      </HelpList>
    </SectionHelpButton>
  )
}

export function MoverCalibrationDialogHelpButton() {
  return (
    <FieldHelpButton ariaLabel="How mover calibration works">
      Set pan/tilt channel values and how far the head can physically move. Corner
      bounds tie the scene pad to spots on the floor. Click a field to send that
      value to the selected fixture while you aim it.
    </FieldHelpButton>
  )
}

export function MountOrientationHelpButton() {
  return (
    <FieldHelpButton ariaLabel="How mount orientation works">
      Pick upright or hung to match the rig. Hung fixtures use different tilt labels
      — aim at the ceiling or floor references while you calibrate.
    </FieldHelpButton>
  )
}

export function PanCalibrationHelpButton() {
  return (
    <FieldHelpButton ariaLabel="How pan calibration works">
      Min/Max limit how far pan can travel. Front/Back are aim points on stage. Home
      is where the head rests. Range is total degrees of movement. Reverse swaps
      which way pan increases.
    </FieldHelpButton>
  )
}

export function TiltCalibrationHelpButton() {
  return (
    <FieldHelpButton ariaLabel="How tilt calibration works">
      Same idea as pan, with forward and up/down references. Point the fixture at
      each reference while you enter values.
    </FieldHelpButton>
  )
}

export function BoundCornersHelpButton() {
  return (
    <FieldHelpButton ariaLabel="How bound corners work">
      Per fixture: pan/tilt at each corner of the floor area. When floor bounds are
      locked, the scene pad moves within this rectangle.
    </FieldHelpButton>
  )
}

export function MoverFloorBoundsHelpButton() {
  return (
    <FieldHelpButton ariaLabel="Floor bounds vs free aim">
      Locked: the pad aims within your calibrated floor area (set corners on the
      Movers page). Free aim: the pad maps straight to the fixture&apos;s physical
      limits.
    </FieldHelpButton>
  )
}

export function MoverPatternHelpButton() {
  return (
    <FieldHelpButton ariaLabel="How mover patterns work">
      With group kinematics off: shared raw pad → DMX, optional Mirror only. With
      kinematics on: Follow Spot aims every head at the same floor point (pad is
      floor UV, not raw pan/tilt — a pure tilt-axis sweep can still need pan when
      the head is not above that UV). Tandem spreads floor targets; Mirror flips
      about the group. Add Pan Phase / Tilt Phase as split params for sequential
      joint stagger (up to 45° on the last head).
    </FieldHelpButton>
  )
}
