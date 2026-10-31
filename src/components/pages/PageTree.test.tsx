import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { PageTreeResponse } from '@/lib/contracts/pages'
import { qk } from '@/lib/query-keys'
import { PageTree } from './PageTree'
import { MANAGER, okResult, renderPages, treeNode, uuid, WORKER } from './render.test.helper'

const nav = vi.hoisted(() => ({ push: vi.fn(), pathname: '/home' }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: nav.push }), usePathname: () => nav.pathname }))
const actions = vi.hoisted(() => ({
  createPage: vi.fn(),
  deletePage: vi.fn(),
  duplicatePage: vi.fn(),
  restorePageBatch: vi.fn(),
  setPageProtected: vi.fn(),
  movePage: vi.fn(),
}))
vi.mock('@/server/actions/pages', () => actions)
const api = vi.hoisted(() => ({ getJson: vi.fn(() => new Promise<never>(() => {})) })) // data comes from the cache
vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  getJson: api.getJson,
}))

const GUIDE = uuid(31)
const POLICY = uuid(32)
const CHILD = uuid(33)
const NEW = uuid(34)
const CHARTER = uuid(35)
const PID = uuid(5)

const wiki = (over: Partial<PageTreeResponse> = {}): PageTreeResponse => ({
  nodes: [
    treeNode({ id: GUIDE, title: 'คู่มือทีม', icon: '📘', position: 'a0', hasChildren: true }),
    treeNode({ id: POLICY, title: 'นโยบายบริษัท', position: 'a1', locked: true, effectiveProtected: true }),
  ],
  canCreate: true,
  ...over,
})

function renderWiki(
  opts: {
    user?: typeof WORKER
    data?: PageTreeResponse
    expanded?: string[]
    children?: PageTreeResponse
  } = {},
) {
  return renderPages(
    <PageTree space="WORKSPACE" projectId={null} label={th.pages.tree.wikiLabel} variant="sidebar" />,
    {
      user: opts.user ?? WORKER,
      prefs: opts.expanded ? { 'sidebar.expanded': opts.expanded } : {},
      seed: (qc) => {
        qc.setQueryData(qk.pagesTree('WORKSPACE', null, null), opts.data ?? wiki())
        if (opts.children) qc.setQueryData(qk.pagesTree('WORKSPACE', null, GUIDE), opts.children)
      },
    },
  )
}

/** The protected row's accessible name carries its 🔒 state (FR-510, §8.9: the focused treeitem announces it). */
const POLICY_NAME = `นโยบายบริษัท ${th.pages.protectedIcon}`
const BATCH = uuid(40)
const deleted = (title: string) =>
  okResult({ batch: BATCH, count: 0, title, space: 'WORKSPACE' as const, projectId: null, parentId: null })

const tree = () => screen.getByRole('tree', { name: th.pages.tree.wikiLabel })
const item = (name: string) => within(tree()).getByRole('treeitem', { name })

beforeEach(() => {
  nav.push.mockReset()
  nav.pathname = '/home'
})

describe('PageTree (FR-503, FR-506, FR-510, UI-01/02)', () => {
  it('links follow the server position order and point at /p/<id>', () => {
    renderWiki()
    const links = within(tree()).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['📘คู่มือทีม', '📄นโยบายบริษัท'])
    expect(links[0]).toHaveAttribute('href', `/p/${GUIDE}`)
    expect(item('คู่มือทีม')).toHaveAttribute('aria-level', '1')
    expect(item('คู่มือทีม')).toHaveAttribute('aria-expanded', 'false')
    expect(item(POLICY_NAME)).not.toHaveAttribute('aria-expanded')
  })

  it('the protected row carries the 🔒 img; a worker gets no + and no drag handle on it', () => {
    renderWiki()
    expect(
      within(item(POLICY_NAME)).getByRole('img', { name: th.pages.protectedIcon }),
    ).toBeInTheDocument()
    expect(
      within(item('คู่มือทีม')).queryByRole('img', { name: th.pages.protectedIcon }),
    ).not.toBeInTheDocument()
    expect(
      within(item(POLICY_NAME)).queryByRole('button', { name: th.pages.addChild('นโยบายบริษัท') }),
    ).toBeNull()
    expect(within(item(POLICY_NAME)).queryByRole('button', { name: th.pages.tree.dragHandle })).toBeNull()
    // the unprotected row keeps both
    expect(
      within(item('คู่มือทีม')).getByRole('button', { name: th.pages.addChild('คู่มือทีม') }),
    ).toBeInTheDocument()
    expect(
      within(item('คู่มือทีม')).getByRole('button', { name: th.pages.tree.dragHandle }),
    ).toBeInTheDocument()
  })

  it("the focused treeitem's name includes the protected state (not only the inner 🔒 img)", () => {
    renderWiki()
    const rows = within(tree()).getAllByRole('treeitem')
    expect(rows[1]).toHaveAccessibleName(POLICY_NAME)
    expect(rows[1]!.getAttribute('aria-label')).toContain(th.pages.protectedIcon)
    expect(rows[0]).toHaveAccessibleName('คู่มือทีม')
  })

  it('a manager may edit, move and protect the protected row', async () => {
    renderWiki({ user: MANAGER })
    const row = item(POLICY_NAME)
    expect(within(row).getByRole('button', { name: th.pages.addChild('นโยบายบริษัท') })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: th.pages.tree.dragHandle })).toBeInTheDocument()
    await userEvent.click(within(row).getByRole('button', { name: th.pages.menu('นโยบายบริษัท') }))
    expect(screen.getByRole('menuitem', { name: th.pages.unprotect })).toBeInTheDocument()
  })

  it('expand saves sidebar.expanded = [page:<id>] and shows the loaded children at level 2', async () => {
    const children: PageTreeResponse = {
      nodes: [treeNode({ id: CHILD, title: 'วิธีใช้ระบบนี้', parentId: GUIDE, depth: 1 })],
      canCreate: true,
    }
    const { setPreference } = renderWiki({ children })
    expect(within(tree()).queryByRole('treeitem', { name: 'วิธีใช้ระบบนี้' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: th.pages.tree.expand('คู่มือทีม') }))
    expect(setPreference).toHaveBeenCalledWith('sidebar.expanded', [`page:${GUIDE}`])
    expect(item('วิธีใช้ระบบนี้')).toHaveAttribute('aria-level', '2')
    expect(item('คู่มือทีม')).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(screen.getByRole('button', { name: th.pages.tree.collapse('คู่มือทีม') }))
    expect(setPreference).toHaveBeenLastCalledWith('sidebar.expanded', [])
    expect(within(tree()).queryByRole('treeitem', { name: 'วิธีใช้ระบบนี้' })).toBeNull()
  })

  it('starts expanded from the preference', () => {
    renderWiki({
      expanded: ['project:x', `page:${GUIDE}`],
      children: {
        nodes: [treeNode({ id: CHILD, title: 'ลูก', parentId: GUIDE, depth: 1 })],
        canCreate: true,
      },
    })
    expect(item('ลูก')).toHaveAttribute('aria-level', '2')
  })

  it('an expanded row whose children are loading is aria-busy with a skeleton under it', () => {
    renderWiki({ expanded: [`page:${GUIDE}`] }) // getJson never resolves: the level stays pending
    expect(item('คู่มือทีม')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByTestId('tree-children-loading')).toBeInTheDocument()
    expect(item(POLICY_NAME)).not.toHaveAttribute('aria-busy')
  })

  it('a failed child level shows the load error + retry under the row; retry loads the children', async () => {
    api.getJson.mockRejectedValueOnce(new Error('x'))
    renderWiki({ expanded: [`page:${GUIDE}`] })
    const alert = await within(tree()).findByRole('alert')
    expect(alert).toHaveTextContent(th.pages.tree.loadError)
    expect(item('คู่มือทีม')).not.toHaveAttribute('aria-busy')
    api.getJson.mockResolvedValueOnce({
      nodes: [treeNode({ id: CHILD, title: 'ลูก', parentId: GUIDE, depth: 1 })],
      canCreate: true,
    } satisfies PageTreeResponse as never)
    await userEvent.click(within(tree()).getByRole('button', { name: th.pages.tree.retry }))
    expect(await within(tree()).findByRole('treeitem', { name: 'ลูก' })).toHaveAttribute('aria-level', '2')
    expect(within(tree()).queryByRole('alert')).toBeNull()
  })

  it('+ creates a child page, expands the parent and opens it', async () => {
    actions.createPage.mockReturnValue(
      okResult({
        page: treeNode({ id: NEW, title: '' }),
        space: 'WORKSPACE',
        projectId: null,
        href: `/p/${NEW}`,
      }),
    )
    const { setPreference } = renderWiki({ expanded: ['project:x'] })
    await userEvent.click(screen.getByRole('button', { name: th.pages.addChild('คู่มือทีม') }))
    expect(actions.createPage).toHaveBeenCalledWith({ space: 'WORKSPACE', projectId: null, parentId: GUIDE })
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith(`/p/${NEW}`))
    expect(setPreference).toHaveBeenCalledWith('sidebar.expanded', ['project:x', `page:${GUIDE}`])
  })

  it('a failed create shows the server message and stays', async () => {
    actions.createPage.mockReturnValue(
      Promise.resolve({ ok: false, code: 'FORBIDDEN', message: th.pages.errors.protectedReadOnly }),
    )
    renderWiki()
    await userEvent.click(screen.getByRole('button', { name: th.pages.addChild('คู่มือทีม') }))
    expect(await screen.findByText(th.pages.errors.protectedReadOnly)).toBeInTheDocument()
    expect(nav.push).not.toHaveBeenCalled()
  })

  it("the charter row's menu has no delete item", async () => {
    renderPages(
      <PageTree
        space="PROJECT"
        projectId={PID}
        label={th.pages.tree.projectLabel('POS Upgrade')}
        variant="full"
      />,
      {
        user: WORKER,
        seed: (qc) =>
          qc.setQueryData(qk.pagesTree('PROJECT', PID, null), {
            nodes: [treeNode({ id: CHARTER, title: th.pages.charterTitle, icon: '📋', isCharter: true })],
            canCreate: true,
          } satisfies PageTreeResponse),
      },
    )
    const t = screen.getByRole('tree', { name: th.pages.tree.projectLabel('POS Upgrade') })
    await userEvent.click(within(t).getByRole('button', { name: th.pages.menu(th.pages.charterTitle) }))
    expect(screen.getByRole('menuitem', { name: th.pages.duplicate })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: th.pages.delete })).not.toBeInTheDocument()
  })

  it('a read-only space (archived project): no drag handles, no +, no menu', () => {
    renderWiki({ data: wiki({ canCreate: false }) })
    expect(within(tree()).queryByRole('button', { name: th.pages.tree.dragHandle })).toBeNull()
    expect(within(tree()).queryByRole('button', { name: th.pages.addChild('คู่มือทีม') })).toBeNull()
    expect(within(tree()).queryByRole('button', { name: th.pages.menu('คู่มือทีม') })).toBeNull()
  })

  it('marks the open page with aria-current and no + at depth 9', () => {
    nav.pathname = `/p/${GUIDE}`
    renderWiki({
      data: { nodes: [treeNode({ id: GUIDE, title: 'ลึก', depth: 9 })], canCreate: true },
    })
    expect(within(item('ลึก')).getByRole('link')).toHaveAttribute('aria-current', 'page')
    expect(within(item('ลึก')).queryByRole('button', { name: th.pages.addChild('ลึก') })).toBeNull()
  })

  describe('keyboard (WAI-ARIA tree, P1) and the FR-503 keyboard moves', () => {
    const withChild = {
      expanded: [`page:${GUIDE}`],
      children: {
        nodes: [treeNode({ id: CHILD, title: 'วิธีใช้ระบบนี้', parentId: GUIDE, depth: 1 })],
        canCreate: true,
      },
    }

    it('one tab stop: the first row (or the open page); inner controls of other rows are out of the Tab order', () => {
      renderWiki()
      expect(item('คู่มือทีม')).toHaveAttribute('tabindex', '0')
      expect(item(POLICY_NAME)).toHaveAttribute('tabindex', '-1')
      expect(within(item('คู่มือทีม')).getByRole('link')).toHaveAttribute('tabindex', '0')
      expect(within(item(POLICY_NAME)).getByRole('link')).toHaveAttribute('tabindex', '-1')
    })

    it('the open page is the tab stop', () => {
      nav.pathname = `/p/${POLICY}`
      renderWiki()
      expect(item(POLICY_NAME)).toHaveAttribute('tabindex', '0')
      expect(item('คู่มือทีม')).toHaveAttribute('tabindex', '-1')
    })

    it('↓/↑ move focus, → enters an expanded row, ← goes back to the parent, End/Home', async () => {
      renderWiki(withChild)
      item('คู่มือทีม').focus()
      await userEvent.keyboard('{ArrowDown}')
      expect(item('วิธีใช้ระบบนี้')).toHaveFocus()
      expect(item('วิธีใช้ระบบนี้')).toHaveAttribute('tabindex', '0')
      await userEvent.keyboard('{ArrowLeft}')
      expect(item('คู่มือทีม')).toHaveFocus()
      await userEvent.keyboard('{ArrowRight}')
      expect(item('วิธีใช้ระบบนี้')).toHaveFocus()
      await userEvent.keyboard('{End}')
      expect(item(POLICY_NAME)).toHaveFocus()
      await userEvent.keyboard('{ArrowUp}{Home}')
      expect(item('คู่มือทีม')).toHaveFocus()
    })

    it('→ expands a collapsed row, ← collapses an expanded one (remembered in sidebar.expanded)', async () => {
      const { setPreference } = renderWiki()
      item('คู่มือทีม').focus()
      await userEvent.keyboard('{ArrowRight}')
      expect(setPreference).toHaveBeenLastCalledWith('sidebar.expanded', [`page:${GUIDE}`])
    })

    it('Enter opens the page (activates the row link)', async () => {
      renderWiki()
      const clicked = vi.fn((e: Event) => e.preventDefault())
      within(item(POLICY_NAME)).getByRole('link').addEventListener('click', clicked)
      item(POLICY_NAME).focus()
      await userEvent.keyboard('{Enter}')
      expect(clicked).toHaveBeenCalledTimes(1)
    })

    it('the drag handle is pointer-only: no Tab stop, no English dnd-kit semantics; Thai instructions instead', () => {
      renderWiki()
      const handle = within(item('คู่มือทีม')).getByRole('button', { name: th.pages.tree.dragHandle })
      expect(handle).toHaveAttribute('tabindex', '-1')
      expect(handle).not.toHaveAttribute('aria-roledescription')
      expect(handle).not.toHaveAttribute('aria-describedby')
      expect(document.body.textContent).not.toMatch(/draggable item|press the space bar/i)
      expect(screen.getByText(th.pages.tree.dragInstructions)).toBeInTheDocument()
    })

    it('⋯ ย้ายลง on the first root moves it after its next sibling; no ย้ายขึ้น / ดึงออก there', async () => {
      actions.movePage.mockReturnValue(okResult({}))
      renderWiki()
      await userEvent.click(screen.getByRole('button', { name: th.pages.menu('คู่มือทีม') }))
      expect(screen.queryByRole('menuitem', { name: th.pages.tree.moveUp })).toBeNull()
      expect(screen.queryByRole('menuitem', { name: th.pages.tree.outdent })).toBeNull()
      expect(screen.queryByRole('menuitem', { name: th.pages.tree.indent })).toBeNull()
      await userEvent.click(screen.getByRole('menuitem', { name: th.pages.tree.moveDown }))
      expect(actions.movePage).toHaveBeenCalledWith({ pageId: GUIDE, parentId: null, afterId: POLICY })
    })

    it('⋯ ย้ายเข้าไปใต้หน้าก่อนหน้า loads the collapsed target level, goes after its last child and expands it', async () => {
      actions.movePage.mockReturnValue(okResult({}))
      api.getJson.mockResolvedValueOnce({
        nodes: [treeNode({ id: CHILD, title: 'วิธีใช้ระบบนี้', parentId: GUIDE, depth: 1 })],
        canCreate: true,
      } satisfies PageTreeResponse as never)
      const { setPreference } = renderWiki({ user: MANAGER })
      await userEvent.click(screen.getByRole('button', { name: th.pages.menu('นโยบายบริษัท') }))
      await userEvent.click(screen.getByRole('menuitem', { name: th.pages.tree.indent }))
      await waitFor(() =>
        expect(actions.movePage).toHaveBeenCalledWith({ pageId: POLICY, parentId: GUIDE, afterId: CHILD }),
      )
      expect(setPreference).toHaveBeenCalledWith('sidebar.expanded', [`page:${GUIDE}`])
    })

    it('⋯ ย้ายขึ้น / ดึงออก on a child', async () => {
      actions.movePage.mockReturnValue(okResult({}))
      renderWiki(withChild)
      await userEvent.click(screen.getByRole('button', { name: th.pages.menu('วิธีใช้ระบบนี้') }))
      expect(screen.queryByRole('menuitem', { name: th.pages.tree.moveUp })).toBeNull()
      await userEvent.click(screen.getByRole('menuitem', { name: th.pages.tree.outdent }))
      expect(actions.movePage).toHaveBeenCalledWith({ pageId: CHILD, parentId: null, afterId: GUIDE })
    })

    it('a worker gets no move items on a protected row (the server is still the authority)', async () => {
      renderWiki()
      await userEvent.click(screen.getByRole('button', { name: th.pages.menu('นโยบายบริษัท') }))
      expect(screen.getByRole('menuitem', { name: th.pages.duplicate })).toBeInTheDocument()
      for (const label of [th.pages.tree.moveUp, th.pages.tree.indent])
        expect(screen.queryByRole('menuitem', { name: label })).toBeNull()
    })
  })

  describe('deleting a row from its ⋯ menu moves focus off the row before it disappears (§8.9)', () => {
    it('→ the next visible row after its subtree; focus stays there once the row is gone', async () => {
      actions.deletePage.mockReturnValue(deleted('คู่มือทีม'))
      const { qc } = renderWiki({
        expanded: [`page:${GUIDE}`],
        children: {
          nodes: [treeNode({ id: CHILD, title: 'วิธีใช้ระบบนี้', parentId: GUIDE, depth: 1 })],
          canCreate: true,
        },
      })
      await userEvent.click(screen.getByRole('button', { name: th.pages.menu('คู่มือทีม') }))
      await userEvent.click(screen.getByRole('menuitem', { name: th.pages.delete }))
      await waitFor(() => expect(item(POLICY_NAME)).toHaveFocus()) // not the child inside the deleted subtree
      await act(async () => {
        qc.setQueryData(qk.pagesTree('WORKSPACE', null, null), wiki({ nodes: [wiki().nodes[1]!] }))
      })
      expect(item(POLICY_NAME)).toHaveFocus()
      expect(document.activeElement).not.toBe(document.body)
    })

    it('the last row → the previous row', async () => {
      actions.deletePage.mockReturnValue(deleted('นโยบายบริษัท'))
      renderWiki({ user: MANAGER })
      await userEvent.click(screen.getByRole('button', { name: th.pages.menu('นโยบายบริษัท') }))
      await userEvent.click(screen.getByRole('menuitem', { name: th.pages.delete }))
      await waitFor(() => expect(item('คู่มือทีม')).toHaveFocus())
    })

    it('the only row → the empty state', async () => {
      actions.deletePage.mockReturnValue(deleted('คู่มือทีม'))
      const { qc } = renderWiki({ data: wiki({ nodes: [wiki().nodes[0]!] }) })
      await userEvent.click(screen.getByRole('button', { name: th.pages.menu('คู่มือทีม') }))
      await userEvent.click(screen.getByRole('menuitem', { name: th.pages.delete }))
      await waitFor(() => expect(actions.deletePage).toHaveBeenCalled())
      await act(async () => {
        qc.setQueryData(qk.pagesTree('WORKSPACE', null, null), wiki({ nodes: [] }))
      })
      await waitFor(() => expect(screen.getByText(th.pages.tree.empty)).toHaveFocus())
    })

    it('a failed delete keeps the row and focus on its ⋯ button', async () => {
      actions.deletePage.mockReturnValue(
        Promise.resolve({ ok: false, code: 'INTERNAL', message: th.errors.INTERNAL }),
      )
      renderWiki()
      const menu = screen.getByRole('button', { name: th.pages.menu('คู่มือทีม') })
      await userEvent.click(menu)
      await userEvent.click(screen.getByRole('menuitem', { name: th.pages.delete }))
      expect(await screen.findByText(th.errors.INTERNAL)).toBeInTheDocument()
      expect(menu).toHaveFocus()
    })
  })

  it('empty and error states', async () => {
    const { unmount } = renderWiki({ data: { nodes: [], canCreate: true } })
    expect(screen.getByText(th.pages.tree.empty)).toBeInTheDocument()
    unmount()
    api.getJson.mockRejectedValueOnce(new Error('x'))
    renderPages(
      <PageTree space="WORKSPACE" projectId={null} label={th.pages.tree.wikiLabel} variant="sidebar" />,
    )
    expect(await screen.findByText(th.pages.tree.loadError)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: th.pages.tree.retry })).toBeInTheDocument()
  })
})
