// FR-1405/1406 (plan/m11 S3.3): view tabs — switch (local), +, rename, duplicate, delete (not the last), move.
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { DbViewDTO } from '@/lib/contracts/databases'
import { callsOf, makeApi, TABLE_VIEW } from './fixtures.test.helper'
import { renderDb } from './render.test.helper'
import { ViewTabs } from './ViewTabs'

vi.mock('@/server/actions/databases', () => ({}))

const KANBAN: DbViewDTO = {
  id: 'v-kanban',
  type: 'KANBAN',
  name: 'คัมบัง',
  config: {},
  position: 'a1',
  version: 1,
}

function Harness() {
  const [sel, setSel] = useState(TABLE_VIEW.id)
  return <ViewTabs selectedId={sel} onSelect={setSel} panelId="panel" />
}
const t = th.database.views

describe('ViewTabs', () => {
  it('switches with click and arrow keys (selection is not saved)', async () => {
    const api = makeApi({ views: [TABLE_VIEW, KANBAN] })
    renderDb(<Harness />, { api })
    const [table, kanban] = screen.getAllByRole('tab')
    expect(table).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(kanban!)
    expect(kanban).toHaveAttribute('aria-selected', 'true')
    kanban!.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getAllByRole('tab')[0]).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByRole('tab')[0]).toHaveFocus()
    expect(callsOf(api, 'updateView')).toHaveLength(0)
  })

  it('"+" adds a view of a type and selects it', async () => {
    const api = makeApi()
    renderDb(<Harness />, { api })
    await userEvent.click(screen.getByRole('button', { name: t.add }))
    await userEvent.click(screen.getByRole('menuitem', { name: t.CALENDAR }))
    expect(callsOf(api, 'createView')[0]![0]).toBe('CALENDAR')
    expect(screen.getAllByRole('tab')[1]).toHaveAttribute('aria-selected', 'true')
  })

  it('tab ⋯: rename inline, duplicate, delete disabled for the last view', async () => {
    const api = makeApi()
    renderDb(<Harness />, { api })
    const more = () =>
      screen.getByRole('button', { name: `${th.database.toolbar.more} ${api.db.views[0]!.name}` })
    await userEvent.click(more())
    expect(screen.getByRole('menuitem', { name: new RegExp(t.delete) })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await userEvent.click(screen.getByRole('menuitem', { name: t.rename }))
    const input = screen.getByRole('textbox', { name: t.rename })
    await userEvent.clear(input)
    await userEvent.type(input, 'ทั้งหมด{Enter}')
    expect(callsOf(api, 'updateView')[0]).toEqual([
      TABLE_VIEW.id,
      { name: 'ทั้งหมด' },
      th.database.undo.viewConfig,
    ])
    await userEvent.click(more())
    await userEvent.click(screen.getByRole('menuitem', { name: t.duplicate }))
    expect(callsOf(api, 'createView')[0]).toEqual(['TABLE', { copyFromViewId: TABLE_VIEW.id }])
  })

  it('delete moves the selection to another view; ⋯ "ย้ายไปทางขวา" reorders', async () => {
    const api = makeApi({ views: [TABLE_VIEW, KANBAN] })
    renderDb(<Harness />, { api })
    await userEvent.click(
      screen.getByRole('button', { name: `${th.database.toolbar.more} ${TABLE_VIEW.name}` }),
    )
    await userEvent.click(screen.getByRole('menuitem', { name: t.moveRight }))
    expect(callsOf(api, 'updateView')[0]).toEqual([
      TABLE_VIEW.id,
      { afterViewId: KANBAN.id },
      th.database.undo.viewConfig,
    ])
    await userEvent.click(
      screen.getByRole('button', { name: `${th.database.toolbar.more} ${TABLE_VIEW.name}` }),
    )
    await userEvent.click(screen.getByRole('menuitem', { name: t.delete }))
    expect(callsOf(api, 'deleteView')).toEqual([[TABLE_VIEW.id]])
    expect(screen.getAllByRole('tab')).toHaveLength(1)
    expect(screen.getByRole('tab')).toHaveAttribute('aria-selected', 'true')
  })

  it('read-only: tabs switch, no "+" and no ⋯ (FR-1406)', () => {
    renderDb(<Harness />, { api: makeApi({ views: [TABLE_VIEW, KANBAN] }, { canEdit: false }) })
    expect(screen.getAllByRole('tab')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: t.add })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: new RegExp(th.database.toolbar.more) }),
    ).not.toBeInTheDocument()
  })
})
