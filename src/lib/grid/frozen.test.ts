import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  ASSIGNEE_W,
  ASSIGNEE_W_PHONE,
  clampTaskWidth,
  FROZEN_SHARE_DEN,
  FROZEN_SHARE_NUM,
  frozenWidths,
  isPhoneWidth,
  nudgeWidth,
  RESIZE_STEP,
  RESIZE_STEP_BIG,
  TASK_W_DEFAULT,
  TASK_W_MAX,
  TASK_W_MIN,
  TASK_W_MIN_PHONE,
} from './frozen'

describe('constants (FR-814/816)', () => {
  it('match SPEC', () => {
    expect([TASK_W_DEFAULT, TASK_W_MIN, TASK_W_MIN_PHONE, TASK_W_MAX]).toEqual([240, 160, 120, 640])
    expect([ASSIGNEE_W, ASSIGNEE_W_PHONE, RESIZE_STEP, RESIZE_STEP_BIG]).toEqual([112, 72, 16, 64])
    expect(FROZEN_SHARE_NUM / FROZEN_SHARE_DEN).toBe(0.6)
  })
})

describe('frozenWidths (M7.1-D8)', () => {
  it('0 (unmeasured) → defaults', () => {
    expect(frozenWidths(0, TASK_W_DEFAULT, true)).toEqual({ task: 240, assignee: 112 })
    expect(frozenWidths(0, undefined, true)).toEqual({ task: 240, assignee: 112 })
    expect(frozenWidths(0, Number.NaN, false)).toEqual({ task: 240, assignee: 0 })
  })
  it('unmeasured keeps the preference within 160–640', () => {
    expect(frozenWidths(0, 420, true).task).toBe(420)
    expect(frozenWidths(0, 9999, true).task).toBe(640)
    expect(frozenWidths(0, 10, true).task).toBe(160)
  })
  it('390 px phone → task ≥ 120, assignee 72 and frozen ≤ 60 %', () => {
    const w = frozenWidths(390, 240, true)
    expect(w.assignee).toBe(72)
    expect(w.task).toBeGreaterThanOrEqual(120)
    expect(w.task + w.assignee).toBeLessThanOrEqual(390 * 0.6)
  })
  it('phone with assignees hidden → assignee 0', () => {
    expect(frozenWidths(390, 240, false)).toEqual({ task: 234, assignee: 0 })
  })
  it('2560 px + pref 640 → 640', () => {
    expect(frozenWidths(2560, 640, true)).toEqual({ task: 640, assignee: 112 })
  })
  it('1280 px + pref 420 → 420 (AC-808)', () => {
    expect(frozenWidths(1280, 420, true).task).toBe(420)
  })
  it('the 60 % cap wins over the preference on narrow desktops', () => {
    expect(frozenWidths(700, 640, true)).toEqual({ task: 420 - 112, assignee: 112 })
  })
  it('the minimum wins over the 60 % cap on a very narrow grid', () => {
    expect(frozenWidths(150, 240, true).task).toBe(120)
    expect(frozenWidths(320, 240, true, false).task).toBe(160)
  })
  it('explicit phone flag overrides the width heuristic', () => {
    expect(frozenWidths(1000, 240, true, true).assignee).toBe(72)
    expect(isPhoneWidth(599)).toBe(true)
    expect(isPhoneWidth(600)).toBe(false)
    expect(isPhoneWidth(0)).toBe(false)
  })
  it('property: integer widths, within bounds, frozen ≤ 60 % unless the minimum forces more', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4000 }), fc.integer({ min: 0, max: 2000 }), fc.boolean(), (gw, pref, show) => {
        const { task, assignee } = frozenWidths(gw, pref, show)
        const min = isPhoneWidth(gw) ? TASK_W_MIN_PHONE : TASK_W_MIN
        expect(Number.isInteger(task)).toBe(true)
        expect(task).toBeGreaterThanOrEqual(min)
        expect(task).toBeLessThanOrEqual(TASK_W_MAX)
        if (task > min) expect((task + assignee) * FROZEN_SHARE_DEN).toBeLessThanOrEqual(gw * FROZEN_SHARE_NUM)
      }),
    )
  })
})

describe('clampTaskWidth', () => {
  it('rounds and clamps', () => {
    expect(clampTaskWidth(300.6, 1280, true)).toBe(301)
    expect(clampTaskWidth(100, 1280, true)).toBe(160)
    expect(clampTaskWidth(100, 390, true)).toBe(120)
    expect(clampTaskWidth(9000, 2560, false)).toBe(640)
  })
})

describe('nudgeWidth (keyboard separator)', () => {
  it('←/→ ±16, Shift ±64', () => {
    expect(nudgeWidth(240, 'ArrowRight', false)).toBe(256)
    expect(nudgeWidth(240, 'ArrowLeft', false)).toBe(224)
    expect(nudgeWidth(240, 'ArrowRight', true)).toBe(304)
    expect(nudgeWidth(240, 'ArrowLeft', true)).toBe(176)
  })
  it('→ five times = +80 (AC-808)', () => {
    let w = 240
    for (let i = 0; i < 5; i++) w = nudgeWidth(w, 'ArrowRight', false)!
    expect(w).toBe(320)
  })
  it('Home/End = min/max, Enter = 240, other keys → null', () => {
    expect(nudgeWidth(300, 'Home', false)).toBe(TASK_W_MIN)
    expect(nudgeWidth(300, 'End', false)).toBe(TASK_W_MAX)
    expect(nudgeWidth(300, 'Enter', false)).toBe(TASK_W_DEFAULT)
    expect(nudgeWidth(300, 'a', false)).toBeNull()
  })
})
