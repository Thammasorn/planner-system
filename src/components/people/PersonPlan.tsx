'use client'
// src/components/people/PersonPlan.tsx — person tab แผนงาน (FR-1008, FR-667 person part, M9-D12/D13/D28): the one
// PlanGrid in the person context (rows grouped by project, one masked row, no structure affordances). ↗ opens the
// task in its project plan with the panel. The grid owns the scroll and fills the viewport below its top edge.
import { useLayoutEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Box from '@mui/material/Box'
import { PlanGrid } from '@/components/grid/PlanGrid'
import type { ISODate } from '@/domain/types'
import { th } from '@/i18n/th'
import type { GridZoom } from '@/lib/contracts/grid'

/** Space kept under the grid (the shell's bottom padding) and the smallest grid height — as the project plan tab. */
const BOTTOM_GAP = 32
const MIN_HEIGHT = 420

export function PersonPlan({
  userId,
  name,
  focusWeek,
  initialZoom,
  initialTaskColumnWidth,
}: {
  userId: string
  name: string
  /** `?week=` (a validated Monday) from the overload list / side panel (M9-D28). */
  focusWeek?: ISODate
  initialZoom?: GridZoom
  initialTaskColumnWidth?: number
}) {
  const router = useRouter()
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
      data-testid="person-plan"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: `max(${MIN_HEIGHT}px, calc(100dvh - ${top + BOTTOM_GAP}px))`,
        minWidth: 0,
      }}
    >
      <PlanGrid
        context={{ kind: 'person', id: userId }}
        projectName={name}
        label={th.people.grid.label(name)}
        archived={false}
        canEdit
        onOpenTask={(taskId, projectId) => {
          if (projectId) router.push(`/projects/${projectId}/plan?task=${taskId}`)
        }}
        {...(focusWeek ? { focusWeek } : {})}
        {...(initialZoom ? { initialZoom } : {})}
        {...(initialTaskColumnWidth !== undefined ? { initialTaskColumnWidth } : {})}
      />
    </Box>
  )
}
