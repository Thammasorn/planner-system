'use client'
// src/components/grid/useGridMilestones.tsx — everything ◆ for PlanGrid (SPEC §4.7 FR-702/705/707/708, FR-820, §8.9;
// plan/m08 S3.3–S3.6, M8-D8–D11, C40) so PlanGrid only renders `row(...)`, `overlays` and the toolbar button:
// - the MilestoneRow props (placement, drag, gestures) and the dash-dot milestone lines for the marker layer;
// - popovers (details / create / "+N" list) and the ◆ cell menu (CellMenu `items`);
// - every edit patches the cached chunks optimistically (applyMilestonePatch / removeMilestone / sortedInsert)
//   BEFORE the shared useMilestoneMutations call (one undo entry + toast, invalidateMilestones on settle); a call that
//   fails before reaching the hook re-syncs the grid.
// Reads only model.context.canManage, never the context kind; mutations take projectId from the GridMilestone.
import { useQueryClient } from '@tanstack/react-query'
import type { VirtualItem } from '@tanstack/react-virtual'
import { useCallback, useMemo, useState, type ReactNode, type RefObject } from 'react'
import { useMilestoneMutations, type MilestonePatch } from '@/components/milestones/useMilestoneMutations'
import { milestoneStatus } from '@/domain/milestone'
import type { ISODate } from '@/domain/types'
import { th } from '@/i18n/th'
import type { GridMilestone, GridResponse } from '@/lib/contracts/grid'
import type { GridMarkerView } from '@/lib/contracts/plan-markers'
import type { GridColumn } from '@/lib/grid/columns'
import type { GridModel } from '@/lib/grid/merge'
import {
  applyMilestonePatch,
  dateForCellClick,
  milestoneMarkerViews,
  removeMilestone,
  sortedInsert,
  type MilestoneGridPatch,
} from '@/lib/grid/milestones'
import { milestoneTooltipFor } from '@/lib/grid/tooltip'
import { qk, type GridCtx } from '@/lib/query-keys'
import { CellMenu, type CellMenuItem } from './CellMenu'
import { MilestoneCreatePopover, MilestonePopover, MilestoneStackPopover } from './MilestonePopover'
import { milestoneDisplayName, MilestoneRow, type MilestoneMenuTarget } from './MilestoneRow'
import { useMilestoneDrag } from './useMilestoneDrag'

const NO_MILESTONES: readonly GridMilestone[] = []
const NO_TARGETS: readonly { taskAssignmentId: string; week: ISODate }[] = []
const noop = () => {}

export interface GridMilestones {
  canManage: boolean
  milestones: readonly GridMilestone[]
  byId: ReadonlyMap<string, GridMilestone>
  /** FR-820: dash-dot lines, concatenated with the plan markers by PlanGrid */
  markerViews: GridMarkerView[]
  row: (vCols: readonly VirtualItem[], totalWidth: number) => ReactNode
  overlays: ReactNode
  /** toolbar "+ milestone" (managers only): the create popover at `anchor`, pre-filled with today */
  openCreate: (anchor: Element, date?: ISODate) => void
  /** CellTooltip content of a ◆ button (data-tip="milestone") */
  tooltipFor: (el: HTMLElement) => string[] | null
}

export function useGridMilestones(o: {
  context: GridCtx
  model: GridModel | null
  cols: readonly GridColumn[]
  scrollEl: RefObject<HTMLElement | null>
  today: ISODate
  thisWeek: ISODate
  /** M9 (S3.6): person grid only — each ◆ prefixed with its project's name (null = none) */
  projectLabel?: (projectId: string) => string | null
}): GridMilestones {
  const { context, model, cols, today, thisWeek, projectLabel } = o
  const canManage = model?.context.canManage ?? false
  const milestones = model?.milestones ?? NO_MILESTONES
  const byId = useMemo(() => new Map(milestones.map((m) => [m.id, m])), [milestones])
  const markerViews = useMemo(() => milestoneMarkerViews(milestones), [milestones])
  const qc = useQueryClient()
  const mut = useMilestoneMutations()

  const patchGrid = useCallback(
    (f: (r: GridResponse) => GridResponse) =>
      qc.setQueriesData<GridResponse>({ queryKey: qk.gridAll(context) }, (r) => (r ? f(r) : r)),
    [qc, context],
  )
  const run = useCallback(
    (call: () => Promise<unknown>) => {
      const resync = () => void qc.invalidateQueries({ queryKey: qk.gridAll(context) })
      try {
        call().catch(resync)
      } catch {
        resync()
      }
    },
    [qc, context],
  )

  const update = useCallback(
    (m: GridMilestone, patch: MilestonePatch, toast?: 'moved' | 'completed' | 'reopened') => {
      const g: MilestoneGridPatch = {}
      if (patch.name !== undefined) g.name = patch.name
      if (patch.date !== undefined) g.date = patch.date
      if (patch.completed !== undefined) g.completedOn = patch.completed ? (m.completedOn ?? today) : null
      g.status = milestoneStatus({ date: g.date ?? m.date, completedOn: g.completedOn ?? m.completedOn }, today)
      patchGrid((r) => applyMilestonePatch(r, m.id, g))
      run(() => mut.update(m, patch, toast ? { toast } : undefined))
    },
    [patchGrid, run, mut, today],
  )
  const onUpdate = useCallback(
    (m: GridMilestone, patch: MilestonePatch) => update(m, patch, patch.date !== undefined ? 'moved' : undefined),
    [update],
  )
  const toggleComplete = useCallback(
    (m: GridMilestone) =>
      m.completedOn
        ? update(m, { completed: false }, 'reopened')
        : update(m, { completed: true }, 'completed'),
    [update],
  )
  const remove = useCallback(
    (m: GridMilestone) => {
      patchGrid((r) => removeMilestone(r, m.id))
      run(() => mut.remove(m))
    },
    [patchGrid, run, mut],
  )
  const projectId = context.kind === 'project' ? context.id : null
  const create = useCallback(
    (v: { name: string; date: ISODate; description: string | null }) => {
      if (projectId === null) return
      run(() =>
        mut.create({ projectId, ...v }).then((m) => {
          if (m) patchGrid((r) => ({ ...r, milestones: sortedInsert(r.milestones, m) }))
        }),
      )
    },
    [projectId, run, mut, patchGrid],
  )
  const onDrop = useCallback((m: GridMilestone, date: ISODate) => update(m, { date }, 'moved'), [update])
  const drag = useMilestoneDrag({ cols, scrollEl: o.scrollEl, enabled: canManage, onDrop })

  // ── popovers + menu ──
  const [opened, setOpened] = useState<{ id: string; anchor: Element } | null>(null)
  const [creating, setCreating] = useState<{ anchor: Element; date: ISODate } | null>(null)
  const [stack, setStack] = useState<{ list: readonly GridMilestone[]; anchor: Element } | null>(null)
  const [menu, setMenu] = useState<{
    target: MilestoneMenuTarget
    anchor: Element
    at: { x: number; y: number }
  } | null>(null)

  const onOpen = useCallback((m: GridMilestone, anchor: Element) => setOpened({ id: m.id, anchor }), [])
  const onOpenStack = useCallback(
    (list: readonly GridMilestone[], anchor: Element) => setStack({ list, anchor }),
    [],
  )
  const openCreate = useCallback(
    (anchor: Element, date?: ISODate) => {
      if (canManage && projectId !== null) setCreating({ anchor, date: date ?? today })
    },
    [canManage, projectId, today],
  )
  const onCreate = useCallback(
    (col: GridColumn, anchor: HTMLElement) => openCreate(anchor, dateForCellClick(col)),
    [openCreate],
  )
  const onMenu = useCallback(
    (target: MilestoneMenuTarget, anchor: HTMLElement, at: { x: number; y: number } | null) => {
      if ('col' in target && !canManage) return
      const r = anchor.getBoundingClientRect()
      setMenu({ target, anchor, at: at ?? { x: r.left + r.width / 2, y: r.bottom } })
    },
    [canManage],
  )
  const menuItems = useMemo<CellMenuItem[]>(() => {
    if (!menu) return []
    const t = menu.target
    if ('col' in t) {
      const col = t.col
      const anchor = menu.anchor
      return [
        { id: 'ms-create', label: th.milestones.grid.menu.create, onSelect: () => onCreate(col, anchor as HTMLElement) },
      ]
    }
    const m = t.milestone
    const open: CellMenuItem = { id: 'ms-open', label: th.milestones.grid.menu.open, onSelect: () => onOpen(m, menu.anchor) }
    if (!canManage) return [open]
    return [
      open,
      m.completedOn
        ? { id: 'ms-reopen', label: th.milestones.grid.menu.reopen, onSelect: () => toggleComplete(m) }
        : { id: 'ms-complete', label: th.milestones.grid.menu.complete, onSelect: () => toggleComplete(m) },
      { id: 'ms-delete', label: th.milestones.grid.menu.delete, onSelect: () => remove(m) },
    ]
  }, [menu, canManage, onCreate, onOpen, toggleComplete, remove])

  const openedMilestone = opened ? (byId.get(opened.id) ?? null) : null
  const overlays = (
    <>
      <MilestonePopover
        milestone={openedMilestone}
        anchorEl={opened?.anchor ?? null}
        canManage={canManage}
        onUpdate={onUpdate}
        onToggleComplete={toggleComplete}
        onDelete={remove}
        onClose={() => setOpened(null)}
        {...(projectLabel && openedMilestone ? { projectLabel: projectLabel(openedMilestone.projectId) } : {})}
      />
      <MilestoneCreatePopover
        at={creating}
        projectId={projectId ?? ''}
        onCreate={create}
        onClose={() => setCreating(null)}
      />
      <MilestoneStackPopover at={stack} onPick={onOpen} onClose={() => setStack(null)} />
      <CellMenu
        anchor={menu ? menu.at : null}
        targets={NO_TARGETS}
        onCollapse={noop}
        onClose={() => setMenu(null)}
        items={menuItems}
      />
    </>
  )

  const row = (vCols: readonly VirtualItem[], totalWidth: number) => (
    <MilestoneRow
      cols={cols}
      vCols={vCols}
      totalWidth={totalWidth}
      milestones={milestones}
      canManage={canManage}
      today={today}
      thisWeek={thisWeek}
      onOpen={onOpen}
      onOpenStack={onOpenStack}
      onCreate={onCreate}
      onMenu={onMenu}
      drag={drag.drag}
      onDragStart={drag.onPointerDown}
      consumeClick={drag.consumeClick}
      {...(projectLabel ? { projectLabel } : {})}
    />
  )

  const tooltipFor = useCallback(
    (el: HTMLElement) => {
      const m = byId.get(el.dataset.msId ?? '')
      if (!m) return null
      const lines = milestoneTooltipFor(m)
      const prefix = projectLabel?.(m.projectId)
      return prefix ? [milestoneDisplayName(m, prefix), ...lines.slice(1)] : lines
    },
    [byId, projectLabel],
  )

  return { canManage, milestones, byId, markerViews, row, overlays, openCreate, tooltipFor }
}
