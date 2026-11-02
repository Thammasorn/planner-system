// M10 S3.4 — the "มุมมองงาน" block inside a real BlockNote view (FR-1301/1304, M10-D3/D7/D8/D31): list from the embed
// answer, wiki placeholder, view toggle writes only the prop (no task data in the document), read-only editor keeps the
// data without the toolbar, and keys inside the live view never edit the document (S3.1 isolation).
import { BlockNoteView } from '@blocknote/mantine'
import { useCreateBlockNote } from '@blocknote/react'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PID, response, T } from '@/components/tasks/fixtures.test.data'
import { renderTasks } from '@/components/tasks/render.test.helper'
import { th } from '@/i18n/th'
import { getJson } from '@/lib/api'
import type { EmbedTasksResponse } from '@/lib/contracts/embed'
import { PageEditorContext } from '../../PageEditorContext'
import { type AppEditor, type AppPartialBlock, schema } from '../../schema'

vi.mock('@/server/actions/tasks', () => ({
  createTask: vi.fn(),
  updateTask: vi.fn(),
  indentTask: vi.fn(),
  outdentTask: vi.fn(),
  moveTask: vi.fn(),
  completeTask: vi.fn(),
  uncompleteTask: vi.fn(),
  setTaskStatus: vi.fn(),
  revertTaskStatus: vi.fn(),
  deleteTaskTree: vi.fn(() => new Promise(() => {})),
  restoreTaskBatch: vi.fn(),
}))
vi.mock('@/server/actions/assignments', () => ({
  assign: vi.fn(),
  unassign: vi.fn(),
  restoreAssignmentBatch: vi.fn(),
}))
vi.mock('@/server/actions/task-blockers', () => ({ addTaskBlocker: vi.fn(), removeTaskBlocker: vi.fn() }))
vi.mock('@/lib/api', () => ({ getJson: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }))

const PAGE = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const fetchJson = vi.mocked(getJson)
const project: EmbedTasksResponse = {
  kind: 'project',
  projectId: PID,
  projectName: 'POS Upgrade',
  tasksHref: `/projects/${PID}/tasks`,
  data: response(),
}

beforeAll(() => {
  // jsdom lacks these; Mantine (colour scheme) and ProseMirror (coords) call them
  window.matchMedia ??= ((media: string) => ({
    matches: false,
    media,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
  document.elementFromPoint ??= () => null
})

const current: { editor: AppEditor | null } = { editor: null }
function Doc({ content }: { content: AppPartialBlock[] }) {
  const e = useCreateBlockNote({ schema, initialContent: content })
  useEffect(() => {
    current.editor = e
  }, [e])
  return <BlockNoteView editor={e} />
}

function mount(o: { editable?: boolean; content?: AppPartialBlock[] } = {}) {
  const editable = o.editable ?? true
  return renderTasks(
    <PageEditorContext value={{ pageId: PAGE, editable }}>
      <Doc content={o.content ?? [{ type: 'taskView', props: { view: 'LIST' } }]} />
    </PageEditorContext>,
  )
}

const ed = (): AppEditor => current.editor as AppEditor

beforeEach(() => {
  current.editor = null
  fetchJson.mockReset()
})

describe('taskView block (FR-1301, M10-D3/D7/D8/D31)', () => {
  it('a PROJECT page renders the live list in a labelled region', async () => {
    fetchJson.mockResolvedValue(project)
    mount()
    expect(await screen.findByRole('row', { name: 'งาน C' })).toBeInTheDocument()
    expect(
      screen.getByRole('region', {
        name: th.editor.liveBlocks.regionLabel(th.editor.liveBlocks.taskViewTitle, 'POS Upgrade'),
      }),
    ).toHaveAttribute('contenteditable', 'false')
    expect(fetchJson).toHaveBeenCalledWith(`/api/pages/${PAGE}/embed/tasks`, expect.anything())
  })

  it('a wiki page shows the placeholder and no list', async () => {
    fetchJson.mockResolvedValue({ kind: 'wiki' })
    mount()
    expect(await screen.findByText(th.editor.liveBlocks.wikiOnly)).toBeInTheDocument()
    expect(screen.queryByRole('treegrid')).toBeNull()
  })

  it('the view toggle writes props.view only — no task data in the document', async () => {
    fetchJson.mockResolvedValue(project)
    mount()
    await screen.findByRole('row', { name: 'งาน C' })
    const before = JSON.parse(JSON.stringify(ed().document)) as { props: Record<string, unknown> }[]
    fireEvent.click(screen.getByRole('button', { name: th.editor.liveBlocks.view.BOARD }))
    await waitFor(() => expect((ed().document[0]?.props as { view?: string }).view).toBe('BOARD'))
    const after = JSON.parse(JSON.stringify(ed().document)) as { props: Record<string, unknown> }[]
    expect(after).toEqual([{ ...before[0], props: { ...before[0]?.props, view: 'BOARD' } }])
    const json = JSON.stringify(ed().document)
    for (const name of response().tasks.map((t) => t.name)) expect(json).not.toContain(name)
    expect(json).not.toContain(PID)
  })

  it('a read-only editor: no toolbar, the data still renders (M10-D31)', async () => {
    fetchJson.mockResolvedValue(project)
    mount({ editable: false })
    expect(await screen.findByRole('row', { name: 'งาน C' })).toBeInTheDocument()
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('Backspace / Delete / Enter on a focused row never edit the document (S3.1)', async () => {
    fetchJson.mockResolvedValue(project)
    mount({
      content: [
        { type: 'paragraph', content: 'ก่อน' },
        { type: 'taskView', props: { view: 'LIST' } },
        { type: 'paragraph', content: 'หลัง' },
      ],
    })
    const row = await screen.findByRole('row', { name: 'งาน C' })
    const before = JSON.stringify(ed().document)
    act(() => row.focus())
    for (const key of ['Backspace', 'Delete', 'Enter']) fireEvent.keyDown(row, { key })
    expect(ed().document).toHaveLength(3)
    expect(JSON.stringify(ed().document)).toBe(before)
    expect(row.closest('[data-task-id]')).toHaveAttribute('data-task-id', T.c)
  })

  it('a paste inside the live view is left to the browser (ProseMirror does not take it)', async () => {
    fetchJson.mockResolvedValue(project)
    mount()
    const row = await screen.findByRole('row', { name: 'งาน C' })
    const paste = new Event('paste', { bubbles: true, cancelable: true })
    act(() => {
      row.dispatchEvent(paste)
    })
    expect(paste.defaultPrevented).toBe(false)
    expect(ed().document).toHaveLength(1)
  })

  it('copy to other apps exports the title only', () => {
    fetchJson.mockResolvedValue(project)
    mount()
    const html = ed().blocksToHTMLLossy(ed().document)
    expect(html).toContain(th.editor.liveBlocks.taskViewTitle)
    expect(html).not.toContain('งาน C')
  })
})
