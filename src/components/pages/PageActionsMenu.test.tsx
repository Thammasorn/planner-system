import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { PageActionsMenu, type PageMenuTarget } from './PageActionsMenu'
import { MANAGER, okResult, renderPages, uuid, WORKER } from './render.test.helper'

const nav = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: nav.push }), usePathname: () => '/home' }))
const actions = vi.hoisted(() => ({
  createPage: vi.fn(),
  deletePage: vi.fn(),
  duplicatePage: vi.fn(),
  restorePageBatch: vi.fn(),
  setPageProtected: vi.fn(),
}))
vi.mock('@/server/actions/pages', () => actions)

const PAGE = uuid(10)
const PARENT = uuid(11)
const BATCH = uuid(99)

const page = (over: Partial<PageMenuTarget> = {}): PageMenuTarget => ({
  id: PAGE,
  title: 'ก',
  space: 'WORKSPACE',
  projectId: null,
  isCharter: false,
  locked: false,
  ...over,
})
const ALL = { duplicate: true, delete: true, protect: false }

async function openMenu(title = 'ก') {
  await userEvent.click(screen.getByRole('button', { name: th.pages.menu(title) }))
  return screen.getByRole('menu')
}
const items = () => screen.getAllByRole('menuitem').map((i) => i.textContent)

beforeEach(() => {
  nav.push.mockReset()
})

describe('PageActionsMenu (FR-508/509/510)', () => {
  it('the charter has no delete item (M4-D6)', async () => {
    renderPages(
      <PageActionsMenu
        page={page({ isCharter: true, space: 'PROJECT', projectId: uuid(5) })}
        can={ALL}
        navigateAfterDelete
      />,
    )
    await openMenu()
    expect(items()).toEqual([th.pages.duplicate])
    expect(screen.queryByRole('menuitem', { name: th.pages.delete })).not.toBeInTheDocument()
  })

  it('a worker on a protected page: only duplicate', async () => {
    renderPages(
      <PageActionsMenu
        page={page({ locked: true })}
        can={{ duplicate: true, delete: false, protect: false }}
        navigateAfterDelete
      />,
      { user: WORKER },
    )
    await openMenu()
    expect(items()).toEqual([th.pages.duplicate])
  })

  it('a manager on a wiki page gets the protect item; a locked page offers unprotect', async () => {
    actions.setPageProtected.mockReturnValue(okResult({ changed: true }))
    const onChange = vi.fn()
    const { unmount } = renderPages(
      <PageActionsMenu
        page={page()}
        can={{ ...ALL, protect: true }}
        navigateAfterDelete
        onProtectedChange={onChange}
      />,
      { user: MANAGER },
    )
    await openMenu()
    expect(items()).toEqual([th.pages.duplicate, th.pages.protect, th.pages.delete])
    await userEvent.click(screen.getByRole('menuitem', { name: th.pages.protect }))
    expect(actions.setPageProtected).toHaveBeenCalledWith({ pageId: PAGE, protected: true })
    expect(onChange).toHaveBeenCalledWith(true)
    expect(await screen.findByText(th.pages.toasts.protected)).toBeInTheDocument()
    unmount()

    renderPages(
      <PageActionsMenu page={page({ locked: true })} can={{ ...ALL, protect: true }} navigateAfterDelete />,
      {
        user: MANAGER,
      },
    )
    await openMenu()
    expect(screen.getByRole('menuitem', { name: th.pages.unprotect })).toBeInTheDocument()
  })

  it('nothing to offer → no menu button', () => {
    renderPages(
      <PageActionsMenu
        page={page()}
        can={{ duplicate: false, delete: false, protect: false }}
        navigateAfterDelete
      />,
    )
    expect(screen.queryByRole('button', { name: th.pages.menu('ก') })).not.toBeInTheDocument()
  })

  it('delete → deletePage, an undo entry with the toast deleted("ก", 2), then the parent page (no confirm)', async () => {
    actions.deletePage.mockReturnValue(
      okResult({ batch: BATCH, count: 2, title: 'ก', space: 'WORKSPACE', projectId: null, parentId: PARENT }),
    )
    actions.restorePageBatch.mockReturnValue(
      okResult({ restoredIds: [PAGE], space: 'WORKSPACE', projectId: null }),
    )
    const { undo } = renderPages(<PageActionsMenu page={page()} can={ALL} navigateAfterDelete />)
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: th.pages.delete }))
    expect(actions.deletePage).toHaveBeenCalledWith({ pageId: PAGE })
    await waitFor(() => expect(undo.push).toHaveBeenCalledTimes(1))
    const [entry, opts] = undo.push.mock.calls[0]!
    expect(opts).toEqual({ toast: th.pages.toasts.deleted('ก', 2) })
    expect(entry.label).toBe(th.pages.toasts.deleted('ก', 2))
    expect(nav.push).toHaveBeenCalledWith(`/p/${PARENT}`)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await entry.undo()
    expect(actions.restorePageBatch).toHaveBeenCalledWith({ batch: BATCH })
  })

  it('a deleted root project page navigates to the project tab; a tree row that is not on screen stays', async () => {
    const PID = uuid(5)
    actions.deletePage.mockReturnValue(
      okResult({ batch: BATCH, count: 0, title: 'ก', space: 'PROJECT', projectId: PID, parentId: null }),
    )
    const { unmount } = renderPages(
      <PageActionsMenu page={page({ space: 'PROJECT', projectId: PID })} can={ALL} navigateAfterDelete />,
    )
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: th.pages.delete }))
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith(`/projects/${PID}/pages`))
    unmount()
    nav.push.mockReset()

    const { undo } = renderPages(<PageActionsMenu page={page()} can={ALL} navigateAfterDelete={false} />)
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: th.pages.delete }))
    await waitFor(() => expect(undo.push).toHaveBeenCalledTimes(1))
    expect(nav.push).not.toHaveBeenCalled()
  })

  it('duplicate → toast with an open action to the copy', async () => {
    const COPY = uuid(12)
    actions.duplicatePage.mockReturnValue(
      okResult({ root: { id: COPY }, count: 0, space: 'WORKSPACE', projectId: null }),
    )
    renderPages(<PageActionsMenu page={page()} can={ALL} navigateAfterDelete />)
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: th.pages.duplicate }))
    expect(await screen.findByText(th.pages.toasts.duplicated('ก'))).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: th.pages.toasts.openCopy }))
    expect(nav.push).toHaveBeenCalledWith(`/p/${COPY}`)
  })

  it('a failed delete shows the server message and pushes no undo entry', async () => {
    actions.deletePage.mockReturnValue(
      Promise.resolve({ ok: false, code: 'FORBIDDEN', message: th.pages.errors.subtreeProtected }),
    )
    const { undo } = renderPages(<PageActionsMenu page={page()} can={ALL} navigateAfterDelete />)
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: th.pages.delete }))
    expect(await screen.findByText(th.pages.errors.subtreeProtected)).toBeInTheDocument()
    expect(undo.push).not.toHaveBeenCalled()
    expect(nav.push).not.toHaveBeenCalled()
  })
})
