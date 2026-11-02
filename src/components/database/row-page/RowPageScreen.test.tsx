// FR-1453, M11-D27 (plan/m11 S4.3): the row page /r/[rowId] — crumbs owner › database › row, ⋯ per rights, Enter in
// the title moves the caret into the body, delete → undo toast path + back to the owner page, Esc = back.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type Ref, useImperativeHandle } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { RowPageView } from '@/lib/contracts/row-pages'
import { copyText } from '@/lib/copy-text'
import { DEFAULT_UPLOAD_LIMITS } from '@/lib/files/upload-rules'
import { callsOf, makeApi } from '../fixtures.test.helper'
import { renderDb } from '../render.test.helper'
import { RowPageContent } from './RowPageScreen'

const nav = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, back: nav.back, replace: nav.replace }),
  usePathname: () => '/r/r1',
}))
const s = vi.hoisted(() => ({ focus: vi.fn(), setPageFullWidth: vi.fn() }))
vi.mock('@/server/actions/pages', () => ({ setPageFullWidth: s.setPageFullWidth }))
vi.mock('@/server/actions/databases', () => ({}))
vi.mock('@/lib/copy-text', () => ({ copyText: vi.fn(() => Promise.resolve(true)) }))
// The editor is S5's: a stub that exposes focus() through focusRef.
vi.mock('@/components/editor/RowBody', () => ({
  RowBody: (p: { variant: string; canEdit: boolean; focusRef?: Ref<{ focus(): void }> }) => {
    useImperativeHandle(p.focusRef, () => ({ focus: s.focus }), [])
    return <div data-testid="row-body" data-variant={p.variant} data-can-edit={String(p.canEdit)} />
  },
}))

const view = (edit = true): RowPageView => ({
  row: { id: 'r1', title: 'ลูกค้าส่ง spec ช้า', databaseId: 'db-1' },
  database: { id: 'db-1', title: 'ทะเบียนความเสี่ยง', ownerPageId: 'page-1' },
  owner: {
    kind: 'DOC',
    pageId: 'page-1',
    title: 'POS charter',
    href: '/p/page-1',
    projectId: 'p1',
    projectName: 'POS Upgrade',
    archived: false,
  },
  body: {
    rowId: 'r1',
    databaseId: 'db-1',
    ownerPageId: 'page-1',
    space: 'PROJECT',
    projectId: 'p1',
    page: null,
    can: { edit },
    uploadLimits: DEFAULT_UPLOAD_LIMITS,
  },
})

function show(opts: { edit?: boolean; over?: Parameters<typeof makeApi>[0] } = {}) {
  const edit = opts.edit ?? true
  const api = makeApi(opts.over ?? {}, { canEdit: edit })
  renderDb(<RowPageContent view={view(edit)} />, { api })
  return api
}

const header = () => screen.getByTestId('page-header')
const openMenu = async () => {
  await userEvent.click(within(header()).getByRole('button', { name: th.layout.more }))
  return screen.findByRole('menu')
}

beforeEach(() => {
  for (const f of [nav.push, nav.back, nav.replace, s.focus, s.setPageFullWidth]) f.mockReset()
})

describe('RowPageScreen (FR-1453, M11-D27)', () => {
  it('crumbs: owner page › database (→ ?db=) › row; the title is the h1 of the column', () => {
    show()
    const crumbs = within(header()).getByRole('navigation', { name: th.layout.breadcrumb })
    expect(within(crumbs).getByRole('link', { name: 'POS charter' })).toHaveAttribute('href', '/p/page-1')
    expect(within(crumbs).getByRole('link', { name: 'ทะเบียนความเสี่ยง' })).toHaveAttribute(
      'href',
      '/p/page-1?db=db-1',
    )
    expect(within(crumbs).getByText('ลูกค้าส่ง spec ช้า')).toBeInTheDocument()
    const title = within(screen.getByTestId('row-title')).getByRole('textbox', {
      name: th.database.types.TITLE,
    })
    expect(title).toHaveValue('ลูกค้าส่ง spec ช้า')
    expect(title.closest('h1')).not.toBeNull()
  })

  it('every live column as a property list, and the page body', () => {
    show()
    const props = screen.getByRole('group', { name: th.database.rowPage.propertiesLabel })
    expect(within(props).getByText('สถานะ')).toBeInTheDocument()
    expect(within(props).getByText('กำลังทำ')).toBeInTheDocument()
    expect(within(props).getByText('ลิงก์')).toBeInTheDocument()
    expect(screen.getByTestId('row-body')).toHaveAttribute('data-variant', 'page')
  })

  it('Enter in the title saves it and moves the caret into the body; Esc restores', async () => {
    const api = show()
    const title = screen.getByRole('textbox', { name: th.database.types.TITLE })
    await userEvent.clear(title)
    await userEvent.type(title, 'ลูกค้าส่ง spec ล่าช้า{Enter}')
    expect(callsOf(api, 'updateRow').map((a) => a.slice(0, 2))).toEqual([
      ['r1', { title: 'ลูกค้าส่ง spec ล่าช้า' }],
    ])
    expect(s.focus).toHaveBeenCalledTimes(1)
    const again = screen.getByRole('textbox', { name: th.database.types.TITLE })
    await userEvent.type(again, 'xx{Escape}')
    expect(again).toHaveValue('ลูกค้าส่ง spec ล่าช้า')
    expect(callsOf(api, 'updateRow')).toHaveLength(1)
    expect(nav.push).not.toHaveBeenCalled() // Esc in the title is the title's, not "back"
  })

  it('🔗 copies the absolute /r/<id> URL', async () => {
    show()
    await userEvent.click(within(header()).getByRole('button', { name: th.layout.copyLink }))
    expect(copyText).toHaveBeenLastCalledWith(`${window.location.origin}/r/r1`)
  })

  it('⋯ with edit rights: คัดลอกลิงก์ · เปิดในแผง (?db=&row=) · เต็มความกว้าง · ลบแถว', async () => {
    show()
    const menu = await openMenu()
    const items = [...menu.querySelectorAll<HTMLElement>('[role^="menuitem"]')]
    expect(items.map((i) => i.textContent)).toEqual([
      th.layout.copyLink,
      th.database.rowPage.openInPanel,
      th.layout.fullWidth,
      th.database.rowPage.deleteRow,
    ])
    expect(within(menu).getByRole('menuitem', { name: th.database.rowPage.openInPanel })).toHaveAttribute(
      'href',
      '/p/page-1?db=db-1&row=r1',
    )
  })

  it('read-only: no full width, no delete, the title is plain text', async () => {
    show({ edit: false })
    expect(screen.queryByRole('textbox', { name: th.database.types.TITLE })).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'ลูกค้าส่ง spec ช้า' })).toBeInTheDocument()
    expect(screen.getByTestId('row-body')).toHaveAttribute('data-can-edit', 'false')
    const menu = await openMenu()
    expect([...menu.querySelectorAll<HTMLElement>('[role^="menuitem"]')].map((i) => i.textContent)).toEqual([
      th.layout.copyLink,
      th.database.rowPage.openInPanel,
    ])
  })

  it('ลบแถว deletes through the database API (undo toast there) and replaces /r with the owner page', async () => {
    const api = show()
    const menu = await openMenu()
    await userEvent.click(within(menu).getByRole('menuitem', { name: th.database.rowPage.deleteRow }))
    expect(callsOf(api, 'deleteRows')).toEqual([[['r1']]])
    expect(nav.replace).toHaveBeenCalledWith('/p/page-1?db=db-1')
  })

  it('a row deleted elsewhere: "แถวนี้ถูกลบแล้ว", no body', () => {
    show({ over: { rows: [] } })
    expect(screen.getByTestId('row-gone')).toHaveTextContent(th.database.rowPage.gone)
    expect(screen.queryByTestId('row-body')).toBeNull()
  })

  it('Esc = back to the owner page (no in-app history → push the owner href)', async () => {
    show()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/p/page-1'))
  })
})
