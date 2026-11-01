// plan/m07 S3.9 — the cell menu (M7-D23) and its M8 extension point (`items`, C28).
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { CellMenu } from './CellMenu'

const at = { x: 10, y: 10 }

describe('CellMenu', () => {
  it('two DAY targets → one enabled collapse item; click → onCollapse once', () => {
    const onCollapse = vi.fn()
    const onClose = vi.fn()
    render(
      <CellMenu
        anchor={at}
        targets={[
          { taskAssignmentId: 'a', week: '2026-09-28' },
          { taskAssignmentId: 'b', week: '2026-09-28' },
        ]}
        onCollapse={onCollapse}
        onClose={onClose}
      />,
    )
    expect(screen.getByRole('menu', { name: th.grid.day.cellMenu })).toBeInTheDocument()
    const item = screen.getByRole('menuitem', { name: th.grid.day.collapseToWeek })
    expect(item).not.toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(item)
    expect(onCollapse).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalled()
  })
  it('no targets → the item is disabled with the explanation', () => {
    render(<CellMenu anchor={at} targets={[]} onCollapse={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('menuitem', { name: th.grid.day.collapseToWeekDisabled })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })
  it('items (M8 contract) replace the default item', () => {
    const onSelect = vi.fn()
    render(<CellMenu anchor={at} targets={[]} onCollapse={vi.fn()} onClose={vi.fn()} items={[{ id: 'x', label: 'X', onSelect }]} />)
    expect(screen.getAllByRole('menuitem').map((e) => e.textContent)).toEqual(['X'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'X' }))
    expect(onSelect).toHaveBeenCalled()
  })
  it('Escape → onClose', () => {
    const onClose = vi.fn()
    render(<CellMenu anchor={at} targets={[]} onCollapse={vi.fn()} onClose={onClose} />)
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
