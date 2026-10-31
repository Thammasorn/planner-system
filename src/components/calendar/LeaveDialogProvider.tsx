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
import type { ISODate } from '@/domain/types'
import type { CalendarTimeOffFull } from '@/lib/contracts/calendar'

export type LeaveDialogArgs =
  | { mode: 'create'; startDate?: ISODate; endDate?: ISODate; userId?: string }
  | {
      mode: 'edit'
      entry: CalendarTimeOffFull
      /** Where focus goes after the entry is deleted (SPEC §8.9): its chip — the element MUI returns focus to —
       *  unmounts with the refetch, so the opener passes a target that survives it (the month grid's day cell). */
      returnFocus?: () => HTMLElement | null | undefined
    }

export interface LeaveDialogApi {
  open: (args: LeaveDialogArgs) => void
}

export const LeaveDialogContext = createContext<LeaveDialogApi | null>(null)

/** Opens the one leave dialog of the app (M5-D14): /calendar, the user menu "แจ้งลา", later M9's person page and
 *  M10's palette. Throws outside `LeaveDialogProvider` (mounted once in AppShell). */
export function useLeaveDialog(): LeaveDialogApi {
  const api = useContext(LeaveDialogContext)
  if (!api) throw new Error('useLeaveDialog must be used inside <LeaveDialogProvider>')
  return api
}

/** For chrome that is also rendered outside AppShell (e.g. the sidebar in isolation): null without a provider. */
export function useOptionalLeaveDialog(): LeaveDialogApi | null {
  return useContext(LeaveDialogContext)
}

// Loaded on first open: the dialog (and its server-action references) stays off the critical path of every page.
const LeaveDialog = lazy(() => import('./LeaveDialog').then((m) => ({ default: m.LeaveDialog })))

/**
 * Hosts the leave dialog (FR-903, M5-D14). Each `open()` starts a fresh form session (new key), so pre-filled ranges
 * from the calendar never mix with a previous draft. Needs QueryClient, UndoProvider, CurrentUser and Today above it.
 */
export function LeaveDialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    args: LeaveDialogArgs
    session: number
    open: boolean
    focusAfterClose?: (() => HTMLElement | null | undefined) | undefined
  } | null>(null)
  const open = useCallback((args: LeaveDialogArgs) => {
    setState((s) => ({ args, session: (s?.session ?? 0) + 1, open: true }))
  }, [])
  const close = useCallback(() => setState((s) => (s ? { ...s, open: false } : s)), [])
  const closeAfterDelete = useCallback(
    () =>
      setState((s) =>
        s
          ? { ...s, open: false, focusAfterClose: s.args.mode === 'edit' ? s.args.returnFocus : undefined }
          : s,
      ),
    [],
  )
  // Runs after the commit that closed the dialog, i.e. after the focus trap's own restore (to the deleted chip).
  useEffect(() => {
    if (state && !state.open) state.focusAfterClose?.()?.focus()
  }, [state])
  const api = useMemo<LeaveDialogApi>(() => ({ open }), [open])
  return (
    <LeaveDialogContext value={api}>
      {children}
      {state ? (
        <Suspense fallback={null}>
          <LeaveDialog
            key={state.session}
            args={state.args}
            open={state.open}
            onClose={close}
            onDeleted={closeAfterDelete}
          />
        </Suspense>
      ) : null}
    </LeaveDialogContext>
  )
}
