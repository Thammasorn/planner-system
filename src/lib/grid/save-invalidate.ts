// src/lib/grid/save-invalidate.ts — the single post-save extension point (X82). The saving grid patches its own chunks
// (applyServerResults); every OTHER view that shows load is invalidated here. Keep it a flat list of invalidateQueries
// calls with no early return: M8 appends qk.projectMilestones / qk.projectTasks(ctx.id) for project contexts and
// ['calendar'] (M8-D26, S3.8), M9 appends
// ['grid', <the other context kind>] and qk.sidebar() (M9-D22).
import type { QueryClient } from '@tanstack/react-query'
import { qk, qkPrefix, type GridCtx } from '@/lib/query-keys'

export function invalidateAfterGridSave(qc: QueryClient, ctx: GridCtx): void {
  void qc.invalidateQueries({ queryKey: qk.myTasks() })
  void qc.invalidateQueries({ queryKey: qkPrefix.teamTasks })
  void qc.invalidateQueries({ queryKey: qkPrefix.workload })
  void qc.invalidateQueries({ queryKey: qkPrefix.home })
  // M8 (M8-D12/D26): the overview's late / lateTaskCount; the saving grid patched its own ◆ from ok.lateness
  // and the views that show BR-71 flags from the same plans: the task list (TaskDTO.lateForMilestone) and the team
  // calendar's ◆ (CalendarMilestone.late)
  if (ctx.kind === 'project') {
    void qc.invalidateQueries({ queryKey: qk.projectMilestones(ctx.id) })
    void qc.invalidateQueries({ queryKey: qk.projectTasks(ctx.id) })
  }
  void qc.invalidateQueries({ queryKey: qkPrefix.calendar })
  // M9 (M9-D22, C65): the OTHER grid context only (the saving one is patched via setQueriesData) + the sidebar
  // "งานของฉัน N" (M9-D17: the count depends on plans)
  void qc.invalidateQueries({ queryKey: ['grid', ctx.kind === 'person' ? 'project' : 'person'] })
  void qc.invalidateQueries({ queryKey: qk.sidebar() })
}
