import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { PageCan, PageView } from '@/lib/contracts/pages'
import { DEFAULT_UPLOAD_LIMITS } from '@/lib/files/upload-rules'
import { PageScreen } from './PageScreen'
import { okResult, renderPages, uuid } from './render.test.helper'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/p/x' }))
const actions = vi.hoisted(() => ({
  renamePage: vi.fn(),
  setPageIcon: vi.fn(),
  setPageCover: vi.fn(),
  applyTemplate: vi.fn(),
  deletePage: vi.fn(),
  duplicatePage: vi.fn(),
  restorePageBatch: vi.fn(),
  setPageProtected: vi.fn(),
}))
vi.mock('@/server/actions/pages', () => actions)
const editor = vi.hoisted(() => ({ props: [] as unknown[] }))
vi.mock('@/components/editor/EditorClient', () => ({
  EditorClient: (p: { reloadToken: number; canEdit: boolean; onBlankChange?: (blank: boolean) => void }) => {
    editor.props.push(p)
    return (
      <div data-testid="page-editor" data-reload={p.reloadToken} data-can-edit={String(p.canEdit)}>
        {p.canEdit ? (
          <div
            className="bn-editor"
            contentEditable="true"
            suppressContentEditableWarning
            tabIndex={-1}
            data-testid="editor-content"
          />
        ) : null}
      </div>
    )
  },
}))
const api = vi.hoisted(() => ({ getJson: vi.fn() }))
vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  getJson: api.getJson,
}))

const PAGE = uuid(10)
const EDIT: PageCan = {
  edit: true,
  protect: false,
  delete: true,
  createChild: true,
  move: true,
  duplicate: true,
}
const READ: PageCan = {
  edit: false,
  protect: false,
  delete: false,
  createChild: false,
  move: false,
  duplicate: true,
}

const view = (over: Partial<PageView['page']> = {}, can: PageCan = EDIT): PageView => ({
  page: {
    id: PAGE,
    space: 'WORKSPACE',
    projectId: null,
    projectName: null,
    projectArchived: false,
    parentId: null,
    depth: 0,
    title: '',
    icon: null,
    cover: null,
    isCharter: false,
    locked: false,
    effectiveProtected: false,
    version: 1,
    content: [],
    isBlank: true,
    updatedAt: '2026-09-30T03:00:00.000Z',
    updatedBy: { id: uuid(1), name: 'Cindy' },
    ...over,
  },
  breadcrumb: [],
  can,
  uploadLimits: DEFAULT_UPLOAD_LIMITS,
})

const title = () => screen.getByRole('textbox', { name: th.pages.titleLabel })
const lastEditorProps = () => editor.props.at(-1) as { onBlankChange?: (blank: boolean) => void }

describe('PageScreen (FR-504, FR-507, FR-510)', () => {
  it('a blank page offers the template chooser to editors; typing a title hides it', async () => {
    actions.renamePage.mockReturnValue(okResult({ title: 'ก' }))
    renderPages(<PageScreen view={view()} />)
    expect(screen.getByRole('region', { name: th.pages.templates.heading })).toBeInTheDocument()
    expect(title()).not.toHaveAttribute('readonly')
    await userEvent.type(title(), 'ก{Enter}')
    expect(screen.queryByRole('region', { name: th.pages.templates.heading })).toBeNull()
    await waitFor(() => expect(actions.renamePage).toHaveBeenCalledWith({ pageId: PAGE, title: 'ก' }))
    expect(actions.renamePage).toHaveBeenCalledTimes(1)
  })

  it('applying a template sets title + icon and makes the editor reload', async () => {
    api.getJson.mockResolvedValue({ page: { version: 1, isBlank: true } })
    actions.applyTemplate.mockReturnValue(okResult({ version: 2, title: 'บันทึกการประชุม — x', icon: '📝' }))
    renderPages(<PageScreen view={view()} />)
    await userEvent.click(screen.getByRole('button', { name: th.pages.templates.meeting }))
    await waitFor(() => expect(title()).toHaveValue('บันทึกการประชุม — x'))
    expect(screen.getByTestId('page-editor')).toHaveAttribute('data-reload', '1')
    expect(screen.queryByRole('region', { name: th.pages.templates.heading })).toBeNull()
  })

  it('content typed in the editor (before its autosave) hides the chooser; a still-blank change keeps it', () => {
    renderPages(<PageScreen view={view()} />)
    const chooser = () => screen.queryByRole('region', { name: th.pages.templates.heading })
    act(() => lastEditorProps().onBlankChange?.(true))
    expect(chooser()).toBeInTheDocument()
    act(() => lastEditorProps().onBlankChange?.(false))
    expect(chooser()).toBeNull()
    act(() => lastEditorProps().onBlankChange?.(true)) // emptied again: stays hidden (no flicker, no late apply)
    expect(chooser()).toBeNull()
  })

  it('"ว่าง" hides the chooser and moves focus into the editor (never left on <body>)', async () => {
    renderPages(<PageScreen view={view()} />)
    await userEvent.click(screen.getByRole('button', { name: th.pages.templates.blank }))
    expect(screen.queryByRole('region', { name: th.pages.templates.heading })).toBeNull()
    await waitFor(() => expect(screen.getByTestId('editor-content')).toHaveFocus())
  })

  it('a non-SOP template moves focus to the (re-mounted) title', async () => {
    api.getJson.mockResolvedValue({ page: { version: 1, isBlank: true } })
    actions.applyTemplate.mockReturnValue(okResult({ version: 2, title: 'บันทึกการประชุม — x', icon: '📝' }))
    renderPages(<PageScreen view={view()} />)
    screen.getByRole('button', { name: th.pages.templates.meeting }).focus()
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(title()).toHaveFocus())
    expect(document.activeElement).not.toBe(document.body)
  })

  it('SOP focuses the empty title', async () => {
    api.getJson.mockResolvedValue({ page: { version: 1, isBlank: true } })
    actions.applyTemplate.mockReturnValue(okResult({ version: 2, title: '', icon: '📘' }))
    renderPages(<PageScreen view={view()} />)
    await userEvent.click(screen.getByRole('button', { name: th.pages.templates.sop }))
    await waitFor(() => expect(title()).toHaveFocus())
    expect(title()).toHaveValue('')
  })

  it('a worker on a protected page: banner, 🔒, read-only title, no chooser, read-only editor', () => {
    renderPages(<PageScreen view={view({ title: 'นโยบาย', locked: true, effectiveProtected: true }, READ)} />)
    expect(screen.getByText(th.pages.protectedBanner)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: th.pages.protectedIcon })).toBeInTheDocument()
    expect(title()).toHaveAttribute('readonly')
    expect(screen.queryByRole('region', { name: th.pages.templates.heading })).toBeNull()
    expect(screen.queryByRole('button', { name: th.pages.icon.button })).toBeNull()
    expect(screen.queryByRole('button', { name: th.pages.cover.add })).toBeNull()
    expect(screen.getByTestId('page-editor')).toHaveAttribute('data-can-edit', 'false')
  })

  describe('🔒 after the manager unprotects a page (FR-510, M4-D24 inheritance)', () => {
    const MANAGE: PageCan = { ...EDIT, protect: true }
    const lockIcon = () => screen.queryByRole('img', { name: th.pages.protectedIcon })
    const unprotect = async () => {
      await userEvent.click(screen.getByRole('button', { name: th.pages.menu('นโยบายย่อย') }))
      await userEvent.click(screen.getByRole('menuitem', { name: th.pages.unprotect }))
    }

    it('still under a locked ancestor: the 🔒 stays after the server re-read', async () => {
      actions.setPageProtected.mockReturnValue(okResult({ changed: true }))
      api.getJson.mockResolvedValue(
        view({ title: 'นโยบายย่อย', locked: false, effectiveProtected: true, isBlank: false }, MANAGE),
      )
      renderPages(
        <PageScreen
          view={view({ title: 'นโยบายย่อย', locked: true, effectiveProtected: true, isBlank: false }, MANAGE)}
        />,
      )
      expect(lockIcon()).toBeInTheDocument()
      await unprotect()
      await waitFor(() => expect(api.getJson).toHaveBeenCalledWith(`/api/pages/${PAGE}`, expect.anything()))
      expect(actions.setPageProtected).toHaveBeenCalledWith({ pageId: PAGE, protected: false })
      expect(lockIcon()).toBeInTheDocument()
    })

    it('no locked ancestor: the 🔒 goes once the server confirms', async () => {
      actions.setPageProtected.mockReturnValue(okResult({ changed: true }))
      api.getJson.mockResolvedValue(
        view({ title: 'นโยบายย่อย', locked: false, effectiveProtected: false, isBlank: false }, MANAGE),
      )
      renderPages(
        <PageScreen
          view={view({ title: 'นโยบายย่อย', locked: true, effectiveProtected: true, isBlank: false }, MANAGE)}
        />,
      )
      await unprotect()
      await waitFor(() => expect(lockIcon()).toBeNull())
    })

    it('an inherited protection alone (own lock off) shows the 🔒; locking it keeps it', async () => {
      actions.setPageProtected.mockReturnValue(okResult({ changed: true }))
      api.getJson.mockResolvedValue(
        view({ title: 'นโยบายย่อย', locked: true, effectiveProtected: true, isBlank: false }, MANAGE),
      )
      renderPages(
        <PageScreen
          view={view(
            { title: 'นโยบายย่อย', locked: false, effectiveProtected: true, isBlank: false },
            MANAGE,
          )}
        />,
      )
      expect(lockIcon()).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: th.pages.menu('นโยบายย่อย') }))
      await userEvent.click(screen.getByRole('menuitem', { name: th.pages.protect }))
      await waitFor(() => expect(api.getJson).toHaveBeenCalled())
      expect(lockIcon()).toBeInTheDocument()
    })
  })

  it('an archived project page shows the archived banner and the project breadcrumb', () => {
    renderPages(
      <PageScreen
        view={view(
          {
            space: 'PROJECT',
            projectId: uuid(5),
            projectName: 'POS Upgrade',
            projectArchived: true,
            title: 'ก',
            isBlank: false,
          },
          READ,
        )}
      />,
    )
    expect(screen.getByText(th.pages.archivedBanner)).toBeInTheDocument()
    expect(screen.queryByText(th.pages.protectedBanner)).toBeNull()
    expect(screen.getByRole('link', { name: 'POS Upgrade' })).toHaveAttribute(
      'href',
      `/projects/${uuid(5)}/pages`,
    )
  })
})
