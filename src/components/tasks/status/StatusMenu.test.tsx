import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material/styles'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { theme } from '@/lib/theme/theme'
import { S, STATUSES } from '../fixtures.test.data'
import { StatusChip } from './StatusChip'
import { StatusMenu } from './StatusMenu'

function renderMenu(onPick = vi.fn(), onClose = vi.fn()) {
  const anchor = document.createElement('button')
  document.body.appendChild(anchor)
  render(
    <ThemeProvider theme={theme}>
      <StatusMenu
        statuses={STATUSES}
        currentId={S.todo}
        anchorEl={anchor}
        onPick={onPick}
        onClose={onClose}
      />
    </ThemeProvider>,
  )
  return { onPick, onClose }
}

describe('StatusMenu (FR-626)', () => {
  it('lists statuses in position order and marks the current one', () => {
    renderMenu()
    const items = screen.getAllByRole('option')
    expect(items.map((i) => i.textContent)).toEqual(
      STATUSES.map((s) => expect.stringContaining(s.name) as unknown as string),
    )
    expect(
      screen.getByRole('option', { name: new RegExp(th.tasks.status.defaults.todo) }),
    ).toHaveAttribute('aria-selected', 'true')
    expect(
      screen.getByRole('option', { name: new RegExp(th.tasks.status.defaults.doing) }),
    ).toHaveAttribute('aria-selected', 'false')
  })

  it('follows the ARIA 1.2 combobox pattern: the field controls a listbox and points at the highlighted option', async () => {
    const user = userEvent.setup()
    renderMenu()
    expect(screen.getByRole('dialog', { name: th.tasks.status.label })).toBeInTheDocument()
    const filter = screen.getByRole('combobox', { name: th.tasks.status.filter })
    const list = screen.getByRole('listbox', { name: th.tasks.status.label })
    expect(filter).toHaveAttribute('aria-controls', list.id)
    expect(screen.queryByRole('menu')).toBeNull()
    const active = () => document.getElementById(filter.getAttribute('aria-activedescendant') ?? '')
    expect(active()).toHaveAttribute('role', 'option')
    expect(active()).toHaveTextContent(th.tasks.status.defaults.todo)
    await user.keyboard('{ArrowDown}')
    expect(active()).toHaveTextContent(th.tasks.status.defaults.doing)
    expect(list).toContainElement(active())
  })

  it('filters by typing and applies the first match with Enter', async () => {
    const user = userEvent.setup()
    const { onPick } = renderMenu()
    const filter = screen.getByRole('combobox', { name: th.tasks.status.filter })
    expect(filter).toHaveFocus()
    await user.type(filter, 'รอ')
    const names = screen.getAllByRole('option').map((i) => i.textContent)
    expect(names).toHaveLength(2)
    expect(names[0]).toContain(th.tasks.status.defaults.waitData)
    expect(names[1]).toContain(th.tasks.status.defaults.blocked)
    await user.keyboard('{Enter}')
    expect(onPick).toHaveBeenCalledWith(S.waitData)
  })

  it('ArrowDown moves the highlight; Escape closes', async () => {
    const user = userEvent.setup()
    const { onPick, onClose } = renderMenu()
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onPick).toHaveBeenCalledWith(S.doing)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})

describe('StatusChip (FR-627)', () => {
  it('exposes the category as text, not colour only', () => {
    render(<StatusChip status={STATUSES[2]!} />)
    expect(screen.getByText(th.tasks.status.defaults.waitData)).toBeInTheDocument()
    expect(screen.getByText(th.tasks.status.categories.WAITING)).toBeInTheDocument()
  })

  it('is a popup button when clickable', async () => {
    const onClick = vi.fn()
    render(<StatusChip status={STATUSES[0]!} onClick={onClick} />)
    const btn = screen.getByRole('button', { name: th.tasks.status.menuLabel(th.tasks.status.defaults.todo) })
    expect(btn).toHaveAttribute('aria-haspopup', 'dialog')
    await userEvent.click(btn)
    expect(onClick).toHaveBeenCalled()
  })
})
