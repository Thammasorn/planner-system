// M11 S5.3–S5.5 — PageEditor wiring of databases and row bodies: the slash context's createDatabase (row of a task
// body first, seeds qk.database, failure → toast + null; absent in DB_ROW bodies and for read-only viewers), the
// copy/cut listener that adds the database clipboard type after BlockNote wrote its own (bubble phase), and DB_ROW
// documents turning dropped database blocks into their title. BlockNoteView / SlashMenu are stand-ins (jsdom has no
// layout); the editor is the real headless BlockNote instance.
import { act, fireEvent, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { DatabaseResponse } from '@/lib/contracts/databases'
import { DATABASE_MIME, parseDatabaseClip, resetDatabaseClipRegistry, sourceOfDatabase } from '@/lib/editor/database-clipboard'
import { DEFAULT_UPLOAD_LIMITS } from '@/lib/files/upload-rules'
import { qk } from '@/lib/query-keys'
import { createDatabase } from '@/server/actions/databases'
import PageEditor, { type PageEditorShellProps } from './PageEditor'
import { renderWithClient } from './render.test.helper'
import type { AppEditor } from './schema'
import type { SlashCtx } from './slash-menu'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/server/actions/pages', () => ({ savePageContent: vi.fn(), createPage: vi.fn() }))
vi.mock('@/server/actions/databases', () => ({ createDatabase: vi.fn(), copyDatabase: vi.fn() }))

interface ViewProps {
  editor: AppEditor
  editable: boolean
  onChange: () => void
}
const views: ViewProps[] = []
const slashCtxs: SlashCtx[] = []
vi.mock('@blocknote/mantine', async () => {
  const { Children, isValidElement } = await import('react')
  return {
    BlockNoteView: (p: ViewProps & { children?: ReactNode }) => {
      views.push(p)
      // the children need a mounted BlockNote view; only the slash menu's context is read
      Children.forEach(p.children, (c) => {
        if (isValidElement<{ ctx?: SlashCtx }>(c) && c.props.ctx) slashCtxs.push(c.props.ctx)
      })
      return <div data-testid="bn-view" tabIndex={0} contentEditable={p.editable} suppressContentEditableWarning />
    },
  }
})

const PAGE = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const DB = '9b2d5f4e-1c3a-4b5d-8e7f-0a1b2c3d4e5f'

function props(over: Partial<PageEditorShellProps> = {}): PageEditorShellProps {
  return {
    pageId: PAGE,
    kind: 'DOC',
    editorKey: PAGE,
    space: 'WORKSPACE',
    projectId: null,
    depth: 0,
    initialContent: [],
    version: 1,
    canEdit: true,
    uploadLimits: DEFAULT_UPLOAD_LIMITS,
    reloadToken: 0,
    leaseAcquire: 'focus',
    variant: 'page',
    ...over,
  }
}
const lastCtx = () => slashCtxs.at(-1)!
const lastView = () => views.at(-1)!

/** A copy event whose clipboard already holds what BlockNote's handler wrote. */
function copyEvent(type: 'copy' | 'cut', html: string) {
  const store = new Map<string, string>([['blocknote/html', html]])
  const ev = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(ev, 'clipboardData', {
    value: {
      get types() {
        return [...store.keys()]
      },
      getData: (t: string) => store.get(t) ?? '',
      setData: (t: string, v: string) => void store.set(t, v),
    },
  })
  return { ev, store }
}

describe('PageEditor — databases', () => {
  beforeEach(() => {
    views.length = 0
    slashCtxs.length = 0
    vi.mocked(createDatabase).mockReset()
    resetDatabaseClipRegistry()
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))),
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it('createDatabase(view): ensures the page, calls the action, seeds qk.database and resolves the id', async () => {
    const database = { id: DB, title: '' } as DatabaseResponse
    vi.mocked(createDatabase).mockResolvedValue({ ok: true, databaseId: DB, database })
    const ensurePageId = vi.fn(() => Promise.resolve(PAGE))
    const { qc } = renderWithClient(
      <PageEditor {...props({ pageId: null, kind: 'TASK', editorKey: 'task:t', ensurePageId })} />,
    )
    let id: string | null = null
    await act(async () => {
      id = await lastCtx().createDatabase!('CALENDAR')
    })
    expect(ensurePageId).toHaveBeenCalledOnce()
    expect(createDatabase).toHaveBeenCalledWith({ pageId: PAGE, view: 'CALENDAR' })
    expect(id).toBe(DB)
    expect(qc.getQueryData(qk.database(PAGE, DB))).toBe(database)
  })

  it('createDatabase failure → the server message (or the fallback) as a toast, null', async () => {
    const spy = vi.spyOn(toast, 'error')
    vi.mocked(createDatabase).mockResolvedValue({ ok: false, code: 'VALIDATION', message: 'เกินจำนวน' })
    renderWithClient(<PageEditor {...props()} />)
    let id: string | null = 'x'
    await act(async () => {
      id = await lastCtx().createDatabase!('TABLE')
    })
    expect(id).toBeNull()
    expect(spy).toHaveBeenCalledWith('เกินจำนวน')
    vi.mocked(createDatabase).mockRejectedValue(new Error('network'))
    await act(async () => {
      id = await lastCtx().createDatabase!('TABLE')
    })
    expect(spy).toHaveBeenLastCalledWith(th.database.toasts.createFailed)
    spy.mockRestore()
  })

  it('no createDatabase in a row body (DB_ROW) or for a read-only viewer', () => {
    renderWithClient(<PageEditor {...props({ kind: 'DB_ROW', editorKey: 'row:r' })} />)
    expect(lastCtx().createDatabase).toBeUndefined()
    renderWithClient(<PageEditor {...props({ canEdit: false })} />)
    expect(lastCtx().createDatabase).toBeUndefined()
  })

  it('copy / cut on the surface adds the database type (after BlockNote wrote blocknote/html) + the registry', () => {
    renderWithClient(<PageEditor {...props()} />)
    const target = screen.getByTestId('bn-view')
    const { ev, store } = copyEvent('cut', `<div data-content-type="database" data-database-id="${DB}"></div>`)
    fireEvent(target, ev)
    expect(parseDatabaseClip(store.get(DATABASE_MIME) ?? '')).toEqual({
      v: 1,
      sourcePageId: PAGE,
      cut: true,
      ids: [DB],
    })
    expect(sourceOfDatabase(DB)).toEqual({ sourcePageId: PAGE, cut: true })
  })

  it('a copy without database blocks (or before the page exists) leaves the clipboard alone', () => {
    renderWithClient(<PageEditor {...props()} />)
    const { ev, store } = copyEvent('copy', '<p>text</p>')
    fireEvent(screen.getByTestId('bn-view'), ev)
    expect(store.has(DATABASE_MIME)).toBe(false)
  })

  it('DB_ROW: a database block that lands in the document (drop) becomes its title + toast', () => {
    const spy = vi.spyOn(toast, 'error')
    renderWithClient(<PageEditor {...props({ kind: 'DB_ROW', editorKey: 'row:r' })} />)
    const editor = lastView().editor
    act(() => {
      editor.replaceBlocks([editor.document[0]!.id], [{ type: 'database', props: { databaseId: DB } }])
      lastView().onChange()
    })
    expect(editor.document.some((b) => b.type === 'database')).toBe(false)
    expect(spy).toHaveBeenCalledWith(th.editor.errors.databaseNotAllowed)
    spy.mockRestore()
  })
})
