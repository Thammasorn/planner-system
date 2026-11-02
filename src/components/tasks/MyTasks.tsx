'use client'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Checkbox from '@mui/material/Checkbox'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { EmptyState } from '@/components/common/EmptyState'
import { ProjectChip } from '@/components/common/ProjectChip'
import { useUndo } from '@/components/undo/useUndo'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { th } from '@/i18n/th'
import { unwrap } from '@/lib/action-result'
import { getJson } from '@/lib/api'
import type { MyBucketKey, MyBucketTask, MyTaskBucketsResponse, TaskStatusDTO } from '@/lib/contracts/tasks'
import { formatThaiDate, formatWeekHeader } from '@/lib/format'
import { invalidateLoad, invalidateTasks } from '@/lib/invalidate'
import { projectTasksHref } from '@/lib/nav/task-href'
import { useScrollRestore } from '@/lib/nav/useScrollRestore'
import { MY_BUCKETS } from '@/lib/my/buckets'
import { qk } from '@/lib/query-keys'
import { twoDecimals } from '@/lib/workload/format'
import { completeTask, revertTaskStatus, setTaskStatus } from '@/server/actions/tasks'
import { HasBodyMark, OpenAsPageLink } from './OpenAsPage'
import { StatusChip } from './status/StatusChip'
import { StatusMenu } from './status/StatusMenu'
import { statusToastMessage } from './statusToast'
import { TeamTasks } from './team/TeamTasks'
import { errorMessage } from './useTaskMutations'

/** GET /api/tasks/my (X95): the FR-1009 buckets + `statusesByProject` (M6.1-D25 status menu). The view also renders
 *  without the map (plain status chips), so it stays optional here. */
export type MyTasksData = Omit<MyTaskBucketsResponse, 'statusesByProject'> & {
  statusesByProject?: Record<string, TaskStatusDTO[]>
}

export function useMyTasks() {
  return useQuery({
    queryKey: qk.myTasks(),
    queryFn: ({ signal }) => getJson<MyTasksData>('/api/tasks/my', { signal }),
  })
}

export type MyView = 'weeks' | 'list' | 'board'

/** `?view=list|board` (M9-D15); anything else = the buckets (default). */
export function parseMyView(v: string | null): MyView {
  return v === 'list' || v === 'board' ? v : 'weeks'
}

/**
 * งานของฉัน (FR-1009, FR-667, X22, M9-D15/D17): the view switch ตามสัปดาห์ · ลิสต์ · บอร์ด lives in the URL (`?view=`,
 * history.replaceState — /my owns only that parameter); ลิสต์ / บอร์ด are M3's TeamTasks fixed to me (filters in
 * memory, the shared `tasks.view` preference untouched).
 */
export function MyTasksView() {
  const sp = useSearchParams()
  const me = useCurrentUser()
  const [view, setView] = useState<MyView>(() => parseMyView(sp.get('view')))
  const change = (v: MyView) => {
    setView(v)
    const url = new URL(window.location.href)
    if (v === 'weeks') url.searchParams.delete('view')
    else url.searchParams.set('view', v)
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }
  return (
    <Box sx={{ display: 'grid', gap: 2, minWidth: 0 }}>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={view}
        aria-label={th.my.view.label}
        onChange={(_e, v: MyView | null) => {
          if (v !== null && v !== view) change(v)
        }}
        sx={{ justifySelf: 'start' }}
      >
        <ToggleButton value="weeks">{th.my.view.weeks}</ToggleButton>
        <ToggleButton value="list">{th.my.view.list}</ToggleButton>
        <ToggleButton value="board">{th.my.view.board}</ToggleButton>
      </ToggleButtonGroup>
      {view === 'weeks' || !me ? (
        <MyTasks />
      ) : (
        <TeamTasks fixedUserId={me.id} syncUrl={false} forcedView={view === 'board' ? 'BOARD' : 'LIST'} />
      )}
    </Box>
  )
}

/**
 * งานของฉัน by week (FR-1009, X22, M9-D17, NFR-07b): my open assigned leaf tasks in the buckets สัปดาห์นี้ /
 * สัปดาห์หน้า / หลังจากนั้น / ยังไม่วางแผน (server order), each with my planned days; tickable with the usual undo
 * toast (the row leaves its bucket optimistically); the name opens the task in its project (panel), ↗ opens the task
 * page (FR-685), 📄 marks a body (FR-691) and the status chip opens the status menu (M6.1-D25, FR-1606).
 * Single column, no fixed widths (works at 390 px).
 */
export function MyTasks() {
  const q = useMyTasks()
  const qc = useQueryClient()
  const undo = useUndo()
  const router = useRouter()
  useScrollRestore(q.data !== undefined)
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set())
  const [menu, setMenu] = useState<{ anchor: HTMLElement; task: MyBucketTask } | null>(null)
  const untick = (id: string) =>
    setTicked((s) => {
      const n = new Set(s)
      n.delete(id)
      return n
    })
  const settle = async (projectId: string) => {
    await Promise.all([invalidateTasks(qc, projectId), invalidateLoad(qc)])
  }
  /** Optimistic status of one /my row (the list itself refetches on settle). */
  const patchStatus = (taskId: string, status: MyBucketTask['status']) =>
    qc.setQueryData<MyTasksData>(qk.myTasks(), (d) =>
      d
        ? {
            ...d,
            buckets: d.buckets.map((b) => ({
              ...b,
              tasks: b.tasks.map((t) => (t.id === taskId ? { ...t, status } : t)),
            })),
          }
        : d,
    )

  const complete = useMutation({
    mutationFn: (t: MyBucketTask) => unwrap(completeTask({ taskIds: [t.id] })),
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
    mutationFn: (v: { task: MyBucketTask; status: TaskStatusDTO }) =>
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
  const statusesOf = (projectId: string) => q.data.statusesByProject?.[projectId] ?? []
  // optimistic removal on tick / DONE (the list refetches on settle; undo brings the row back)
  const buckets = MY_BUCKETS.map((key) => ({
    key,
    tasks: (q.data.buckets.find((b) => b.key === key)?.tasks ?? []).filter((t) => !ticked.has(t.id)),
  }))
  if (q.data.buckets.every((b) => b.tasks.length === 0)) return <EmptyState title={th.my.empty} />

  return (
    <Box sx={{ display: 'grid', gap: 3, minWidth: 0 }}>
      {buckets
        .filter((b) => b.key !== 'UNPLANNED' || b.tasks.length > 0)
        .map((b) => (
          <Box
            key={b.key}
            component="section"
            aria-labelledby={`my-bucket-${b.key}`}
            data-my-bucket={b.key}
            sx={{ minWidth: 0 }}
          >
            <Typography
              id={`my-bucket-${b.key}`}
              component="h2"
              sx={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 1,
                mb: 1,
                fontSize: 'var(--font-md)',
                fontWeight: 'var(--weight-bold)',
              }}
            >
              {th.my.buckets[b.key]}
              <Box
                component="span"
                sx={{
                  color: 'var(--text-secondary)',
                  fontWeight: 'var(--weight-regular)',
                  fontSize: 'var(--font-sm)',
                }}
              >
                {th.my.countLabel(b.tasks.length)}
              </Box>
            </Typography>
            {b.tasks.length === 0 ? (
              <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                {th.my.emptyBucket}
              </Typography>
            ) : (
              <Box
                component="ul"
                sx={{ listStyle: 'none', m: 0, p: 0, borderTop: '1px solid var(--border-subtle)' }}
              >
                {b.tasks.map((t) => (
                  <MyTaskRow
                    key={t.id}
                    task={t}
                    bucket={b.key}
                    statuses={statusesOf(t.projectId)}
                    onTick={() => complete.mutate(t)}
                    onOpen={(href) => router.push(href)}
                    onStatusClick={(anchor) => setMenu({ anchor, task: t })}
                  />
                ))}
              </Box>
            )}
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

function MyTaskRow({
  task: t,
  bucket,
  statuses,
  onTick,
  onOpen,
  onStatusClick,
}: {
  task: MyBucketTask
  bucket: MyBucketKey
  statuses: TaskStatusDTO[]
  onTick: () => void
  onOpen: (href: string) => void
  onStatusClick: (anchor: HTMLElement) => void
}) {
  const href = projectTasksHref(t.projectId, t.id)
  return (
    <Box
      component="li"
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
        checked={false}
        onChange={onTick}
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
              onOpen(href)
            }}
            sx={{
              color: 'text.primary',
              fontSize: 'var(--font-md)',
              overflowWrap: 'anywhere',
              minWidth: 0,
              textDecoration: 'none',
              '&:hover': { textDecoration: 'underline' },
            }}
          >
            {t.name}
          </Box>
          {t.hasBody ? <HasBodyMark /> : null}
          <Box sx={{ flex: 1 }} />
          {t.plannedCd !== null ? (
            <Typography
              variant="body2"
              data-testid="my-planned"
              sx={{ whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}
            >
              {th.my.planned(twoDecimals(t.plannedCd))}
            </Typography>
          ) : null}
          <OpenAsPageLink taskId={t.id} />
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 0.5 }}>
          <StatusChip
            status={t.status}
            onClick={statuses.length > 0 ? (e) => onStatusClick(e.currentTarget) : undefined}
          />
          <ProjectChip project={t.project} />
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
          {(bucket === 'NEXT_WEEK' || bucket === 'LATER') && t.firstWeek ? (
            <Typography variant="caption" sx={{ color: 'var(--text-secondary)' }}>
              {th.my.fromWeek(formatWeekHeader(t.firstWeek))}
            </Typography>
          ) : null}
        </Box>
      </Box>
    </Box>
  )
}
