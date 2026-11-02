// M11 S5.2 — the database block (FR-1401…1408, FR-1462, FR-1464, M11-D13/D21): placeholder states, the island with
// S3's view (props from the page context; data editable by page permission, not the lease), the remembered title,
// and isolation / undo routing: Mod+Z in the island → the database stack (useUndo), a cell input keeps its own keys
// (Backspace never reaches ProseMirror: the spec is not selectable), the block handle's delete removes the whole
// block and the editor's undo brings it back with the same id.
import { BlockNoteEditor } from '@blocknote/core'
import { act, fireEvent, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseBlockViewProps } from '@/components/database/DatabaseBlockView'
import { UndoContext, type UndoApi } from '@/components/undo/useUndo'
import { th } from '@/i18n/th'
import {
  databaseTitleOf,
  resetDatabaseBlockState,
  setDatabaseBlockPhase,
} from '@/lib/editor/database-block-state'
import { qk } from '@/lib/query-keys'
import { PageEditorContext, type PageEditorContextValue } from '../../PageEditorContext'
import { makeTestQueryClient, renderWithClient } from '../../render.test.helper'
import { schema } from '../../schema'
import { DatabaseBlock } from './DatabaseBlock'

const viewProps: DatabaseBlockViewProps[] = []
vi.mock('@/components/database/DatabaseBlockView', () => ({
  DatabaseBlockView: (p: DatabaseBlockViewProps) => {
    viewProps.push(p)
    return (
      <div data-testid="db-block" data-database-id={p.databaseId}>
        <div tabIndex={0} data-testid="cell">
          cell
        </div>
        <input aria-label="cell-input" />
      </div>
    )
  },
}))

const PAGE = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
const DB = '9b2d5f4e-1c3a-4b5d-8e7f-0a1b2c3d4e5f'

function undoApi(): UndoApi {
  return {
    push: vi.fn(),
    undo: vi.fn(() => Promise.resolve()),
    redo: vi.fn(() => Promise.resolve()),
    undoEntry: vi.fn(() => Promise.resolve()),
    canUndo: true,
    canRedo: true,
  }
}

function mount(
  props: { blockId?: string; databaseId: string; editorEditable?: boolean },
  ctx: PageEditorContextValue | null = { pageId: PAGE, editable: true },
  qc = makeTestQueryClient(),
) {
  const api = undoApi()
  const wrap = (children: ReactNode) =>
    ctx ? <PageEditorContext value={ctx}>{children}</PageEditorContext> : children
  const r = renderWithClient(
    <UndoContext value={api}>
      {wrap(
        <DatabaseBlock
          blockId={props.blockId ?? 'blk'}
          databaseId={props.databaseId}
          editorEditable={props.editorEditable ?? true}
        />,
      )}
    </UndoContext>,
    qc,
  )
  return { api, ...r }
}

describe('DatabaseBlock — states', () => {
  beforeEach(() => {
    viewProps.length = 0
    resetDatabaseBlockState()
  })

  it('databaseId "" while creating → "กำลังสร้างฐานข้อมูล…" (busy), no view', () => {
    setDatabaseBlockPhase('blk', 'creating')
    mount({ databaseId: '' })
    const region = screen.getByRole('region', { name: th.database.creating })
    expect(region).toHaveAttribute('aria-busy', 'true')
    expect(region).toHaveAttribute('data-testid', 'db-block')
    expect(screen.getByRole('status')).toHaveTextContent(th.database.creating)
    expect(viewProps).toHaveLength(0)
  })

  it('a stale empty block (nobody creating it) → "ไม่พบฐานข้อมูล"', () => {
    mount({ databaseId: '' })
    expect(screen.getByRole('region', { name: th.database.notFound })).toHaveAttribute('aria-busy', 'false')
  })

  it('copying → "กำลังคัดลอกฐานข้อมูล…", then the view once the phase clears', () => {
    setDatabaseBlockPhase('blk', 'copying')
    mount({ databaseId: DB })
    expect(screen.getByRole('region', { name: th.database.copying })).toBeInTheDocument()
    expect(viewProps).toHaveLength(0)
    act(() => setDatabaseBlockPhase('blk', null)) // the store drives the switch
    expect(viewProps.at(-1)?.databaseId).toBe(DB)
  })

  it('renders the view inside a non-editable island with page id, block id and variant', () => {
    mount({ databaseId: DB }, { pageId: PAGE, editable: true, variant: 'compact' })
    expect(viewProps.at(-1)).toEqual({
      pageId: PAGE,
      databaseId: DB,
      blockId: 'blk',
      variant: 'compact',
      editable: true,
    })
    const island = screen.getByTestId('db-block').parentElement!
    expect(island).toHaveAttribute('contenteditable', 'false')
    expect(island).toHaveAttribute('data-db-island')
  })

  it('FR-1462: data stays editable while the editor is read-only (lease held elsewhere) if the page is editable', () => {
    mount({ databaseId: DB }, { pageId: PAGE, editable: false, canEdit: true })
    expect(viewProps.at(-1)?.editable).toBe(true)
    mount({ databaseId: DB }, { pageId: PAGE, editable: false, canEdit: false })
    expect(viewProps.at(-1)?.editable).toBe(false)
  })

  it('without a page editor: pageId null, variant page, the editor flag', () => {
    mount({ databaseId: DB, editorEditable: false }, null)
    expect(viewProps.at(-1)).toMatchObject({ pageId: null, variant: 'page', editable: false })
  })

  it('remembers the cached title (never fetches)', () => {
    const qc = makeTestQueryClient()
    qc.setQueryData(qk.database(PAGE, DB), { title: 'ลูกค้า' })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    mount({ databaseId: DB }, { pageId: PAGE, editable: true }, qc)
    expect(databaseTitleOf(DB)).toBe('ลูกค้า')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('DatabaseBlock — isolation and undo routing (FR-1407, M11-D21)', () => {
  beforeEach(() => {
    viewProps.length = 0
    resetDatabaseBlockState()
  })

  it('Mod+Z / Mod+Shift+Z on a cell run the database undo / redo (default prevented)', () => {
    const { api } = mount({ databaseId: DB })
    const cell = screen.getByTestId('cell')
    expect(fireEvent.keyDown(cell, { key: 'z', code: 'KeyZ', metaKey: true })).toBe(false)
    expect(api.undo).toHaveBeenCalledOnce()
    expect(fireEvent.keyDown(cell, { key: 'z', code: 'KeyZ', ctrlKey: true, shiftKey: true })).toBe(false)
    expect(api.redo).toHaveBeenCalledOnce()
  })

  it('inside a cell input Mod+Z and Backspace stay the input’s own (not prevented, no app undo)', () => {
    const { api } = mount({ databaseId: DB })
    const input = screen.getByRole('textbox', { name: 'cell-input' })
    expect(fireEvent.keyDown(input, { key: 'z', code: 'KeyZ', metaKey: true })).toBe(true)
    expect(fireEvent.keyDown(input, { key: 'Backspace', code: 'Backspace' })).toBe(true)
    expect(api.undo).not.toHaveBeenCalled()
  })

  it('the spec is a non-selectable, content-less block (ProseMirror ignores events from inside)', () => {
    const spec = schema.blockSpecs.database
    expect(spec.config.content).toBe('none')
    expect(spec.implementation.meta?.selectable).toBe(false)
  })

  it('the block handle deletes the whole block and the editor undo restores it with the same id', () => {
    const editor = BlockNoteEditor.create({
      schema,
      initialContent: [
        { type: 'paragraph', content: 'ก่อน' },
        { type: 'database', props: { databaseId: DB } },
      ],
    })
    const host = document.createElement('div')
    document.body.append(host)
    editor.mount(host) // the history plugin needs a view (headless editors cannot undo)
    const block = editor.document[1]!
    editor.removeBlocks([block.id]) // what the side menu's "ลบ" does
    expect(editor.document.some((b) => b.type === 'database')).toBe(false)
    editor.undo()
    const back = editor.document.find((b) => b.type === 'database')
    expect(back?.props).toEqual({ databaseId: DB })
    editor.unmount()
    host.remove()
  })
})
