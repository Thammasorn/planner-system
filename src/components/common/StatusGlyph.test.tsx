import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { StatusGlyph, type StatusGlyphKind } from './StatusGlyph'

const KINDS: readonly StatusGlyphKind[] = ['leave', 'holiday', 'tentative', 'dayDetail', 'noCapacity']

describe('StatusGlyph (PLAN §3.9, §8.9)', () => {
  it.each(KINDS)('%s renders its hidden text from th.grid.glyph and an aria-hidden glyph', (kind) => {
    const { container } = render(<StatusGlyph kind={kind} />)
    expect(screen.getByText(th.grid.glyph[kind])).toBeInTheDocument()
    const glyph = container.querySelector(`[data-glyph="${kind}"]`)
    expect(glyph).toHaveAttribute('aria-hidden', 'true')
  })

  it('uses the glyph characters ◐ ⋯ 🎌 ▨ and an icon for leave', () => {
    const { container } = render(
      <>
        <StatusGlyph kind="tentative" />
        <StatusGlyph kind="dayDetail" />
        <StatusGlyph kind="holiday" />
        <StatusGlyph kind="noCapacity" />
        <StatusGlyph kind="leave" />
      </>,
    )
    expect(container.querySelector('[data-glyph="tentative"]')).toHaveTextContent('◐')
    expect(container.querySelector('[data-glyph="dayDetail"]')).toHaveTextContent('⋯')
    expect(container.querySelector('[data-glyph="holiday"]')).toHaveTextContent('🎌')
    expect(container.querySelector('[data-glyph="noCapacity"]')).toHaveTextContent('▨')
    expect(container.querySelector('[data-glyph="leave"] svg')).not.toBeNull()
  })

  it('an explicit label replaces the default text alternative', () => {
    render(<StatusGlyph kind="leave" label="ลาพักร้อน 5–6 ต.ค." />)
    expect(screen.getByText('ลาพักร้อน 5–6 ต.ค.')).toBeInTheDocument()
    expect(screen.queryByText(th.grid.glyph.leave)).toBeNull()
  })
})
