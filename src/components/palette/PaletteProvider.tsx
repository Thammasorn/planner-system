'use client'
import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useOptionalLeaveDialog } from '@/components/calendar/LeaveDialogProvider'
import { useHotkeys } from '@/hooks/useHotkeys'
import { th } from '@/i18n/th'
import { unwrap } from '@/lib/action-result'
import { invalidatePages } from '@/lib/invalidate'
import { HOTKEYS } from '@/lib/keys'
import { createPage } from '@/server/actions/pages'
import { projectIdFromPath, type PaletteCommandCtx } from './commands'
import { usePaletteScope } from './project-scope'
import { prefetchSearchIndex } from './useSearchIndex'

// Loaded on first use only: the dialog brings the milestone form, its mutations and the date picker (M8 S4.10).
const MilestoneDialog = lazy(() =>
  import('@/components/milestones/MilestoneDialog').then((m) => ({ default: m.MilestoneDialog })),
)

/** M10: a command that starts right after the dialog opens (the `N` fallback opens "สร้าง task", M10-D25). */
export type PaletteStart = 'task.create'

export interface PaletteApi {
  isOpen: boolean
  open: (o?: { start?: PaletteStart }) => void
  close: () => void
  toggle: () => void
}

/** M10 (S2.4): the palette's step — search, or one of the "สร้าง task" steps. Reset to search on close. */
export type PaletteMode =
  { kind: 'search' } | { kind: 'pickProject' } | { kind: 'taskName'; project: { id: string; name: string } }

const SEARCH: PaletteMode = { kind: 'search' }
const noop = () => {}

/** A non-empty text selection inside the BlockNote editor (`.bn-editor`): Cmd+K there is the link shortcut. */
function isEditorTextSelection(e: KeyboardEvent): boolean {
  if (!(e.target instanceof Element) || !e.target.closest('.bn-editor')) return false
  const sel = window.getSelection()
  return sel !== null && !sel.isCollapsed
}

/** Outside a provider (isolated component tests) the palette is closed and the controls do nothing. */
const PaletteContext = createContext<PaletteApi>({ isOpen: false, open: noop, close: noop, toggle: noop })

const PaletteModeContext = createContext<{ mode: PaletteMode; setMode: (m: PaletteMode) => void }>({
  mode: SEARCH,
  setMode: noop,
})

/** What quick commands may open (M8: the milestone dialog; M10: the create-task steps). */
interface PaletteActions {
  openMilestoneDialog: (o: { projectId?: string }) => void
  beginCreateTask: () => void
}
const PaletteActionsContext = createContext<PaletteActions>({
  openMilestoneDialog: noop,
  beginCreateTask: noop,
})

/** Runs `fn` when the browser is idle (falls back to a timeout); returns the cancel function. */
function whenIdle(fn: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(fn, { timeout: 2000 })
    return () => window.cancelIdleCallback(id)
  }
  const id = window.setTimeout(fn, 200)
  return () => window.clearTimeout(id)
}

/**
 * Open state of the command palette (FR-1102, X08) and the global Cmd/Ctrl+K toggle — also while typing (inputs,
 * the editor). `useHotkeys` matches `e.code` first (Thai layout, X49) and skips events someone already handled
 * (`defaultPrevented`). BlockNote's Cmd+K link shortcut wins while text is selected in the editor (r3 G16): its
 * listener exists only once the formatting toolbar has mounted, so a selection inside the editor is skipped here too.
 * M8 (M8-D18): also holds the "สร้าง milestone" dialog that the palette command opens, rendered once here.
 * M10: the palette step (`PaletteMode`), `open({ start })`, and the search index prefetch once the shell is idle.
 */
export function PaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false)
  const [mode, setMode] = useState<PaletteMode>(SEARCH)
  const [milestoneDialog, setMilestoneDialog] = useState<{ open: boolean; projectId?: string }>({
    open: false,
  })
  const scope = usePaletteScope()
  const qc = useQueryClient()

  // M10-D21: warm the local index so the first keystroke already has projects / people / clients
  useEffect(() => whenIdle(() => void prefetchSearchIndex(qc)), [qc])

  const beginCreateTask = useCallback(
    () =>
      setMode(
        scope && !scope.archived
          ? { kind: 'taskName', project: { id: scope.id, name: scope.name } }
          : { kind: 'pickProject' },
      ),
    [scope],
  )
  const close = useCallback(() => {
    setOpen(false)
    setMode(SEARCH)
  }, [])
  const api = useMemo<PaletteApi>(
    () => ({
      isOpen,
      open: (o) => {
        setOpen(true)
        if (o?.start === 'task.create') beginCreateTask()
      },
      close,
      toggle: () => (isOpen ? close() : setOpen(true)),
    }),
    [isOpen, close, beginCreateTask],
  )
  const openMilestoneDialog = useCallback(
    (o: { projectId?: string }) =>
      setMilestoneDialog({ open: true, ...(o.projectId !== undefined ? { projectId: o.projectId } : {}) }),
    [],
  )
  const actions = useMemo<PaletteActions>(
    () => ({ openMilestoneDialog, beginCreateTask }),
    [openMilestoneDialog, beginCreateTask],
  )
  const modeApi = useMemo(() => ({ mode, setMode }), [mode])
  useHotkeys([
    {
      hotkey: HOTKEYS.palette,
      handler: () => api.toggle(),
      allowInEditable: true,
      skip: isEditorTextSelection,
    },
  ])
  return (
    <PaletteContext value={api}>
      <PaletteModeContext value={modeApi}>
        <PaletteActionsContext value={actions}>
          {children}
          {milestoneDialog.open ? (
            <Suspense fallback={null}>
              <MilestoneDialog
                open
                projectId={milestoneDialog.projectId}
                onClose={() => setMilestoneDialog({ open: false })}
              />
            </Suspense>
          ) : null}
        </PaletteActionsContext>
      </PaletteModeContext>
    </PaletteContext>
  )
}

export function usePalette(): PaletteApi {
  return useContext(PaletteContext)
}

/** M10: the current palette step and its setter (CommandPalette renders it). */
export function usePaletteMode(): { mode: PaletteMode; setMode: (m: PaletteMode) => void } {
  return useContext(PaletteModeContext)
}

/**
 * The one place a PaletteCommandCtx is built (X88, C48). M8's fields as before; M10 adds navigate, openLeaveDialog,
 * beginCreateTask, createPageHere and makes `currentProjectId` prefer the palette project scope (M10-D24).
 */
export function useCommandCtx(): PaletteCommandCtx {
  const { close } = usePalette()
  const { openMilestoneDialog, beginCreateTask } = useContext(PaletteActionsContext)
  const pathname = usePathname()
  const router = useRouter()
  const scope = usePaletteScope()
  const leave = useOptionalLeaveDialog()
  const qc = useQueryClient()
  return useMemo(() => {
    // FR-1103 "สร้างหน้า": a blank page in the current (non-archived) project, else in the team wiki; the blank page
    // then shows M4's template chooser. Ids come from the server (X53).
    const createPageHere = async () => {
      const target =
        scope && !scope.archived
          ? { space: 'PROJECT' as const, projectId: scope.id }
          : { space: 'WORKSPACE' as const, projectId: null }
      try {
        const r = await unwrap(createPage({ ...target, parentId: null }))
        void invalidatePages(qc, target)
        close()
        router.push(r.href)
      } catch {
        toast.error(th.palette.createPage.failed)
      }
    }
    return {
      close,
      pathname,
      currentProjectId: scope?.id ?? projectIdFromPath(pathname),
      openMilestoneDialog,
      navigate: (href: string) => router.push(href),
      openLeaveDialog: () => leave?.open({ mode: 'create' }),
      beginCreateTask,
      createPageHere,
    }
  }, [close, pathname, openMilestoneDialog, beginCreateTask, router, scope, leave, qc])
}
