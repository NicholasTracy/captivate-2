import { clampNormalized } from '../math/util'

export type MoverOrderEntry = {
  key: string
  x: number
  y: number
  sortOrder?: number
  sequenceOverride?: number
}

export type OrderedMoverEntry<T extends MoverOrderEntry = MoverOrderEntry> = T & {
  sequenceIndex: number
}

/**
 * Stage pad: higher y ≈ upstage/top. Order top→bottom rows, left→right within row.
 * Rows are clustered by y proximity; optional sequenceOverride forces a fixed rank.
 */
export function orderMoverFixtures<T extends MoverOrderEntry>(
  entries: ReadonlyArray<T>
): OrderedMoverEntry<T>[] {
  if (entries.length === 0) {
    return []
  }

  const hasAnyOverride = entries.some(
    (entry) => entry.sequenceOverride !== undefined && Number.isFinite(entry.sequenceOverride)
  )

  if (hasAnyOverride) {
    const autoRanked = orderMoverFixturesByLayout(entries)
    const autoIndexByKey = new Map(
      autoRanked.map((entry, index) => [entry.key, index] as const)
    )
    const sorted = [...entries].sort((left, right) => {
      const leftOverride =
        left.sequenceOverride !== undefined && Number.isFinite(left.sequenceOverride)
          ? Number(left.sequenceOverride)
          : Number.POSITIVE_INFINITY
      const rightOverride =
        right.sequenceOverride !== undefined && Number.isFinite(right.sequenceOverride)
          ? Number(right.sequenceOverride)
          : Number.POSITIVE_INFINITY
      if (leftOverride !== rightOverride) {
        return leftOverride - rightOverride
      }
      const leftAuto = autoIndexByKey.get(left.key) ?? 0
      const rightAuto = autoIndexByKey.get(right.key) ?? 0
      if (leftAuto !== rightAuto) {
        return leftAuto - rightAuto
      }
      return (left.sortOrder ?? 0) - (right.sortOrder ?? 0)
    })
    return sorted.map((entry, sequenceIndex) => ({
      ...entry,
      sequenceIndex,
    }))
  }

  return orderMoverFixturesByLayout(entries)
}

function orderMoverFixturesByLayout<T extends MoverOrderEntry>(
  entries: ReadonlyArray<T>
): OrderedMoverEntry<T>[] {
  if (entries.length === 0) {
    return []
  }

  const normalized = entries.map((entry) => ({
    ...entry,
    x: clampNormalized(entry.x),
    y: clampNormalized(entry.y),
  }))

  // Cluster into rows by y (top = high y first).
  const byYDesc = [...normalized].sort((left, right) => {
    if (right.y !== left.y) return right.y - left.y
    if (left.x !== right.x) return left.x - right.x
    return (left.sortOrder ?? 0) - (right.sortOrder ?? 0)
  })

  const rowEpsilon = Math.max(
    0.04,
    medianGap(
      byYDesc.map((entry) => entry.y).sort((a, b) => a - b)
    ) * 0.55
  )

  const rows: Array<typeof normalized> = []
  for (const entry of byYDesc) {
    const lastRow = rows[rows.length - 1]
    if (lastRow === undefined) {
      rows.push([entry])
      continue
    }
    const rowY =
      lastRow.reduce((sum, item) => sum + item.y, 0) / Math.max(1, lastRow.length)
    if (Math.abs(entry.y - rowY) <= rowEpsilon) {
      lastRow.push(entry)
    } else {
      rows.push([entry])
    }
  }

  const ordered: typeof normalized = []
  for (const row of rows) {
    ordered.push(
      ...[...row].sort((left, right) => {
        if (left.x !== right.x) return left.x - right.x
        return (left.sortOrder ?? 0) - (right.sortOrder ?? 0)
      })
    )
  }

  return ordered.map((entry, sequenceIndex) => ({
    ...entry,
    sequenceIndex,
  }))
}

function medianGap(sortedValues: number[]): number {
  if (sortedValues.length < 2) {
    return 0.08
  }
  const gaps: number[] = []
  for (let i = 1; i < sortedValues.length; i++) {
    const gap = Math.abs(sortedValues[i] - sortedValues[i - 1])
    if (gap > 1e-6) {
      gaps.push(gap)
    }
  }
  if (gaps.length === 0) {
    return 0.08
  }
  gaps.sort((a, b) => a - b)
  return gaps[Math.floor(gaps.length / 2)] ?? 0.08
}

/** Base group name without (Upright|Hung) mount suffix used in flatten. */
export function baseMoverGroupName(groupName: string): string {
  return groupName.trim().replace(/\s+\((Upright|Hung)\)$/i, '')
}
