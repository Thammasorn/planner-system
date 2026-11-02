// src/lib/grid/chart-geometry.ts — the column geometry the กราฟภาระ chart and its table share with the plan grid
// (SPEC FR-813, §8.13; owner feedback 2026-11-02 "week misalignment", PROGRESS Decisions M7.1-D30). Pure.
// The grid's column virtualizer places period column i at `start` = frozen width (task + assignee) + cols[i].offset in
// the scroller's content coordinates. The chart pane renders below the grid in a scroller of the same content width
// whose scrollLeft is kept equal to the grid's, so a slot's `left` / `width` here are exactly the pixels of the grid's
// header cell. Weekly values (FR-813: weekly even in day zoom) sit on the week's value column: the week column of a
// collapsed week, the "รวม" (weekTotal) column of an expanded one; day columns are columns of the chart (gridlines,
// month lines) without a point.
import type { ISODate, PeriodKey } from '@/domain/types'
import type { GridColumn } from './columns'

/** One rendered column of the virtualizer (TanStack VirtualItem subset). */
export interface RenderedColumn {
  index: number
  start: number
  size: number
}

/** A rendered period column in content coordinates (px from the scroller's content left edge). */
export interface PeriodSlot {
  index: number
  key: PeriodKey
  role: GridColumn['role']
  weekStart: ISODate
  date: ISODate
  left: number
  width: number
}

/** The grid's rendered columns, in order, with the virtualizer's own x positions (never recomputed). */
export function periodSlots(cols: readonly GridColumn[], rendered: readonly RenderedColumn[]): PeriodSlot[] {
  const out: PeriodSlot[] = []
  for (const v of rendered) {
    const c = cols[v.index]
    if (!c) continue
    out.push({
      index: v.index,
      key: c.key,
      role: c.role,
      weekStart: c.weekStart,
      date: c.date,
      left: v.start,
      width: v.size,
    })
  }
  return out
}

export const slotCenter = (s: PeriodSlot): number => s.left + s.width / 2
export const slotRight = (s: PeriodSlot): number => s.left + s.width

/** The column that carries a week's value: a collapsed week, or the "รวม" column of an expanded week. */
export const isValueSlot = (s: PeriodSlot): boolean => s.role !== 'day'

/** The value slots of the rendered window, in order (one per week whose value column is rendered). */
export function valueSlots(slots: readonly PeriodSlot[]): PeriodSlot[] {
  return slots.filter(isValueSlot)
}

/** The weeks the chart and the table show: exactly the weeks whose value column the grid renders. */
export function slotWeeks(slots: readonly PeriodSlot[]): ISODate[] {
  return valueSlots(slots).map((s) => s.weekStart)
}

/** The slot under content-x `x` (left edge inclusive), or null. */
export function slotAt(slots: readonly PeriodSlot[], x: number): PeriodSlot | null {
  let lo = 0
  let hi = slots.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const s = slots[mid]!
    if (x < s.left) hi = mid - 1
    else if (x >= slotRight(s)) lo = mid + 1
    else return s
  }
  return null
}

/** The value slot of the week of `slot` (a day column → its week's "รวม" column when rendered), or null. */
export function valueSlotOf(slots: readonly PeriodSlot[], slot: PeriodSlot): PeriodSlot | null {
  if (isValueSlot(slot)) return slot
  return slots.find((s) => isValueSlot(s) && s.weekStart === slot.weekStart) ?? null
}

/** A y scale from 0 to a "nice" maximum with ~`target` ticks (steps 1 / 2 / 2.5 / 5 × 10ⁿ). Display values only. */
export function niceScale(maxValue: number, target = 4): { max: number; ticks: number[] } {
  const m = Number.isFinite(maxValue) && maxValue > 0 ? maxValue : 1
  const raw = m / target
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = ([1, 2, 2.5, 5, 10].find((f) => f * pow >= raw) ?? 10) * pow
  const n = Math.ceil(m / step - 1e-9)
  const ticks: number[] = []
  for (let i = 0; i <= n; i++) ticks.push(Math.round(i * step * 1e6) / 1e6)
  return { max: ticks[ticks.length - 1]!, ticks }
}

/** y pixel of `v` in a plot of `height` px whose top is `top`, scale 0…max. */
export function yOf(v: number, max: number, top: number, height: number): number {
  return top + height - (max > 0 ? (v / max) * height : 0)
}

/** SVG path through the points in order; a null y breaks the line (a gap, never 0 — M7.1-D5). */
export function linePath(points: readonly { x: number; y: number | null }[]): string {
  let d = ''
  let pen = false
  for (const p of points) {
    if (p.y === null) {
      pen = false
      continue
    }
    d += `${pen ? 'L' : 'M'}${round(p.x)} ${round(p.y)}`
    pen = true
  }
  return d
}

const round = (v: number) => Math.round(v * 10) / 10
