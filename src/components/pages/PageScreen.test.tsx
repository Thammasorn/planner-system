import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { PageCan, PageView } from '@/lib/contracts/pages'
import { DEFAULT_UPLOAD_LIMITS } from '@/lib/files/upload-rules'
import { PaletteProjectScopeProvider, usePaletteScope } from '@/components/palette/project-scope'
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
  setPageFullWidth: vi.fn(),
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
    kind: 'DOC',
    taskId: null,
    rowId: null,
    fullWidth: false,
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

  describe('M6.1: header bar and reading column (FR-1602, FR-1603)', () => {
    const header = () => screen.getByTestId('page-header')

    it('the header bar carries the breadcrumb (current page as text), 🔗 and ⋯; the title is the one <h1>-level field', () => {
      renderPages(
        <PageScreen
          view={{
            ...view({
              space: 'PROJECT',
              projectId: uuid(5),
              projectName: 'POS Upgrade',
              title: 'บันทึก',
              isBlank: false,
            }),
            breadcrumb: [{ id: uuid(20), title: 'Charter', icon: '📘' }],
          }}
        />,
      )
      const nav = within(header()).getByRole('navigation', { name: th.layout.breadcrumb })
      expect(within(nav).getByRole('link', { name: 'POS Upgrade' })).toHaveAttribute(
        'href',
        `/projects/${uuid(5)}/pages`,
      )
      expect(within(nav).getByRole('link', { name: '📘 Charter' })).toHaveAttribute('href', `/p/${uuid(20)}`)
      expect(within(nav).getByText('บันทึก').closest('[aria-current="page"]')).not.toBeNull()
      expect(within(header()).queryByRole('heading')).toBeNull()
      expect(within(header()).getByRole('button', { name: th.layout.copyLink })).toBeInTheDocument()
      expect(within(header()).getByRole('button', { name: th.pages.menu('บันทึก') })).toBeInTheDocument()
      expect(screen.getByTestId('page-column')).toHaveAttribute('data-full-width', 'false')
    })

    it('the editor gets the DOC contract and the header status slot', () => {
      renderPages(<PageScreen view={view({ title: 'ก', isBlank: false })} />)
      expect(editor.props.at(-1)).toMatchObject({
        kind: 'DOC',
        editorKey: PAGE,
        leaseAcquire: 'mount',
        variant: 'page',
      })
    })

    it('⋯ › เต็มความกว้าง (✓ when on) toggles the column optimistically and saves it', async () => {
      actions.setPageFullWidth.mockReturnValue(okResult({ pageId: PAGE, fullWidth: true, changed: true }))
      renderPages(<PageScreen view={view({ title: 'ก', isBlank: false })} />)
      await userEvent.click(within(header()).getByRole('button', { name: th.pages.menu('ก') }))
      const item = screen.getByRole('menuitemcheckbox', { name: th.layout.fullWidth })
      expect(item).toHaveAttribute('aria-checked', 'false')
      await userEvent.click(item)
      expect(screen.getByTestId('page-column')).toHaveAttribute('data-full-width', 'true')
      expect(actions.setPageFullWidth).toHaveBeenCalledWith({ pageId: PAGE, fullWidth: true })
      await userEvent.click(within(header()).getByRole('button', { name: th.pages.menu('ก') }))
      expect(screen.getByRole('menuitemcheckbox', { name: th.layout.fullWidth })).toHaveAttribute(
        'aria-checked',
        'true',
      )
    })

    it('a page saved full width opens full width; read-only viewers have no switch', async () => {
      renderPages(<PageScreen view={view({ title: 'นโยบาย', fullWidth: true, isBlank: false }, READ)} />)
      expect(screen.getByTestId('page-column')).toHaveAttribute('data-full-width', 'true')
      await userEvent.click(within(header()).getByRole('button', { name: th.pages.menu('นโยบาย') }))
      expect(screen.queryByRole('menuitemcheckbox', { name: th.layout.fullWidth })).toBeNull()
    })
  })
})

describe('M10-D24: the palette project scope', () => {
  function Scope() {
    const s = usePaletteScope()
    return (
      <output data-testid="palette-scope">{s ? `${s.id}:${s.name}:${String(s.archived)}` : 'none'}</output>
    )
  }
  const scope = () => screen.getByTestId('palette-scope').textContent

  it('a PROJECT page registers its project', () => {
    renderPages(
      <PaletteProjectScopeProvider>
        <PageScreen
          view={view({
            space: 'PROJECT',
            projectId: uuid(5),
            projectName: 'POS Upgrade',
            title: 'ก',
            isBlank: false,
          })}
        />
        <Scope />
      </PaletteProjectScopeProvider>,
    )
    expect(scope()).toBe(`${uuid(5)}:POS Upgrade:false`)
  })

  it('a wiki page registers nothing', () => {
    renderPages(
      <PaletteProjectScopeProvider>
        <PageScreen view={view({ title: 'ก', isBlank: false })} />
        <Scope />
      </PaletteProjectScopeProvider>,
    )
    expect(scope()).toBe('none')
  })
})
