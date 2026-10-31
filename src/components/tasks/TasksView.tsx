'use client'
import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import { usePeopleOptions } from '@/hooks/usePeopleOptions'
import { usePreferences } from '@/hooks/usePreferences'
import type { PersonOption } from '@/lib/contracts/people'
import { taskPreference } from '@/lib/schemas/preferences'
import { ProjectBoard } from './board/ProjectBoard'
import { TaskList } from './TaskList'
import { TaskPanel } from './TaskPanel'
import { TaskToolbar } from './TaskToolbar'
import { useProjectTasks } from './useProjectTasks'

/**
 * The project งาน tab (FR-408 tab, FR-611, FR-660): toolbar, then the list or the board beside the task panel
 * (flex row — the panel never covers the list).
 */
export function TasksView({ projectId }: { projectId: string }) {
  const { prefs } = usePreferences()
  const view = taskPreference(prefs, 'tasks.view')
  const q = useProjectTasks(projectId)
  const people = usePeopleOptions()
  const [assigneeId, setAssigneeId] = useState<string | null>(null)
  const members = useMemo<PersonOption[]>(() => {
    const ids = new Set(q.data?.members.map((m) => m.userId) ?? [])
    return (people.data ?? []).filter((p) => ids.has(p.id))
  }, [q.data?.members, people.data])
  return (
    <Box>
      <TaskToolbar members={members} assigneeId={assigneeId} onAssignee={setAssigneeId} />
      <Box
        sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, alignItems: 'flex-start' }}
      >
        <Box sx={{ flex: 1, minWidth: 0, width: '100%' }}>
          {view === 'BOARD' && q.data ? (
            <ProjectBoard projectId={projectId} data={q.data} assigneeId={assigneeId} />
          ) : (
            <TaskList projectId={projectId} />
          )}
        </Box>
        <TaskPanel projectId={projectId} />
      </Box>
    </Box>
  )
}
