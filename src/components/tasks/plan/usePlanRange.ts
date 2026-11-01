'use client'
// src/components/tasks/plan/usePlanRange.ts — FR-612 "วางแผน N วัน" per assignee (BR-25, M6-D6/D13/D14): a debounced
// dryRun preview and the apply that pushes one undo entry. Versions go through the per-tab registry shared with the
// grid (M6-D14) so the dialog and the grid never fight over an assignment's version.
import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useUndo } from '@/components/undo/useUndo'
import type { Cd, ISODate } from '@/domain/types'
import { formatCd } from '@/domain/units'
import { th } from '@/i18n/th'
import { ActionFailure, unwrap } from '@/lib/action-result'
import type { PlanAssignmentRangeOk, PlanRangePreview, SaveValidationIssue } from '@/lib/contracts/grid'
import { snapshotFromState, snapshotToChanges, type WeekSnapshot } from '@/lib/grid/undo'
import { knownVersion, rememberVersion } from '@/lib/grid/versions'
import { invalidateLoad, invalidateTasks } from '@/lib/invalidate'
import { planAssignmentRange, saveAllocations } from '@/server/actions/allocations'

export const PREVIEW_DEBOUNCE_MS = 300

let opSeq = 0
const nextOpId = (kind: string) => `plan-${kind}-${++opSeq}`

export interface PlanRangeRequest {
  totalCd: Cd
  start: ISODate
  end: ISODate
}

export type PreviewState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; preview: PlanRangePreview; request: PlanRangeRequest }
  | { kind: 'unrepresentable' }
  | { kind: 'error'; message: string }

const failureMessage = (err: unknown): string =>
  err instanceof Error && err.message !== '' ? err.message : th.errors.INTERNAL

const isUnrepresentable = (err: unknown): boolean =>
  err instanceof ActionFailure &&
  err.code === 'VALIDATION' &&
  Array.isArray(err.extra.issues) &&
  (err.extra.issues as SaveValidationIssue[]).some((i) => i.reason === 'UNREPRESENTABLE')

const sameRequest = (a: PlanRangeRequest, b: PlanRangeRequest) =>
  a.totalCd === b.totalCd && a.start === b.start && a.end === b.end

/**
 * `request` null = nothing valid to preview (empty/invalid total or dates). The preview reruns 300 ms after the last
 * change; answers to superseded requests are dropped.
 */
export function usePlanRange(o: {
  taskAssignmentId: string
  projectId: string
  personName: string
  request: PlanRangeRequest | null
  onApplied: () => void
}) {
  const { taskAssignmentId, projectId, personName, request } = o
  const qc = useQueryClient()
  const undo = useUndo()
  const [applying, setApplying] = useState(false)
  const [rerun, setRerun] = useState(0)
  /** The latest answer, tagged with the request (+ rerun count) it answers; the shown state derives from it. */
  const [result, setResult] = useState<{ key: string; state: PreviewState } | null>(null)
  const seq = useRef(0)
  const totalCd = request?.totalCd
  const start = request?.start
  const end = request?.end
  const key = request ? `${request.totalCd}|${request.start}|${request.end}|${rerun}` : null
  const state: PreviewState =
    key === null ? { kind: 'idle' } : result?.key === key ? result.state : { kind: 'loading' }

  useEffect(() => {
    const my = ++seq.current
    if (totalCd === undefined || start === undefined || end === undefined || key === null) return
    const req: PlanRangeRequest = { totalCd, start, end }
    const run = async () => {
      try {
        const r: PlanAssignmentRangeOk = unwrap(
          await planAssignmentRange({
            taskAssignmentId,
            baseVersion: null,
            totalCd,
            start,
            end,
            dryRun: true,
            clientOpId: nextOpId('preview'),
          }),
        )
        if (seq.current !== my) return
        rememberVersion(taskAssignmentId, r.preview.version)
        setResult({ key, state: { kind: 'ready', preview: r.preview, request: req } })
      } catch (err) {
        if (seq.current !== my) return
        setResult({
          key,
          state: isUnrepresentable(err)
            ? { kind: 'unrepresentable' }
            : { kind: 'error', message: failureMessage(err) },
        })
      }
    }
    const timer = setTimeout(() => void run(), PREVIEW_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [taskAssignmentId, totalCd, start, end, key])

  const refreshViews = () => Promise.all([invalidateLoad(qc), invalidateTasks(qc, projectId)]).then(() => {})

  /** Writes week snapshots back exactly (DAY weeks as 7 DAY changes, COLLAPSE), on the latest known version. */
  const writeSnapshots = async (snaps: readonly WeekSnapshot[]) => {
    const ok = unwrap(
      await saveAllocations({
        items: [
          {
            taskAssignmentId,
            baseVersion: knownVersion(taskAssignmentId),
            changes: snaps.flatMap(snapshotToChanges),
          },
        ],
        onDayWeekConflict: 'COLLAPSE',
        clientOpId: nextOpId('undo'),
      }),
    )
    for (const r of ok.results) rememberVersion(r.taskAssignmentId, r.version)
    await refreshViews()
  }

  const canApply = state.kind === 'ready' && request !== null && sameRequest(state.request, request) && !applying

  const apply = async () => {
    if (state.kind !== 'ready' || !canApply) return
    const { preview, request: req } = state
    setApplying(true)
    try {
      const r = unwrap(
        await planAssignmentRange({
          taskAssignmentId,
          baseVersion: preview.version,
          totalCd: req.totalCd,
          start: req.start,
          end: req.end,
          dryRun: false,
          clientOpId: nextOpId('apply'),
        }),
      )
      if (r.applied) rememberVersion(taskAssignmentId, r.applied.version)
      const before = r.preview.weeks.map((w) => snapshotFromState(w.before, taskAssignmentId, w.week))
      const after = r.preview.weeks.map((w) => snapshotFromState(w.after, taskAssignmentId, w.week))
      undo.push(
        { label: th.grid.undo.planRange, undo: () => writeSnapshots(before), redo: () => writeSnapshots(after) },
        {
          toast: th.plan.applied(formatCd(req.totalCd, { unit: 'DAYS', decimals: 1 }) || '0.0', personName),
        },
      )
      await refreshViews()
      o.onApplied()
    } catch (err) {
      if (err instanceof ActionFailure && err.code === 'VERSION_CONFLICT') {
        toast.warning(th.grid.toast.conflict)
        setRerun((n) => n + 1)
      } else if (isUnrepresentable(err)) {
        if (key !== null) setResult({ key, state: { kind: 'unrepresentable' } })
      } else {
        toast.error(failureMessage(err))
      }
    } finally {
      setApplying(false)
    }
  }

  return { state, canApply, applying, apply }
}
