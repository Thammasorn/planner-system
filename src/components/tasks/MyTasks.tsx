'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Checkbox from '@mui/material/Checkbox'
import CircularProgress from '@mui/material/CircularProgress'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { EmptyState } from '@/components/common/EmptyState'
import { ProjectChip } from '@/components/common/ProjectChip'
import { useUndo } from '@/components/undo/useUndo'
import { th } from '@/i18n/th'
import { unwrap } from '@/lib/action-result'
import { getJson } from '@/lib/api'
import type { MyTaskDTO, MyTasksResponse } from '@/lib/contracts/tasks'
import { formatThaiDate } from '@/lib/format'
import { invalidateLoad, invalidateTasks } from '@/lib/invalidate'
import { statusToastMessage } from './statusToast'
import { qk } from '@/lib/query-keys'
import { completeTask, revertTaskStatus } from '@/server/actions/tasks'
import { StatusChip } from './status/StatusChip'
import { errorMessage } from './useTaskMutations'

/** GET /api/tasks/my (X22). */
export function useMyTasks() {
  return useQuery({
    queryKey: qk.myTasks(),
    queryFn: ({ signal }) => getJson<MyTasksResponse>('/api/tasks/my', { signal }),
  })
}

/**
 * งานของฉัน basic (FR-1009, X22, M3-D8, NFR-07b): my open assigned leaf tasks grouped by project, tickable with the
 * usual undo toast; a click opens the task in its project. Single column, no fixed widths (works at 390 px).
 */
export function MyTasks() {
  const q = useMyTasks()
  const qc = useQueryClient()
  const undo = useUndo()
  const router = useRouter()
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set())
  const settle = async (projectId: string) => {
    await invalidateTasks(qc, projectId)
    await invalidateLoad(qc)
  }
  const complete = useMutation({
    mutationFn: (t: MyTaskDTO) => unwrap(completeTask({ taskIds: [t.id] })),
    onMutate: (t) => setTicked((s) => new Set([...s, t.id])),
    onError: (err, t) => {
      setTicked((s) => {
        const n = new Set(s)
        n.delete(t.id)
        return n
      })
      toast.error(errorMessage(err))
    },
    onSuccess: (r, t) => {
      const items = r.changed.map((c) => ({ taskId: c.taskId, ...c.previous }))
      if (items.length === 0) return
      undo.push(
        {
          label: th.tasks.undoLabel.complete,
          undo: async () => {
            await unwrap(revertTaskStatus({ items }))
            setTicked((s) => {
              const n = new Set(s)
              n.delete(t.id)
              return n
            })
            await settle(t.projectId)
          },
          redo: async () => {
            await unwrap(completeTask({ taskIds: [t.id] }))
            await settle(t.projectId)
          },
        },
        { toast: statusToastMessage(r, th.tasks.toast.completed) },
      )
    },
    onSettled: (_r, _e, t) => void settle(t.projectId),
  })

  if (q.isPending) return <CircularProgress size={24} aria-label={th.common.loading} />
  if (q.isError) return <Alert severity="error">{errorMessage(q.error)}</Alert>
  if (q.data.groups.length === 0) return <EmptyState title={th.my.empty} />

  return (
    <Box sx={{ display: 'grid', gap: 2, minWidth: 0 }}>
      {q.data.groups.map((g) => (
        <Paper
          key={g.project.id}
          variant="outlined"
          component="section"
          aria-label={g.project.name}
          data-my-project={g.project.id}
          sx={{ p: { xs: 1, sm: 2 }, minWidth: 0 }}
        >
          <Box sx={{ mb: 1 }}>
            <ProjectChip project={g.project} />
          </Box>
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {g.tasks.map((t) => {
              const done = ticked.has(t.id)
              const href = `/projects/${t.projectId}/tasks?task=${t.id}`
              return (
                <Box
                  component="li"
                  key={t.id}
                  data-task-id={t.id}
                  sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, py: 0.5, minWidth: 0 }}
                >
                  <Checkbox
                    size="small"
                    checked={done}
                    disabled={done}
                    onChange={() => complete.mutate(t)}
                    sx={{ p: 0.5 }}
                    slotProps={{ input: { 'aria-label': th.tasks.completeCheckbox(t.name) } }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box
                      component="a"
                      href={href}
                      onClick={(e) => {
                        e.preventDefault()
                        router.push(href)
                      }}
                      sx={{
                        color: 'text.primary',
                        overflowWrap: 'anywhere',
                        textDecoration: done ? 'line-through' : 'none',
                        '&:hover': { textDecoration: 'underline' },
                      }}
                    >
                      {t.name}
                    </Box>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 0.25 }}>
                      <StatusChip status={t.status} />
                      {t.parentName ? (
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {th.my.inParent(t.parentName)}
                        </Typography>
                      ) : null}
                      {t.dueDate ? (
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {th.my.due(formatThaiDate(t.dueDate))}
                        </Typography>
                      ) : null}
                    </Box>
                  </Box>
                </Box>
              )
            })}
          </Box>
        </Paper>
      ))}
    </Box>
  )
}
