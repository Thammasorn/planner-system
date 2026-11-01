'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Checkbox from '@mui/material/Checkbox'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { EmptyState } from '@/components/common/EmptyState'
import { ProjectChip } from '@/components/common/ProjectChip'
import { useUndo } from '@/components/undo/useUndo'
import { th } from '@/i18n/th'
import { unwrap } from '@/lib/action-result'
import { getJson } from '@/lib/api'
import type { MyTaskDTO, MyTasksResponse, TaskStatusDTO } from '@/lib/contracts/tasks'
import { formatThaiDate } from '@/lib/format'
import { invalidateLoad, invalidateTasks } from '@/lib/invalidate'
import { projectTasksHref } from '@/lib/nav/task-href'
import { useScrollRestore } from '@/lib/nav/useScrollRestore'
import { qk } from '@/lib/query-keys'
import { completeTask, revertTaskStatus, setTaskStatus } from '@/server/actions/tasks'
import { HasBodyMark, OpenAsPageLink } from './OpenAsPage'
import { StatusChip } from './status/StatusChip'
import { StatusMenu } from './status/StatusMenu'
import { statusToastMessage } from './statusToast'
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
 * usual undo toast; the name opens the task in its project (panel), ↗ opens the task page (FR-685), 📄 marks a body
 * (FR-691) and the status chip opens the status menu (M6.1-D25, FR-1606 "/my เปลี่ยนสถานะ" on the phone).
 * Single column, no fixed widths (works at 390 px).
 */
export function MyTasks() {
  const q = useMyTasks()
  const qc = useQueryClient()
  const undo = useUndo()
  const router = useRouter()
  useScrollRestore(q.data !== undefined)
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set())
  const [menu, setMenu] = useState<{ anchor: HTMLElement; task: MyTaskDTO } | null>(null)
  const untick = (id: string) =>
    setTicked((s) => {
      const n = new Set(s)
      n.delete(id)
      return n
    })
  const settle = async (projectId: string) => {
    await invalidateTasks(qc, projectId)
    await invalidateLoad(qc)
  }
  /** Optimistic status of one /my row (the list itself refetches on settle). */
  const patchStatus = (taskId: string, status: MyTaskDTO['status']) =>
    qc.setQueryData<MyTasksResponse>(qk.myTasks(), (d) =>
      d
        ? {
            ...d,
            groups: d.groups.map((g) => ({
              ...g,
              tasks: g.tasks.map((t) => (t.id === taskId ? { ...t, status } : t)),
            })),
          }
        : d,
    )

  const complete = useMutation({
    mutationFn: (t: MyTaskDTO) => unwrap(completeTask({ taskIds: [t.id] })),
    onMutate: (t) => setTicked((s) => new Set([...s, t.id])),
    onError: (err, t) => {
      untick(t.id)
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
            untick(t.id)
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

  const changeStatus = useMutation({
    mutationFn: (v: { task: MyTaskDTO; status: TaskStatusDTO }) =>
      unwrap(setTaskStatus({ taskIds: [v.task.id], statusId: v.status.id })),
    onMutate: async ({ task, status }) => {
      await qc.cancelQueries({ queryKey: qk.myTasks() })
      const { id, name, color, category } = status
      patchStatus(task.id, { id, name, color, category })
      if (category === 'DONE') setTicked((s) => new Set([...s, task.id]))
      return { previous: task.status }
    },
    onError: (err, v, ctx) => {
      if (ctx) patchStatus(v.task.id, ctx.previous)
      untick(v.task.id)
      toast.error(errorMessage(err))
    },
    onSuccess: (r, v) => {
      const items = r.changed.map((c) => ({ taskId: c.taskId, ...c.previous }))
      if (items.length === 0) return
      undo.push(
        {
          label: th.tasks.undoLabel.status,
          undo: async () => {
            await unwrap(revertTaskStatus({ items }))
            untick(v.task.id)
            await settle(v.task.projectId)
          },
          redo: async () => {
            await unwrap(setTaskStatus({ taskIds: [v.task.id], statusId: v.status.id }))
            await settle(v.task.projectId)
          },
        },
        { toast: statusToastMessage(r, th.tasks.status.toast.changed(v.status.name)) },
      )
    },
    onSettled: (_r, _e, v) => void settle(v.task.projectId),
  })

  if (q.isPending) return <CircularProgress size={24} aria-label={th.common.loading} />
  if (q.isError) return <Alert severity="error">{errorMessage(q.error)}</Alert>
  if (q.data.groups.length === 0) return <EmptyState title={th.my.empty} />
  const statusesOf = (projectId: string) => q.data.statusesByProject?.[projectId] ?? []

  return (
    <Box sx={{ display: 'grid', gap: 3, minWidth: 0 }}>
      {q.data.groups.map((g) => (
        <Box
          key={g.project.id}
          component="section"
          aria-label={g.project.name}
          data-my-project={g.project.id}
          sx={{ minWidth: 0 }}
        >
          <Box sx={{ mb: 1 }}>
            <ProjectChip project={g.project} />
          </Box>
          <Box
            component="ul"
            sx={{
              listStyle: 'none',
              m: 0,
              p: 0,
              borderTop: '1px solid var(--border-subtle)',
            }}
          >
            {g.tasks.map((t) => {
              const done = ticked.has(t.id)
              const href = projectTasksHref(t.projectId, t.id)
              const statuses = statusesOf(t.projectId)
              return (
                <Box
                  component="li"
                  key={t.id}
                  data-task-id={t.id}
                  data-open-host=""
                  sx={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 1,
                    py: 1,
                    px: 0.5,
                    minWidth: 0,
                    borderBottom: '1px solid var(--border-subtle)',
                    '&:hover': { bgcolor: 'var(--hover-bg)' },
                  }}
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
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                      <Box
                        component="a"
                        href={href}
                        onClick={(e) => {
                          e.preventDefault()
                          router.push(href)
                        }}
                        sx={{
                          color: 'text.primary',
                          fontSize: 'var(--font-md)',
                          overflowWrap: 'anywhere',
                          minWidth: 0,
                          textDecoration: done ? 'line-through' : 'none',
                          '&:hover': { textDecoration: 'underline' },
                        }}
                      >
                        {t.name}
                      </Box>
                      {t.hasBody ? <HasBodyMark /> : null}
                      <Box sx={{ flex: 1 }} />
                      <OpenAsPageLink taskId={t.id} />
                    </Box>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 0.5 }}>
                      <StatusChip
                        status={t.status}
                        disabled={done}
                        onClick={
                          statuses.length > 0
                            ? (e) => setMenu({ anchor: e.currentTarget, task: t })
                            : undefined
                        }
                      />
                      {t.parentName ? (
                        <Typography variant="caption" sx={{ color: 'var(--text-secondary)' }}>
                          {th.my.inParent(t.parentName)}
                        </Typography>
                      ) : null}
                      {t.dueDate ? (
                        <Typography variant="caption" sx={{ color: 'var(--text-secondary)' }}>
                          {th.my.due(formatThaiDate(t.dueDate))}
                        </Typography>
                      ) : null}
                    </Box>
                  </Box>
                </Box>
              )
            })}
          </Box>
        </Box>
      ))}
      <StatusMenu
        statuses={menu ? statusesOf(menu.task.projectId) : []}
        currentId={menu?.task.status.id ?? null}
        anchorEl={menu?.anchor ?? null}
        onPick={(statusId) => {
          if (!menu || statusId === menu.task.status.id) return
          const status = statusesOf(menu.task.projectId).find((s) => s.id === statusId)
          if (status) changeStatus.mutate({ task: menu.task, status })
        }}
        onClose={() => setMenu(null)}
      />
    </Box>
  )
}
