'use client'
import { useMutation, type QueryKey } from '@tanstack/react-query'
import { useRef } from 'react'
import { toast } from 'sonner'
import { ActionError, unwrap, type ActionResult } from '@/lib/action-result'
import { th } from '@/i18n/th'
import { gridKeys } from './useGridWindow'
import type {
  GridResponse,
  SaveAllocationsCode,
  SaveAllocationsInput,
  SaveAllocationsOk,
} from './grid-types'

// The server action (src/server/actions/allocations.ts, 'use server') — declared here for the type-check.
declare function saveAllocations(
  input: SaveAllocationsInput,
): Promise<ActionResult<SaveAllocationsOk, SaveAllocationsCode, { current?: unknown; week?: string }>>

type Vars = Omit<SaveAllocationsInput, 'baseVersion'>
type Snapshot = Array<[QueryKey, GridResponse | undefined]>

export function useSaveAllocations(projectId: string) {
  // Latest known version per assignment. Read INSIDE mutationFn so queued saves use the
  // version returned by the previous save (scope serializes them).
  const versions = useRef(new Map<string, number>())

  return useMutation<SaveAllocationsOk, Error, Vars, { snapshot: Snapshot }>({
    mutationKey: ['saveAllocations', projectId],
    // All grid saves for this project run one-by-one in call order. (Next.js also dispatches
    // server actions one at a time per client, so there is no parallelism to lose.)
    scope: { id: `grid-save:${projectId}` },
    mutationFn: async (vars) => {
      const baseVersion = versions.current.get(vars.taskAssignmentId) ?? 0
      const ok = unwrap(await saveAllocations({ ...vars, baseVersion }))
      versions.current.set(vars.taskAssignmentId, ok.version)
      return ok
    },
    // Runs immediately (even while the scoped mutation waits) -> <50 ms optimistic feedback.
    onMutate: async (vars, ctx) => {
      await ctx.client.cancelQueries({ queryKey: gridKeys.project(projectId) })
      const snapshot = ctx.client.getQueriesData<GridResponse>({ queryKey: gridKeys.project(projectId) })
      ctx.client.setQueriesData<GridResponse>({ queryKey: gridKeys.project(projectId) }, (old) =>
        old ? applyChangesOptimistically(old, vars) : old,
      )
      return { snapshot }
    },
    onError: (err, _vars, onMutateResult, ctx) => {
      // Snapshot restore is only safe when nothing else is queued; otherwise resync from server.
      const others = ctx.client.isMutating({ mutationKey: ['saveAllocations', projectId] }) > 1
      if (onMutateResult && !others) {
        for (const [key, data] of onMutateResult.snapshot) ctx.client.setQueryData(key, data)
      } else {
        void ctx.client.invalidateQueries({ queryKey: gridKeys.project(projectId) })
      }
      if (err instanceof ActionError && err.code === 'VERSION_CONFLICT') {
        toast.warning(th.grid.conflict)
        void ctx.client.invalidateQueries({ queryKey: gridKeys.project(projectId) })
        return
      }
      toast.error(th.grid.saveFailed)
    },
    onSuccess: (data, vars, _r, ctx) => {
      // Write server truth (weeks incl. derived day split) into every cached chunk — no refetch.
      ctx.client.setQueriesData<GridResponse>({ queryKey: gridKeys.project(projectId) }, (old) =>
        old ? applyServerWeeks(old, vars.taskAssignmentId, data) : old,
      )
    },
  })
}

// --- pure helpers (belong in src/components/grid/cache-ops.ts, unit-tested) ---
declare function applyChangesOptimistically(old: GridResponse, vars: Vars): GridResponse
declare function applyServerWeeks(old: GridResponse, taskAssignmentId: string, ok: SaveAllocationsOk): GridResponse
