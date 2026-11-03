// Owner bug 2026-11-03: opening the row panel (the ⤢ button, Space on a title cell, the row menu), moving ˄/˅ and
// closing it with Esc never scrolls the page — the block's deep-link scroll (FR-1452) is for links that ARRIVE (page
// load, back / forward), not for this tab's own ?db=&row= writes; focus that returns to the row uses preventScroll.
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { DatabaseBlockContent } from '../DatabaseBlockView'
import { makeApi } from '../fixtures.test.helper'
import { renderDb } from '../render.test.helper'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/server/actions/databases', () => ({}))
vi.mock('@/components/editor/RowBody', () => ({ RowBody: () => null }))

const block = () => <DatabaseBlockContent blockId="b1" variant="page" />
const grid = () => screen.getByRole('grid', { name: th.database.table.label })
const dataRows = () =>
  within(grid())
    .getAllByRole('row')
    .filter((r) => r.hasAttribute('data-row-id'))
const panel = () => screen.queryByTestId('db-row-panel')

const scroll = vi.fn<(arg?: boolean | ScrollIntoViewOptions) => void>()
const focus = vi.fn<(opts?: FocusOptions) => void>()
const realScroll = Element.prototype.scrollIntoView
const realFocus = HTMLElement.prototype.focus
beforeEach(() => {
  window.history.replaceState(null, '', '/p/page-1')
  scroll.mockReset()
  focus.mockReset()
  Element.prototype.scrollIntoView = function (this: Element, arg?: boolean | ScrollIntoViewOptions) {
    scroll(arg)
  }
  HTMLElement.prototype.focus = function (this: HTMLElement, opts?: FocusOptions) {
    focus(opts)
    realFocus.call(this, opts)
  }
})
afterEach(() => {
  Element.prototype.scrollIntoView = realScroll
  HTMLElement.prototype.focus = realFocus
  window.history.replaceState(null, '', '/')
})

describe('row panel keeps the page where it is', () => {
  it('⤢, ˅ / ˄, Esc, Space and the row menu never scroll the block into view', async () => {
    const api = makeApi()
    const user = userEvent.setup()
    renderDb(block(), { api })
    const first = api.db.rows[0]!
    await user.click(
      within(dataRows()[0]!).getByRole('button', { name: `${th.database.table.openRow} ${first.title}` }),
    )
    await waitFor(() => expect(panel()).toBeInTheDocument())
    expect(window.location.search).toContain(`row=${first.id}`)
    await user.click(screen.getByRole('button', { name: th.database.panel.next }))
    await user.click(screen.getByRole('button', { name: th.database.panel.prev }))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(panel()).not.toBeInTheDocument())
    // Space on a title cell
    const title = within(dataRows()[1]!).getAllByRole('gridcell')[0]!
    title.focus()
    fireEvent.keyDown(title, { key: ' ', code: 'Space' })
    await waitFor(() => expect(panel()).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: th.database.panel.close }))
    // the row menu's เปิด
    fireEvent.contextMenu(within(dataRows()[2]!).getAllByRole('gridcell')[1]!, { clientX: 5, clientY: 5 })
    await user.click(screen.getByRole('menuitem', { name: th.database.rowMenu.open }))
    await waitFor(() => expect(panel()).toBeInTheDocument())
    expect(scroll).not.toHaveBeenCalled()
    // every programmatic focus that returns to the grid from a menu keeps the scroll position
    for (const [opts] of focus.mock.calls)
      if (opts !== undefined) expect(opts.preventScroll ?? true).toBe(true)
  })

  it('a deep link that arrives (?db=) still scrolls the block into view once (FR-1452)', () => {
    const api = makeApi()
    window.history.replaceState(null, '', `/p/page-1?db=${api.db.id}`)
    renderDb(block(), { api })
    expect(scroll).toHaveBeenCalledTimes(1)
  })
})
