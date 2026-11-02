// MarkerPopover (S3.5; FR-819, §8.13, M7.1-D11/D14, FR-1604): named colour buttons with ✓ + aria-pressed, the label is
// debounced 400 ms and flushed on close, 🗑 deletes, and viewers get the read-only variant.
import { act, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { PlanMarkerDTO } from '@/lib/contracts/plan-markers'
import { formatThaiDate } from '@/lib/format'
import { LABEL_DEBOUNCE_MS, MarkerPopover, type MarkerPopoverProps } from './MarkerPopover'
import { renderGrid } from './render.test.helper'

const MK: PlanMarkerDTO = {
  id: 'mk-1',
  projectId: 'p',
  date: '2026-10-23',
  color: 'RED',
  label: 'UAT sign-off',
  createdBy: 'cindy',
  updatedAt: '',
}

function setup(o: Partial<MarkerPopoverProps> = {}) {
  const anchor = document.createElement('button')
  document.body.appendChild(anchor)
  const props: MarkerPopoverProps = {
    marker: MK,
    anchorEl: anchor,
    editable: true,
    onChange: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
    ...o,
  }
  const view = renderGrid(<MarkerPopover {...props} />)
  return { props, view }
}

afterEach(() => vi.useRealTimers())

describe('MarkerPopover (FR-819, M7.1-D11/D14)', () => {
  it('three named colour buttons; the chosen one has ✓ and aria-pressed; another colour applies at once', () => {
    const { props } = setup()
    const red = screen.getByTestId('marker-color-RED')
    expect(red).toHaveAttribute('aria-pressed', 'true')
    expect(red).toHaveTextContent(`✓ ${th.planMarkers.color.RED}`)
    expect(screen.getByTestId('marker-color-GREEN')).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByTestId('marker-color-YELLOW'))
    expect(props.onChange).toHaveBeenCalledWith('mk-1', { color: 'YELLOW' })
    fireEvent.click(red)
    expect(props.onChange).toHaveBeenCalledTimes(1) // same colour: no write
  })

  it('the label is sent 400 ms after the last key, once', () => {
    vi.useFakeTimers()
    const { props } = setup()
    const input = screen.getByTestId('marker-label')
    fireEvent.change(input, { target: { value: 'UAT' } })
    fireEvent.change(input, { target: { value: 'UAT done' } })
    act(() => {
      vi.advanceTimersByTime(LABEL_DEBOUNCE_MS - 1)
    })
    expect(props.onChange).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(props.onChange).toHaveBeenCalledExactlyOnceWith('mk-1', { label: 'UAT done' })
  })

  it('a pending label is flushed when the popover closes; Enter closes', () => {
    const { props, view } = setup()
    fireEvent.change(screen.getByTestId('marker-label'), { target: { value: 'Go-live' } })
    fireEvent.keyDown(screen.getByTestId('marker-label'), { key: 'Enter' })
    expect(props.onClose).toHaveBeenCalled()
    view.rerender(<MarkerPopover {...props} marker={null} anchorEl={null} />)
    return vi.waitFor(() => expect(props.onChange).toHaveBeenCalledWith('mk-1', { label: 'Go-live' }))
  })

  it('🗑 deletes and closes', () => {
    const { props } = setup()
    fireEvent.click(screen.getByRole('button', { name: th.planMarkers.delete }))
    expect(props.onDelete).toHaveBeenCalledWith('mk-1')
    expect(props.onClose).toHaveBeenCalled()
  })

  it('read-only variant: the facts in text (colour named), no controls', () => {
    setup({ editable: false })
    const pop = screen.getByTestId('marker-popover')
    expect(pop).toHaveTextContent('UAT sign-off')
    expect(pop).toHaveTextContent(formatThaiDate('2026-10-23', 'medium'))
    expect(pop).toHaveTextContent(th.planMarkers.color.RED)
    expect(pop).toHaveTextContent(th.planMarkers.readOnly)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: th.planMarkers.delete })).toBeNull()
  })
})
