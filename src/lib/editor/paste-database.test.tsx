// M11 S5.5 — deep copy on paste (FR-1471, M11-D13) with a real headless editor: makePasteHandler + the hook
// PageEditor wires (makeDatabasePasteHook). Duplicate id → copy; foreign source → copy; cut in the same page → keep;
// copy failure → id kept + toast; a task body without a row → ensure first, then copy into it.
import { BlockNoteEditor } from '@blocknote/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type AppEditor, schema } from '@/components/editor/schema'
import { th } from '@/i18n/th'
import { DEFAULT_UPLOAD_LIMITS } from '@/lib/files/upload-rules'
import { getDatabaseBlockPhase, resetDatabaseBlockState } from './database-block-state'
import {
  DATABASE_MIME,
  type DatabaseClip,
  encodeDatabaseClip,
  resetDatabaseClipRegistry,
} from './database-clipboard'
import { type DatabaseCopyDeps, makeDatabasePasteHook } from './database-copy-flow'
import { makePasteHandler } from './paste'

const PAGE_A = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
const PAGE_B = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const DB1 = '9b2d5f4e-1c3a-4b5d-8e7f-0a1b2c3d4e5f'
const COPY = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'

function event(clip: DatabaseClip | null): ClipboardEvent {
  const data: Record<string, string> = { 'blocknote/html': `<div data-database-id="${DB1}"></div>` }
  if (clip) data[DATABASE_MIME] = encodeDatabaseClip(clip)
  return {
    clipboardData: { types: Object.keys(data), getData: (t: string) => data[t] ?? '', files: [] },
  } as unknown as ClipboardEvent
}

function editorWith(databaseIds: string[]): AppEditor {
  const e = BlockNoteEditor.create({
    schema,
    initialContent: [
      { type: 'paragraph', content: 'ก่อน' },
      ...databaseIds.map((databaseId) => ({ type: 'database' as const, props: { databaseId } })),
    ],
  })
  e.setTextCursorPosition(e.document[0]!, 'end')
  return e
}

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve()
}

function setup(o: { pageId: string | null; existing: string[]; deps?: Partial<DatabaseCopyDeps> }) {
  const editor = editorWith(o.existing)
  let pageId = o.pageId
  const deps: DatabaseCopyDeps = {
    currentPageId: () => pageId,
    getPageId: vi.fn(() => {
      pageId ??= PAGE_A
      return Promise.resolve(pageId)
    }),
    copyDatabase: vi.fn(() => Promise.resolve({ databaseId: COPY })),
    notify: vi.fn(),
    ...o.deps,
  }
  const handler = makePasteHandler({
    notify: deps.notify,
    limits: DEFAULT_UPLOAD_LIMITS,
    onDatabaseBlocksPasted: makeDatabasePasteHook(deps),
  })
  const paste = (clip: DatabaseClip | null) =>
    handler({
      event: event(clip),
      editor,
      defaultPasteHandler: () => {
        editor.insertBlocks([{ type: 'database', props: { databaseId: DB1 } }], editor.document[0]!, 'after')
        return true
      },
    })
  const pasted = () => editor.document[1]!
  return { editor, deps, paste, pasted }
}

describe('paste of database blocks (M11-D13)', () => {
  beforeEach(() => {
    resetDatabaseBlockState()
    resetDatabaseClipRegistry()
  })

  it('duplicate id in the same page → copyDatabase from this page, the pasted block gets the new id', async () => {
    const { deps, paste, pasted, editor } = setup({ pageId: PAGE_A, existing: [DB1] })
    paste(null)
    expect(getDatabaseBlockPhase(pasted().id)).toBe('copying')
    await flush()
    expect(deps.copyDatabase).toHaveBeenCalledWith({
      sourcePageId: PAGE_A,
      sourceDatabaseId: DB1,
      targetPageId: PAGE_A,
    })
    expect(pasted().props).toEqual({ databaseId: COPY })
    expect(editor.document[2]!.props).toEqual({ databaseId: DB1 }) // the original keeps its id
    expect(getDatabaseBlockPhase(pasted().id)).toBeNull()
  })

  it('a block copied from another page → copy from that page', async () => {
    const { deps, paste, pasted } = setup({ pageId: PAGE_A, existing: [] })
    paste({ v: 1, sourcePageId: PAGE_B, cut: false, ids: [DB1] })
    await flush()
    expect(deps.copyDatabase).toHaveBeenCalledWith({
      sourcePageId: PAGE_B,
      sourceDatabaseId: DB1,
      targetPageId: PAGE_A,
    })
    expect(pasted().props).toEqual({ databaseId: COPY })
  })

  it('cut + paste in the same page keeps the id (no copy)', async () => {
    const { deps, paste, pasted } = setup({ pageId: PAGE_A, existing: [] })
    paste({ v: 1, sourcePageId: PAGE_A, cut: true, ids: [DB1] })
    await flush()
    expect(deps.copyDatabase).not.toHaveBeenCalled()
    expect(pasted().props).toEqual({ databaseId: DB1 })
    expect(getDatabaseBlockPhase(pasted().id)).toBeNull()
  })

  it('copy failure → toast, the id is kept (the block shows "ไม่พบฐานข้อมูล" if it is not this page’s)', async () => {
    const d = deferred<{ databaseId: string }>()
    const { deps, paste, pasted } = setup({
      pageId: PAGE_A,
      existing: [],
      deps: { copyDatabase: vi.fn(() => d.promise) },
    })
    paste({ v: 1, sourcePageId: PAGE_B, cut: false, ids: [DB1] })
    await flush()
    expect(getDatabaseBlockPhase(pasted().id)).toBe('copying')
    d.reject(new Error('NOT_FOUND'))
    await flush()
    expect(deps.notify).toHaveBeenCalledWith(th.database.toasts.copyFailed)
    expect(pasted().props).toEqual({ databaseId: DB1 })
    expect(getDatabaseBlockPhase(pasted().id)).toBeNull()
  })

  it('a task body without a row: ensure (getPageId) first, then copy into the new page', async () => {
    const order: string[] = []
    const { deps, paste, pasted } = setup({
      pageId: null,
      existing: [],
      deps: {
        getPageId: vi.fn(() => {
          order.push('ensure')
          return Promise.resolve(PAGE_A)
        }),
        copyDatabase: vi.fn((input: { targetPageId: string }) => {
          order.push(`copy→${input.targetPageId}`)
          return Promise.resolve({ databaseId: COPY })
        }),
      },
    })
    paste({ v: 1, sourcePageId: PAGE_B, cut: false, ids: [DB1] })
    await flush()
    expect(order).toEqual(['ensure', `copy→${PAGE_A}`])
    expect(deps.getPageId).toHaveBeenCalledOnce()
    expect(pasted().props).toEqual({ databaseId: COPY })
  })

  it('a removed block is not updated when the copy arrives late', async () => {
    const d = deferred<{ databaseId: string }>()
    const { editor, paste, pasted } = setup({
      pageId: PAGE_A,
      existing: [DB1],
      deps: { copyDatabase: vi.fn(() => d.promise) },
    })
    paste(null)
    const id = pasted().id
    editor.removeBlocks([id])
    d.resolve({ databaseId: COPY })
    await flush()
    expect(editor.document.some((b) => b.type === 'database' && b.props.databaseId === COPY)).toBe(false)
  })
})
