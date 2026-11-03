import { describe, expect, it } from 'vitest'
import { CARET_W, LEVEL_PX, taskLeadLayout } from './row-layout'

describe('taskLeadLayout (v3.9 indent fix)', () => {
  const full = { check: true, handle: true }

  it('top level: [☐ 4..20][⠿ 20..34][caret 34..50] name at 54 — the caret slot is the only gap after ⠿', () => {
    const l = taskLeadLayout(0, full)
    expect(l).toMatchObject({ checkX: 4, handleX: 20, indentW: 0, caretX: 34, nameX: 54 })
    expect(l.nameX - (l.handleX + 14)).toBe(CARET_W + 4)
  })

  it('each level adds exactly one step; the gutter does not move', () => {
    const a = taskLeadLayout(0, full)
    const b = taskLeadLayout(1, full)
    const c = taskLeadLayout(2, full)
    expect(b.nameX - a.nameX).toBe(LEVEL_PX)
    expect(c.nameX - b.nameX).toBe(LEVEL_PX)
    expect(c.handleX).toBe(a.handleX)
    expect(c.checkX).toBe(a.checkX)
  })

  it('leaf and parent siblings share x (the caret slot is reserved either way)', () => {
    expect(taskLeadLayout(1, full).nameX).toBe(taskLeadLayout(1, full).caretX + CARET_W + 4)
  })

  it('without the select / drag gutter (read-only, person grid) names start right after the caret slot', () => {
    expect(taskLeadLayout(0, { check: false, handle: false })).toMatchObject({ caretX: 4, nameX: 24 })
    expect(taskLeadLayout(0, { check: false, handle: true })).toMatchObject({ handleX: 4, caretX: 18, nameX: 38 })
  })

  it('leadW spans the gutter, the indent and the caret slot', () => {
    expect(taskLeadLayout(2, full).leadW).toBe(16 + 14 + 32 + 16)
  })
})
