import { describe, expect, it } from 'vitest'
import { isPageIcon, PAGE_ICONS } from './icons'

describe('PAGE_ICONS', () => {
  it('has exactly 60 unique entries', () => {
    expect(PAGE_ICONS).toHaveLength(60)
    expect(new Set(PAGE_ICONS).size).toBe(60)
  })

  it('includes the template and required icons', () => {
    for (const icon of ['📋', '📝', '📘', '📄', '📁', '📌', '✅', '🔒', '💡', '📊', '📅', '🗂️'])
      expect(PAGE_ICONS, icon).toContain(icon)
  })

  it('every entry is one grapheme', () => {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    for (const icon of PAGE_ICONS) expect([...seg.segment(icon)], icon).toHaveLength(1)
  })

  it('isPageIcon guards unknown values', () => {
    expect(isPageIcon('📋')).toBe(true)
    expect(isPageIcon('x')).toBe(false)
    expect(isPageIcon(null)).toBe(false)
  })
})
