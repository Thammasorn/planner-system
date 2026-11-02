'use client'
// src/components/home/MyTasksCard.tsx — "งานของฉันสัปดาห์นี้" (FR-1101a, M10-D13/D33): M9's THIS_WEEK bucket, tickable
// through M3's completeTask / uncompleteTask with the usual undo toast (8 s, Cmd+Z) and M6's BR-52 text. No quick add
// on home (X68): new tasks come from ⌘K › สร้าง task.
import { useState } from 'react'
import Box from '@mui/material/Box'
import Checkbox from '@mui/material/Checkbox'
import Typography from '@mui/material/Typography'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import Link from '@/components/Link'
import { EmptyState } from '@/components/common/EmptyState'
import { ProjectChip } from '@/components/common/ProjectChip'
import { OpenAsPageLink } from '@/components/tasks/OpenAsPage'
import { StatusChip } from '@/components/tasks/status/StatusChip'
import { statusToastMessage } from '@/components/tasks/statusToast'
import { errorMessage } from '@/components/tasks/task-ids'
import { useUndo } from '@/components/undo/useUndo'
import { formatCd } from '@/domain/units'
import { th } from '@/i18n/th'
import { unwrap } from '@/lib/action-result'
import { formatThaiDate } from '@/lib/format'
import { invalidateLoad, invalidateTasks } from '@/lib/invalidate'
import { projectTasksHref } from '@/lib/nav/task-href'
import { qk } from '@/lib/query-keys'
import { completeTask, revertTaskStatus, uncompleteTask } from '@/server/actions/tasks'
import { HomeCard, homeActionLinkSx } from './HomeCard'
import { patchHomeTask, type HomeCache, type HomeTaskView } from './patch'

export function MyTasksCard({ items, more }: { items: HomeTaskView[]; more: number }) {
  const qc = useQueryClient()
  const undo = useUndo()
  // ticked in this session: stays struck through + checked until a refetch drops the (now completed) task
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set())
  const mark = (id: string, on: boolean) =>
    setTicked((s) => {
      const n = new Set(s)
      if (on) n.add(id)
      else n.delete(id)
      return n
    })
  const isDone = (t: HomeTaskView) => ticked.has(t.id) || t.completed === true
  const settle = async (projectId: string) => {
    await Promise.all([invalidateTasks(qc, projectId), invalidateLoad(qc)])
  }

  const tick = useMutation({
    mutationFn: (it: HomeTaskView) =>
      unwrap(it.completed ? uncompleteTask({ taskIds: [it.id] }) : completeTask({ taskIds: [it.id] })),
    onMutate: async (it) => {
      mark(it.id, !it.completed)
      await qc.cancelQueries({ queryKey: qk.home() })
      const prev = qc.getQueryData<HomeCache>(qk.home())
      qc.setQueryData<HomeCache>(qk.home(), (d) => d && patchHomeTask(d, it.id, { completed: !it.completed }))
      return { prev }
    },
    onError: (err, it, ctx) => {
      mark(it.id, it.completed === true)
      if (ctx?.prev) qc.setQueryData(qk.home(), ctx.prev)
      toast.error(errorMessage(err))
    },
    onSuccess: (r, it) => {
      const items = r.changed.map((c) => ({ taskId: c.taskId, ...c.previous }))
      if (items.length === 0) return
      const wasCompleted = it.completed === true
      undo.push(
        {
          label: th.tasks.undoLabel.complete,
          undo: async () => {
            await unwrap(revertTaskStatus({ items }))
            mark(it.id, wasCompleted)
            await settle(it.projectId)
          },
          redo: async () => {
            await unwrap(
              wasCompleted ? uncompleteTask({ taskIds: [it.id] }) : completeTask({ taskIds: [it.id] }),
            )
            mark(it.id, !wasCompleted)
            await settle(it.projectId)
          },
        },
        {
          toast: wasCompleted ? th.tasks.toast.uncompleted : statusToastMessage(r, th.tasks.toast.completed), // BR-52 (M6-D16)
        },
      )
    },
    onSettled: (_r, _e, it) => settle(it.projectId),
  })

  return (
    <HomeCard
      id="my-tasks"
      title={th.home.myTasks.title}
      action={
        <Box component={Link} href="/my" sx={homeActionLinkSx}>
          {th.home.myTasks.seeAll}
        </Box>
      }
    >
      {items.length === 0 ? (
        <EmptyState title={th.home.myTasks.empty} description={th.home.myTasks.hint} />
      ) : (
        <>
          <Box component="ul" role="list" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {items.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                done={isDone(t)}
                onTick={() => tick.mutate({ ...t, completed: isDone(t) })}
              />
            ))}
          </Box>
          {more > 0 ? (
            <Typography variant="body2" sx={{ mt: 1, color: 'var(--text-secondary)' }}>
              {th.home.myTasks.more(more)}
            </Typography>
          ) : null}
        </>
      )}
    </HomeCard>
  )
}

function TaskRow({ task: t, done, onTick }: { task: HomeTaskView; done: boolean; onTick: () => void }) {
  return (
    <Box
      component="li"
      data-task-id={t.id}
      data-completed={done ? 'true' : undefined}
      data-open-host=""
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1,
        py: 1,
        minWidth: 0,
        borderBottom: '1px solid var(--border-subtle)',
        '&:last-of-type': { borderBottom: 0 },
      }}
    >
      <Checkbox
        size="small"
        checked={done}
        onChange={onTick}
        sx={{ p: 0.5 }}
        slotProps={{ input: { 'aria-label': th.home.myTasks.complete(t.name) } }}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0, flexWrap: 'wrap' }}>
          <Box
            component={Link}
            href={projectTasksHref(t.projectId, t.id)}
            sx={{
              color: 'text.primary',
              fontWeight: 'var(--weight-medium)',
              textDecoration: done ? 'line-through' : 'none',
              overflowWrap: 'anywhere',
              '&:hover': { textDecoration: 'underline' },
            }}
          >
            {t.name}
          </Box>
          <OpenAsPageLink taskId={t.id} alwaysVisible />
        </Box>
        {t.parentName ? (
          <Typography variant="body2" sx={{ color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>
            {t.parentName}
          </Typography>
        ) : null}
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 1,
            mt: 0.5,
            fontSize: 'var(--font-sm)',
            color: 'var(--text-secondary)',
          }}
        >
          <ProjectChip project={t.project} />
          <StatusChip status={t.status} />
          {t.plannedCd !== null ? (
            <span>{th.home.myTasks.planned(formatCd(t.plannedCd, { unit: 'DAYS', decimals: 1 }))}</span>
          ) : null}
          {t.dueDate ? <span>{th.home.myTasks.due(formatThaiDate(t.dueDate, 'medium'))}</span> : null}
        </Box>
      </Box>
    </Box>
  )
}
