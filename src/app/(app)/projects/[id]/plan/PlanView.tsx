'use client'
import { useLayoutEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import { PlanGrid } from '@/components/grid/PlanGrid'
import { PlanCalendar } from '@/components/plan-calendar/PlanCalendar'
import { openTaskPanel } from '@/components/tasks/task-param'
import { TaskPanel } from '@/components/tasks/TaskPanel'
import { usePreferences } from '@/hooks/usePreferences'
import type { GridZoom } from '@/lib/contracts/grid'
import { DEFAULT_PROJECT_COLOR } from '@/lib/project-colors'
import type { PlanView as PlanViewKind } from '@/lib/schemas/preferences'
import { PlanViewSwitch } from './PlanViewSwitch'
import { urlWithView } from './view'

/** Space kept under the grid inside the viewport (the shell's bottom padding, --space-8 since M6.1-D20). */
const BOTTOM_GAP = 32
const MIN_HEIGHT = 420

/**
 * The แผนงาน tab body (FR-408, FR-801, FR-810, M6-D18, M7.1-D20): `[แผนงาน | ปฏิทิน]` + the grid or the project
 * calendar, beside M3's task panel (`?task=<id>`, the same component and close semantics as the งาน tab, M3-D17) —
 * the panel works in both views. Flex row — the view shrinks, the panel never covers it. The grid owns the scroll:
 * the view fills the viewport below its own top edge.
 *
 * The switch is the first item of the grid's or the calendar's toolbar (FR-810: leftmost). Switching updates
 * `?view=` with history.replaceState (no history spam, no server round trip — Next syncs useSearchParams with it,
 * like `?task=`) and saves `plan.view`. Once shown, the grid stays mounted (hidden) while the
 * calendar shows, so its scroll position, expansion and loaded chunks survive the switch back.
 */
export function PlanView({
  projectId,
  projectName,
  archived,
  canEdit,
  initialZoom,
  initialView = 'GRID',
  initialTaskColumnWidth,
  initialShowAssignees,
  initialChartOpen,
  projectColor = DEFAULT_PROJECT_COLOR,
}: {
  projectId: string
  projectName: string
  archived: boolean
  canEdit: boolean
  /** M7: `grid.zoom` preference (S3.11) */
  initialZoom?: GridZoom
  /** M7.1: `?view=` over the `plan.view` preference, resolved by the page (FR-810) */
  initialView?: PlanViewKind
  /** M7.1: `grid.taskColumnWidth` / `grid.showAssignees` / `grid.chart`, read by the page (S3) */
  initialTaskColumnWidth?: number
  initialShowAssignees?: boolean
  initialChartOpen?: boolean
  /** M7.1: projects.color — the calendar's bars */
  projectColor?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [top, setTop] = useState(0)
  const [view, setView] = useState<PlanViewKind>(initialView)
  const [gridMounted, setGridMounted] = useState(initialView === 'GRID')
  const { setPreference } = usePreferences()
  useLayoutEffect(() => {
    const measure = () => {
      const el = ref.current
      if (el) setTop(Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY)))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const changeView = (v: PlanViewKind) => {
    setView(v)
    if (v === 'GRID') setGridMounted(true)
    window.history.replaceState(window.history.state, '', urlWithView(window.location.href, v))
    setPreference('plan.view', v)
  }
  const viewSwitch = <PlanViewSwitch view={view} onChange={changeView} />
  const showGrid = view === 'GRID'

  return (
    <Box
      ref={ref}
      data-testid="plan-view"
      data-view={view}
      sx={{
        display: 'flex',
        gap: 2,
        alignItems: 'stretch',
        height: `max(${MIN_HEIGHT}px, calc(100dvh - ${top + BOTTOM_GAP}px))`,
        minWidth: 0,
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {gridMounted ? (
          <Box
            hidden={!showGrid}
            data-testid="plan-grid-slot"
            sx={{ flex: 1, minHeight: 0, display: showGrid ? 'flex' : 'none', flexDirection: 'column' }}
          >
            <PlanGrid
              context={{ kind: 'project', id: projectId }}
              projectName={projectName}
              archived={archived}
              canEdit={canEdit}
              onOpenTask={(taskId) => openTaskPanel(taskId, { switchInPlace: true })}
              {...(initialZoom ? { initialZoom } : {})}
              {...(initialTaskColumnWidth !== undefined ? { initialTaskColumnWidth } : {})}
              {...(initialShowAssignees !== undefined ? { initialShowAssignees } : {})}
              {...(initialChartOpen !== undefined ? { initialChartOpen } : {})}
              toolbarStart={viewSwitch}
            />
          </Box>
        ) : null}
        {showGrid ? null : (
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            <PlanCalendar
              projectId={projectId}
              projectColor={projectColor}
              toolbarStart={viewSwitch}
              onOpenTask={(taskId) => openTaskPanel(taskId)}
            />
          </Box>
        )}
      </Box>
      <TaskPanel projectId={projectId} />
    </Box>
  )
}
