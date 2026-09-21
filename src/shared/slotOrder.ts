import type { Window2D_t } from './window'
import type { Fixture } from './dmxFixtures'
import type { FlattenedFixture } from './dmxFixtures'
import type { LedFixture } from './ledFixtures'

/** Primary sweep axis for chase / randomizer slot order. */
export type SlotAxis = 'horizontal' | 'vertical'

export function normalizeSlotAxis(value: unknown): SlotAxis {
  return value === 'vertical' ? 'vertical' : 'horizontal'
}

export function windowCenterPos(window: Window2D_t | undefined): {
  x: number
  y: number
} {
  const x = Number.isFinite(window?.x?.pos) ? (window!.x!.pos as number) : 0.5
  const y = Number.isFinite(window?.y?.pos) ? (window!.y!.pos as number) : 0.5
  return { x, y }
}

/**
 * Horizontal: left → right, then top → bottom (high Y = top of pad).
 * Vertical: top → bottom, then left → right.
 */
export function compareSlotPositions(
  a: { x: number; y: number; index: number },
  b: { x: number; y: number; index: number },
  axis: SlotAxis
): number {
  if (axis === 'horizontal') {
    if (a.x !== b.x) return a.x - b.x
    if (a.y !== b.y) return b.y - a.y
    return a.index - b.index
  }
  if (a.y !== b.y) return b.y - a.y
  if (a.x !== b.x) return a.x - b.x
  return a.index - b.index
}

export function sortFlattenedBySlotAxis<T extends { window: Window2D_t }>(
  items: T[],
  axis: SlotAxis
): T[] {
  return items
    .map((item, index) => {
      const { x, y } = windowCenterPos(item.window)
      return { item, x, y, index }
    })
    .sort((a, b) => compareSlotPositions(a, b, axis))
    .map((row) => row.item)
}

export function sortUniverseBySlotAxis(
  fixtures: Fixture[],
  axis: SlotAxis
): Fixture[] {
  return fixtures
    .map((fixture, index) => {
      const { x, y } = windowCenterPos(fixture.window)
      return { fixture, x, y, index }
    })
    .sort((a, b) => compareSlotPositions(a, b, axis))
    .map((row) => row.fixture)
}

export function sortLedBySlotAxis(
  fixtures: LedFixture[],
  axis: SlotAxis
): LedFixture[] {
  return fixtures
    .map((fixture, index) => {
      const x = Number.isFinite(fixture.position?.x)
        ? fixture.position.x
        : 0.5
      const y = Number.isFinite(fixture.position?.y)
        ? fixture.position.y
        : 0.5
      return { fixture, x, y, index }
    })
    .sort((a, b) => compareSlotPositions(a, b, axis))
    .map((row) => row.fixture)
}

/** Representative FlattenedFixture used only for chase slot identity + intensity. */
export function universeFixtureToChaseSlot(
  fixture: Fixture,
  intensity = 0
): FlattenedFixture {
  const fixtureId =
    typeof fixture.id === 'string' && fixture.id.trim().length > 0
      ? fixture.id.trim()
      : undefined
  return {
    intensity,
    window: fixture.window,
    channels: [],
    groups: [...fixture.groups],
    fixtureId,
    fixtureTypeId: fixture.type,
    moverBounds: fixture.moverBounds,
    moverMountOrientation: fixture.moverMountOrientation,
    rotation: fixture.rotation,
  }
}
