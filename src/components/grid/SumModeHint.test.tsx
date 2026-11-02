// SumModeHint (S3.3; FR-817, AC-810, BR-101): the summed-cell hint names the number of people and offers
// [แสดงผู้รับผิดชอบ]; Esc and a click elsewhere close it.
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { renderGrid } from './render.test.helper'
import { SumModeHint } from './SumModeHint'

function setup(people: number) {
  const anchor = document.createElement('div')
  document.body.appendChild(anchor)
  const onShowAssignees = vi.fn()
  const onClose = vi.fn()
  renderGrid(
    <SumModeHint anchorEl={anchor} people={people} onShowAssignees={onShowAssignees} onClose={onClose} />,
  )
  return { onShowAssignees, onClose }
}

describe('SumModeHint (FR-817)', () => {
  it('≥ 2 people: names the count, politely announced; the button shows the assignees', () => {
    const { onShowAssignees } = setup(3)
    const hint = screen.getByTestId('sum-mode-hint')
    expect(hint).toHaveAttribute('role', 'status')
    expect(hint).toHaveTextContent(th.grid.sumMode.readOnlyHint(3))
    fireEvent.click(screen.getByRole('button', { name: th.grid.sumMode.showAssignees }))
    expect(onShowAssignees).toHaveBeenCalledTimes(1)
  })

  it('a parent (0) gets the generic text; Esc closes', () => {
    const { onClose } = setup(0)
    expect(screen.getByTestId('sum-mode-hint')).toHaveTextContent(th.grid.sumMode.readOnlyHint(0))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('keyboard route (P1, §8.9): Alt+Enter runs the button while open, before the grid sees the key', () => {
    const { onShowAssignees } = setup(2)
    const button = screen.getByRole('button', { name: th.grid.sumMode.showAssignees })
    expect(button).toHaveAttribute('aria-keyshortcuts', 'Alt+Enter')
    const cell = document.createElement('div')
    cell.tabIndex = 0
    document.body.appendChild(cell)
    const gridKey = vi.fn()
    cell.addEventListener('keydown', gridKey)
    cell.focus()
    fireEvent.keyDown(cell, { code: 'Enter', key: 'Enter' })
    expect(onShowAssignees).not.toHaveBeenCalled()
    fireEvent.keyDown(cell, { code: 'Enter', key: 'Enter', altKey: true })
    expect(onShowAssignees).toHaveBeenCalledTimes(1)
    expect(gridKey).toHaveBeenCalledTimes(1) // only the plain Enter reached the cell
    expect(document.activeElement).toBe(cell) // the hint never takes focus from the cell
  })

  it('closed when there is no anchor', () => {
    renderGrid(<SumModeHint anchorEl={null} people={2} onShowAssignees={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByTestId('sum-mode-hint')).toBeNull()
  })
})
