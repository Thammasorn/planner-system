'use client'
import { useLayoutEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import { PlanGrid } from '@/components/grid/PlanGrid'
import { openTaskPanel } from '@/components/tasks/task-param'
import { TaskPanel } from '@/components/tasks/TaskPanel'

/** Space kept under the grid inside the viewport (the shell's bottom padding). */
const BOTTOM_GAP = 24
const MIN_HEIGHT = 420

/**
 * The แผนงาน tab body (FR-408, FR-801, M6-D18): the grid beside M3's task panel (`?task=<id>`, the same component and
 * close semantics as the งาน tab, M3-D17). Flex row — the grid shrinks, the panel never covers it. The grid owns the
 * scroll: the view fills the viewport below its own top edge.
 */
export function PlanView({
  projectId,
  projectName,
  archived,
  canEdit,
}: {
  projectId: string
  projectName: string
  archived: boolean
  canEdit: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [top, setTop] = useState(0)
  useLayoutEffect(() => {
    const measure = () => {
      const el = ref.current
      if (el) setTop(Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY)))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])
  return (
    <Box
      ref={ref}
      data-testid="plan-view"
      sx={{
        display: 'flex',
        gap: 2,
        alignItems: 'stretch',
        height: `max(${MIN_HEIGHT}px, calc(100dvh - ${top + BOTTOM_GAP}px))`,
        minWidth: 0,
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <PlanGrid
          context={{ kind: 'project', id: projectId }}
          projectName={projectName}
          archived={archived}
          canEdit={canEdit}
          onOpenTask={(taskId) => openTaskPanel(taskId)}
        />
      </Box>
      <TaskPanel projectId={projectId} />
    </Box>
  )
}
