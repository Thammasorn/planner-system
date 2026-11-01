// plan/m07 S3.11 — [สัปดาห์ | วัน] (FR-802): a view action that the grid persists in `grid.zoom`.
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { ZoomToggle } from './ZoomToggle'

describe('ZoomToggle', () => {
  it('click วัน → onChange("DAY") once; the pressed state follows the value', () => {
    const onChange = vi.fn()
    const { rerender } = render(<ZoomToggle zoom="WEEK" onChange={onChange} />)
    expect(screen.getByRole('group', { name: th.grid.toolbar.zoom })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: th.grid.toolbar.zoomWeek })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: th.grid.toolbar.zoomDay }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('DAY')
    rerender(<ZoomToggle zoom="DAY" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: th.grid.toolbar.zoomDay }))
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
