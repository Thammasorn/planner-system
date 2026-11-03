// task-chips (v3.9 owner feedback): the chips after a task name collapse milestone label → late / blocker icons, and the
// name + chips box always ends inside the task column.
import { describe, expect, it } from 'vitest'
import { taskLeadLayout } from './row-layout'
import {
  CHIP_GAP_PX,
  chipsWidth,
  NAME_MIN_PX,
  TASK_PAD_RIGHT_PX,
  taskChipLevel,
  taskMainWidth,
  type ChipLevel,
  type TaskChips,
} from './task-chips'

const all: TaskChips = { ms: true, late: true, blocker: true }
const ACTIONS_W = 44 // ↗ + ⋯

describe('taskChipLevel', () => {
  it('unmeasured box → full chips', () => {
    expect(taskChipLevel(0, all)).toBe(0)
  })

  it('collapses in order: milestone label first, then late / blocker to icons', () => {
    const w0 = chipsWidth(all, 0)
    const w1 = chipsWidth(all, 1)
    const w2 = chipsWidth(all, 2)
    expect(w0).toBeGreaterThan(w1)
    expect(w1).toBeGreaterThan(w2)
    expect(taskChipLevel(w0, all)).toBe(0)
    expect(taskChipLevel(w0 - 1, all)).toBe(1)
    expect(taskChipLevel(w1, all)).toBe(1)
    expect(taskChipLevel(w1 - 1, all)).toBe(2)
    expect(taskChipLevel(10, all)).toBe(2)
  })

  it('without a milestone label it goes straight from full to icons', () => {
    const c: TaskChips = { ms: false, late: false, blocker: true }
    expect(taskChipLevel(chipsWidth(c, 0), c)).toBe(0)
    expect(taskChipLevel(chipsWidth(c, 0) - 1, c)).toBe(2)
  })

  it('a row with no chips never collapses anything visible', () => {
    expect(chipsWidth({ ms: false, late: false, blocker: false }, 2)).toBe(NAME_MIN_PX)
  })
})

// the box is flex 1 1 0 + overflow hidden and the cell clips at its edge: model its children left → right and check the
// last painted pixel stays inside the column
function rightmostEdge(colW: number, chips: TaskChips): { level: ChipLevel; edge: number } {
  const lead = taskLeadLayout(0, { check: true, handle: true })
  const boxX = 4 + lead.leadW + CHIP_GAP_PX
  const boxW = taskMainWidth(colW, lead.leadW, ACTIONS_W)
  const level = taskChipLevel(boxW, chips)
  const content = chipsWidth(chips, level)
  return { level, edge: boxX + Math.min(content, boxW) }
}

describe('task column at 200 / 320 px', () => {
  it.each([200, 320])('%i px: name + chips end before the actions and the column edge', (colW) => {
    const { edge } = rightmostEdge(colW, all)
    expect(edge).toBeLessThanOrEqual(colW - TASK_PAD_RIGHT_PX - ACTIONS_W - CHIP_GAP_PX)
  })

  it('320 px: everything fits once the chips are icons (level 2), not before', () => {
    const lead = taskLeadLayout(0, { check: true, handle: true })
    const boxW = taskMainWidth(320, lead.leadW, ACTIONS_W)
    expect(taskChipLevel(boxW, all)).toBe(2)
    expect(chipsWidth(all, 2)).toBeLessThanOrEqual(boxW)
    // milestone label only: it stays full at 320
    expect(taskChipLevel(boxW, { ms: true, late: false, blocker: false })).toBe(0)
  })

  it('200 px: icons, and the box (not the column) absorbs the rest', () => {
    expect(rightmostEdge(200, all).level).toBe(2)
    expect(taskMainWidth(200, 46, ACTIONS_W)).toBeLessThan(200)
  })

  it('a very narrow column never yields a negative box', () => {
    expect(taskMainWidth(40, 46, ACTIONS_W)).toBe(0)
  })
})
