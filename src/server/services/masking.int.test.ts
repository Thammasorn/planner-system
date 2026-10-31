// X30 / MASK-7 skeleton: pure helpers (no DB rows needed); runs in the integration project with src/server/**.
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { isVisible, maskHidden, partitionByProject } from './masking'

const rows = [
  { projectId: 'p', v: 1 },
  { projectId: 'q', v: 2 },
  { projectId: 'q', v: 3 },
]
const sum = (h: readonly { v: number }[]) => h.reduce((s, r) => s + r.v, 0)

describe('masking skeleton (SPEC §3.3, X30)', () => {
  it('isVisible: ALL sees everything, a set sees its members', () => {
    expect(isVisible('ALL', 'x')).toBe(true)
    expect(isVisible(new Set(['p']), 'p')).toBe(true)
    expect(isVisible(new Set(['p']), 'q')).toBe(false)
  })

  it('partitionByProject splits rows by visibility, keeping order', () => {
    expect(partitionByProject(rows, new Set(['p']))).toEqual({
      visible: [rows[0]],
      hidden: [rows[1], rows[2]],
    })
    expect(partitionByProject(rows, 'ALL')).toEqual({ visible: rows, hidden: [] })
  })

  it('maskHidden folds hidden rows into one aggregate without ids or names', () => {
    const out = maskHidden(rows, new Set(['p']), sum)
    expect(out.visible).toEqual([rows[0]])
    expect(out.masked).toEqual({ kind: 'masked', label: th.masking.otherProjects, value: 5 })
    expect(JSON.stringify(out.masked)).not.toContain('q')
  })

  it('maskHidden returns masked = null when nothing is hidden', () => {
    expect(maskHidden(rows, 'ALL', sum)).toEqual({ visible: rows, masked: null })
    expect(maskHidden(rows, new Set(['p', 'q']), sum).masked).toBeNull()
  })
})
