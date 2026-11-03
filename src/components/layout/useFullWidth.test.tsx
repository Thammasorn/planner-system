// useFullWidth (FR-1602, AC-1602, M6.1-D15; plan/m06.1 S4.2): optimistic toggle, an undo entry WITHOUT a toast whose
// undo calls the action with the old value, revert + error toast when the action fails, hidden without edit.
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UndoContext, type UndoApi, type UndoEntry } from '@/components/undo/useUndo'
import { th } from '@/i18n/th'
import type { RowBodyView } from '@/lib/contracts/row-pages'
import type { TaskBodyView } from '@/lib/contracts/task-pages'
import { qk } from '@/lib/query-keys'
import { useFullWidth } from './useFullWidth'

const m = vi.hoisted(() => ({
  setPageFullWidth: vi.fn(),
  toastError: vi.fn(),
}))
vi.mock('@/server/actions/pages', () => ({ setPageFullWidth: m.setPageFullWidth }))
vi.mock('sonner', () => ({ toast: { error: m.toastError } }))

function setup(opts: {
  initial?: boolean
  canEdit?: boolean
  target?: { pageId: string } | { taskId: string } | { rowId: string }
}) {
  const pushed: { entry: UndoEntry; opts: { toast?: string } | undefined }[] = []
  const undo: UndoApi = {
    push: (entry, o) => pushed.push({ entry, opts: o }),
    undo: async () => undefined,
    redo: async () => undefined,
    undoEntry: async () => undefined,
    canUndo: false,
    canRedo: false,
  }
  const qc = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <UndoContext.Provider value={undo}>{children}</UndoContext.Provider>
    </QueryClientProvider>
  )
  const target = opts.target ?? { pageId: 'p1' }
  const hook = renderHook(
    () =>
      useFullWidth({ target, initial: opts.initial ?? false, canEdit: opts.canEdit ?? true, label: 'หน้า' }),
    { wrapper },
  )
  return { ...hook, pushed, qc }
}

const ok = (pageId: string, fullWidth: boolean) => ({ ok: true, pageId, fullWidth, changed: true })

beforeEach(() => {
  m.setPageFullWidth.mockReset()
  m.toastError.mockReset()
})

describe('useFullWidth', () => {
  it('toggles optimistically, calls the action once and pushes an undo entry without a toast', async () => {
    m.setPageFullWidth.mockResolvedValue(ok('p1', true))
    const { result, pushed } = setup({})
    act(() => result.current.toggle())
    expect(result.current.fullWidth).toBe(true)
    expect(m.setPageFullWidth).toHaveBeenCalledWith({ pageId: 'p1', fullWidth: true })
    await waitFor(() => expect(pushed).toHaveLength(1))
    expect(pushed[0]?.opts?.toast).toBeUndefined()
    expect(pushed[0]?.entry.label).toBe(th.layout.fullWidth)
  })

  it('undo calls the action with the old value and shows it; redo re-applies', async () => {
    m.setPageFullWidth.mockImplementation(({ fullWidth }: { fullWidth: boolean }) =>
      Promise.resolve(ok('p1', fullWidth)),
    )
    const { result, pushed } = setup({})
    act(() => result.current.toggle())
    await waitFor(() => expect(pushed).toHaveLength(1))
    await act(() => pushed[0]!.entry.undo())
    expect(m.setPageFullWidth).toHaveBeenLastCalledWith({ pageId: 'p1', fullWidth: false })
    expect(result.current.fullWidth).toBe(false)
    await act(() => pushed[0]!.entry.redo())
    expect(m.setPageFullWidth).toHaveBeenLastCalledWith({ pageId: 'p1', fullWidth: true })
    expect(result.current.fullWidth).toBe(true)
  })

  it('reverts and shows the error toast when the action fails (no undo entry)', async () => {
    m.setPageFullWidth.mockResolvedValue({ ok: false, code: 'FORBIDDEN', message: 'ห้าม' })
    const { result, pushed } = setup({ initial: true })
    act(() => result.current.toggle())
    expect(result.current.fullWidth).toBe(false)
    await waitFor(() => expect(result.current.fullWidth).toBe(true))
    expect(m.toastError).toHaveBeenCalledOnce()
    expect(pushed).toHaveLength(0)
  })

  it('cannot toggle without edit rights', () => {
    const { result } = setup({ canEdit: false })
    expect(result.current.canToggle).toBe(false)
    act(() => result.current.toggle())
    expect(result.current.fullWidth).toBe(false)
    expect(m.setPageFullWidth).not.toHaveBeenCalled()
  })

  it('a task target patches the cached task body (fullWidth) after success', async () => {
    m.setPageFullWidth.mockResolvedValue(ok('b1', true))
    const { result, qc } = setup({ target: { taskId: 't1' } })
    const view: TaskBodyView = {
      taskId: 't1',
      projectId: 'pr',
      page: { id: 'b1', version: 1, content: [], fullWidth: false, isBlank: true },
      can: { edit: true },
      uploadLimits: { maxBytes: 1, imageTypes: [], fileTypes: [] } as unknown as TaskBodyView['uploadLimits'],
    }
    qc.setQueryData(qk.taskBody('t1'), view)
    act(() => result.current.toggle())
    expect(m.setPageFullWidth).toHaveBeenCalledWith({ taskId: 't1', fullWidth: true })
    await waitFor(() => expect(qc.getQueryData<TaskBodyView>(qk.taskBody('t1'))?.page?.fullWidth).toBe(true))
  })

  it('a row target (M11-D8) sends rowId and patches the cached row body', async () => {
    m.setPageFullWidth.mockResolvedValue(ok('rb1', true))
    const { result, qc } = setup({ target: { rowId: 'r1' } })
    const view: RowBodyView = {
      rowId: 'r1',
      databaseId: 'd1',
      ownerPageId: 'p1',
      space: 'WORKSPACE',
      projectId: null,
      page: { id: 'rb1', version: 1, content: [], fullWidth: false, isBlank: true },
      can: { edit: true },
      uploadLimits: { maxBytes: 1, imageTypes: [], fileTypes: [] } as unknown as RowBodyView['uploadLimits'],
      databaseLevel: 1,
      canNestDatabase: true,
    }
    qc.setQueryData(qk.rowBody('r1'), view)
    act(() => result.current.toggle())
    expect(m.setPageFullWidth).toHaveBeenCalledWith({ rowId: 'r1', fullWidth: true })
    await waitFor(() => expect(qc.getQueryData<RowBodyView>(qk.rowBody('r1'))?.page?.fullWidth).toBe(true))
  })
})
