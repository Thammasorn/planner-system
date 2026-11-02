'use client'
import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { usePathname } from 'next/navigation'
import { useHotkeys } from '@/hooks/useHotkeys'
import { HOTKEYS } from '@/lib/keys'
import { projectIdFromPath, type PaletteCommandCtx } from './commands'

// Loaded on first use only: the dialog brings the milestone form, its mutations and the date picker (M8 S4.10).
const MilestoneDialog = lazy(() =>
  import('@/components/milestones/MilestoneDialog').then((m) => ({ default: m.MilestoneDialog })),
)

export interface PaletteApi {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

const noop = () => {}

/** A non-empty text selection inside the BlockNote editor (`.bn-editor`): Cmd+K there is the link shortcut. */
function isEditorTextSelection(e: KeyboardEvent): boolean {
  if (!(e.target instanceof Element) || !e.target.closest('.bn-editor')) return false
  const sel = window.getSelection()
  return sel !== null && !sel.isCollapsed
}

/** Outside a provider (isolated component tests) the palette is closed and the controls do nothing. */
const PaletteContext = createContext<PaletteApi>({ isOpen: false, open: noop, close: noop, toggle: noop })

/** What quick commands may open (M8: the milestone dialog; M10 adds its own openers). */
interface PaletteActions {
  openMilestoneDialog: (o: { projectId?: string }) => void
}
const PaletteActionsContext = createContext<PaletteActions>({ openMilestoneDialog: noop })

/**
 * Open state of the command palette (FR-1102, X08) and the global Cmd/Ctrl+K toggle — also while typing (inputs,
 * the editor). `useHotkeys` matches `e.code` first (Thai layout, X49) and skips events someone already handled
 * (`defaultPrevented`). BlockNote's Cmd+K link shortcut wins while text is selected in the editor (r3 G16): its
 * listener exists only once the formatting toolbar has mounted, so a selection inside the editor is skipped here too.
 * M8 (M8-D18): also holds the "สร้าง milestone" dialog that the palette command opens, rendered once here.
 */
export function PaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false)
  const [milestoneDialog, setMilestoneDialog] = useState<{ open: boolean; projectId?: string }>({
    open: false,
  })
  const api = useMemo<PaletteApi>(
    () => ({
      isOpen,
      open: () => setOpen(true),
      close: () => setOpen(false),
      toggle: () => setOpen((o) => !o),
    }),
    [isOpen],
  )
  const openMilestoneDialog = useCallback(
    (o: { projectId?: string }) =>
      setMilestoneDialog({ open: true, ...(o.projectId !== undefined ? { projectId: o.projectId } : {}) }),
    [],
  )
  const actions = useMemo<PaletteActions>(() => ({ openMilestoneDialog }), [openMilestoneDialog])
  useHotkeys([
    {
      hotkey: HOTKEYS.palette,
      handler: () => setOpen((o) => !o),
      allowInEditable: true,
      skip: isEditorTextSelection,
    },
  ])
  return (
    <PaletteContext value={api}>
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
    </PaletteContext>
  )
}

export function usePalette(): PaletteApi {
  return useContext(PaletteContext)
}

/**
 * The one place a PaletteCommandCtx is built (X88, C48). M10 extends it with its own fields (navigate,
 * openLeaveDialog, beginCreateTask, createPageHere; `currentProjectId` = palette scope first) without touching these.
 */
export function useCommandCtx(): PaletteCommandCtx {
  const { close } = usePalette()
  const { openMilestoneDialog } = useContext(PaletteActionsContext)
  const pathname = usePathname()
  return useMemo(
    () => ({ close, pathname, currentProjectId: projectIdFromPath(pathname), openMilestoneDialog }),
    [close, pathname, openMilestoneDialog],
  )
}
