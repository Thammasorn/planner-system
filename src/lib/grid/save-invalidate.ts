// src/lib/grid/save-invalidate.ts — the single post-save extension point (X82). The saving grid patches its own chunks
// (applyServerResults); every OTHER view that shows load is invalidated here. Keep it a flat list of invalidateQueries
// calls with no early return: M8 appends qk.projectMilestones(ctx.id) for project contexts (M8-D26), M9 appends
// ['grid', <the other context kind>] and qk.sidebar() (M9-D22).
import type { QueryClient } from '@tanstack/react-query'
import { qk, qkPrefix, type GridCtx } from '@/lib/query-keys'

export function invalidateAfterGridSave(qc: QueryClient, ctx: GridCtx): void {
  void ctx // M8/M9 branch on the context kind
  void qc.invalidateQueries({ queryKey: qk.myTasks() })
  void qc.invalidateQueries({ queryKey: qkPrefix.teamTasks })
  void qc.invalidateQueries({ queryKey: qkPrefix.workload })
  void qc.invalidateQueries({ queryKey: qkPrefix.home })
}
