'use client'
// src/components/tasks/embed/EmbeddedTasks.tsx — the list / board of a "มุมมองงาน" live block (FR-1301/1302/1306,
// M10-D2/D6/D7/D9/D31, X74). Reuses M3's TaskList (embed option) and TaskBoard/TaskCard unchanged; filters are applied
// on the client to the project's ProjectTasksResponse (M10-D6). The config toolbar shows only when the page editor is
// editable (M10-D7); task interactions follow `data.viewer.canEdit` only.
import FilterListOutlined from '@mui/icons-material/FilterListOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import InputLabel from '@mui/material/InputLabel'
import ListItemText from '@mui/material/ListItemText'
import MenuItem from '@mui/material/MenuItem'
import Popover from '@mui/material/Popover'
import Select from '@mui/material/Select'
import Skeleton from '@mui/material/Skeleton'
import Switch from '@mui/material/Switch'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type JSX, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { usePeopleOptions } from '@/hooks/usePeopleOptions'
import { th } from '@/i18n/th'
import type { PersonOption } from '@/lib/contracts/people'
import type { ProjectTasksResponse, TaskDTO } from '@/lib/contracts/tasks'
import { TASK_VIEW_LIMITS, type TaskViewLimit, type TaskViewProps } from '@/lib/schemas/page-content'
import { buildStatusColumns, toCardModel } from '@/lib/tasks/board'
import { taskCertainty } from '@/lib/tasks/certainty'
import { buildTaskRows, type TaskRowModel } from '@/lib/tasks/tree'
import { columnLabel, TaskBoard } from '../board/TaskBoard'
import { TaskCard } from '../board/TaskCard'
import { QuickAdd } from '../QuickAdd'
import { StatusChip } from '../status/StatusChip'
import { TaskList } from '../TaskList'
import { useTaskMutations } from '../useTaskMutations'
import { useProjectTasks } from '../useProjectTasks'

export interface EmbeddedTasksProps {
  projectId: string
  projectName: string
  /** `/projects/<id>/tasks`. */
  tasksHref: string
  props: TaskViewProps
  /** The page editor is editable → the config toolbar (M10-D7). */
  editable: boolean
  onPropsChange: (next: Partial<TaskViewProps>) => void
}

const L = th.editor.liveBlocks

/** The block's status filter: the ids that still exist in the project; none left → no filter (null). */
export function liveStatusIds(
  statusIds: string,
  data: Pick<ProjectTasksResponse, 'statuses'>,
): Set<string> | null {
  const known = new Set(data.statuses.map((s) => s.id))
  const ids = statusIds.split(',').filter((id) => known.has(id))
  return ids.length === 0 ? null : new Set(ids)
}

/** The block's milestone filter: the id only while the milestone exists (M8), else '' (= any). */
export function liveMilestoneId(milestoneId: string, data: Pick<ProjectTasksResponse, 'milestones'>): string {
  return milestoneId !== '' && data.milestones.some((m) => m.id === milestoneId) ? milestoneId : ''
}

export function EmbeddedTasks(p: EmbeddedTasksProps): JSX.Element {
  const q = useProjectTasks(p.projectId)
  if (q.isPending) return <Skeleton variant="rounded" height={96} aria-label={L.loading} />
  if (q.isError) {
    // the same error state as the other live blocks: fixed text + a retry (SPEC P4; a transient failure is recoverable)
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => void q.refetch()}>
            {L.retry}
          </Button>
        }
      >
        {L.error}
      </Alert>
    )
  }
  return <EmbeddedTasksView {...p} data={q.data} />
}

function EmbeddedTasksView(p: EmbeddedTasksProps & { data: ProjectTasksResponse }): JSX.Element {
  const { data, props } = p
  const router = useRouter()
  const openTask = useCallback(
    (id: string) => router.push(`${p.tasksHref}?task=${encodeURIComponent(id)}`),
    [router, p.tasksHref],
  )
  const milestoneId = liveMilestoneId(props.milestoneId, data)
  const statusSet = useMemo(() => liveStatusIds(props.statusIds, data), [props.statusIds, data])
  const categoryOf = useMemo(() => new Map(data.statuses.map((s) => [s.id, s.category])), [data.statuses])
  const { assigneeId, showDone, limit } = props
  const filter = useCallback(
    (t: TaskDTO) =>
      (assigneeId === '' || t.assignees.some((a) => a.userId === assigneeId)) &&
      (milestoneId === '' || t.milestoneId === milestoneId) &&
      (statusSet === null || statusSet.has(t.statusId)) &&
      (showDone || categoryOf.get(t.statusId) !== 'DONE'),
    [assigneeId, milestoneId, statusSet, showDone, categoryOf],
  )
  const [listCount, setListCount] = useState({ shown: 0, total: 0 })
  const onCount = useCallback((shown: number, total: number) => setListCount({ shown, total }), [])

  const board = p.props.view === 'BOARD'
  const boardCut = useBoardColumns(data, {
    assigneeId,
    milestoneId,
    statusSet,
    showDone,
    limit,
    enabled: board,
  })
  const count = board ? boardCut.count : listCount
  const archived = !data.viewer.canEdit

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {p.editable ? <Toolbar data={data} props={props} onPropsChange={p.onPropsChange} /> : null}
      {archived ? <Alert severity="info">{L.readOnlyArchived}</Alert> : null}
      {board ? (
        boardCut.count.total === 0 ? (
          <Box sx={{ color: 'text.secondary', py: 1 }}>{L.empty}</Box>
        ) : (
          <EmbeddedBoard projectId={p.projectId} data={data} columns={boardCut.columns} onOpen={openTask} />
        )
      ) : (
        <TaskList projectId={p.projectId} embed={{ filter, limit, onOpenTask: openTask, onCount }} />
      )}
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', fontSize: 'var(--font-sm)' }}>
        {count.shown < count.total ? <Link href={p.tasksHref}>{L.seeAll(count.total)}</Link> : null}
        <Link href={p.tasksHref}>{L.openTasksTab}</Link>
      </Box>
    </Box>
  )
}

/** M10-D6: M3's status columns with the block's filters; each column keeps its first `limit` cards. */
function useBoardColumns(
  data: ProjectTasksResponse,
  o: {
    assigneeId: string
    milestoneId: string
    statusSet: Set<string> | null
    showDone: boolean
    limit: number
    enabled: boolean
  },
) {
  const { assigneeId, milestoneId, statusSet, showDone, limit, enabled } = o
  return useMemo(() => {
    if (!enabled) return { columns: [], count: { shown: 0, total: 0 } }
    const all = buildStatusColumns(buildTaskRows(data.tasks), data.statuses, {
      leafOnly: false,
      hideDone: !showDone,
      assigneeId: assigneeId === '' ? null : assigneeId,
      milestone: milestoneId === '' ? 'ALL' : milestoneId,
    }).filter((c) => statusSet === null || (c.statusId !== null && statusSet.has(c.statusId)))
    const total = all.reduce((n, c) => n + c.cards.length, 0)
    const columns = all.map((c) => ({ ...c, cards: c.cards.slice(0, limit) }))
    const shown = columns.reduce((n, c) => n + c.cards.length, 0)
    return { columns, count: { shown, total } }
  }, [data.tasks, data.statuses, assigneeId, milestoneId, statusSet, showDone, limit, enabled])
}

/** The project board call of M3/M8 (ProjectBoard) with the block's columns; cards open the tasks tab. */
function EmbeddedBoard({
  projectId,
  data,
  columns,
  onOpen,
}: {
  projectId: string
  data: ProjectTasksResponse
  columns: ReturnType<typeof useBoardColumns>['columns']
  onOpen: (taskId: string) => void
}): JSX.Element {
  const m = useTaskMutations(projectId)
  const { canEdit } = data.viewer
  const byId = useMemo(() => new Map(buildTaskRows(data.tasks).map((r) => [r.id, r])), [data.tasks])
  const milestoneOf = (row: TaskRowModel) => {
    const ref = row.milestoneId ? data.milestones.find((x) => x.id === row.milestoneId) : undefined
    return ref ? { name: ref.name, late: row.lateForMilestone } : null
  }
  const blockerNames = (taskId: string) =>
    data.blockerEdges
      .filter((e) => e.taskId === taskId)
      .map((e) => byId.get(e.blockerTaskId)?.name)
      .filter((n): n is string => n !== undefined)
  const toggleDone = (id: string) => {
    const r = byId.get(id)
    if (!r) return
    if (r.completedOn === null) m.complete([id])
    else m.uncomplete([id])
  }
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <TaskBoard<TaskRowModel>
        columns={columns}
        canEdit={canEdit}
        cardLabel={(r) => r.name}
        onMove={(cardId, key) => {
          const statusId = columns.find((c) => c.key === key)?.statusId
          if (statusId) m.setStatus([cardId], statusId)
        }}
        renderCard={(row) => (
          <TaskCard
            card={toCardModel(row, data.statuses, taskCertainty(byId, row.id, data.project.certainty).value)}
            statuses={data.statuses}
            canEdit={canEdit}
            blockerNames={blockerNames(row.id)}
            onOpen={onOpen}
            onPickStatus={(id, statusId) => m.setStatus([id], statusId)}
            onToggleDone={toggleDone}
            milestone={milestoneOf(row)}
          />
        )}
        footer={(col) =>
          canEdit && col.statusId ? (
            <ColumnQuickAdd
              label={th.tasks.board.quickAdd(columnLabel(col))}
              onCreate={(name) => m.create({ parentId: null, name, statusId: col.statusId as string })}
            />
          ) : null
        }
      />
    </Box>
  )
}

/** "+ เพิ่มงาน" of a board column (FR-664) — the same interaction as ProjectBoard's column quick add. */
function ColumnQuickAdd({ label, onCreate }: { label: string; onCreate: (name: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const refocus = useRef(false)
  useEffect(() => {
    if (open || !refocus.current) return
    refocus.current = false
    buttonRef.current?.focus()
  }, [open])
  if (!open) {
    return (
      <Button
        ref={buttonRef}
        size="small"
        aria-label={label}
        onClick={() => setOpen(true)}
        sx={{ justifyContent: 'flex-start' }}
      >
        {th.tasks.quickAdd.placeholder}
      </Button>
    )
  }
  return (
    <QuickAdd
      depth={0}
      inset={4}
      disabled={false}
      inputRef={ref}
      label={label}
      autoFocus
      onCreate={onCreate}
      onEscape={() => {
        refocus.current = true
        setOpen(false)
      }}
      onBlur={() => {
        if (ref.current?.value === '') setOpen(false)
      }}
    />
  )
}

const displayName = (p: PersonOption | undefined, id: string): string => p?.nickname ?? p?.name ?? id

/** View toggle + "ตัวกรอง" popover (FR-1302); every change is a block prop write (autosaved with the page). */
function Toolbar({
  data,
  props,
  onPropsChange,
}: {
  data: ProjectTasksResponse
  props: TaskViewProps
  onPropsChange: (next: Partial<TaskViewProps>) => void
}): JSX.Element {
  const F = L.filters
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const people = usePeopleOptions()
  const byId = useMemo(() => new Map((people.data ?? []).map((x) => [x.id, x])), [people.data])
  const members = data.members.map((m) => ({ id: m.userId, name: displayName(byId.get(m.userId), m.userId) }))
  const statusIds = props.statusIds === '' ? [] : props.statusIds.split(',')
  const ids = { assignee: useId(), milestone: useId(), status: useId(), limit: useId() }
  return (
    <Box role="toolbar" aria-label={L.view.label} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={props.view}
        aria-label={L.view.label}
        onChange={(_e, v: TaskViewProps['view'] | null) => {
          if (v !== null && v !== props.view) onPropsChange({ view: v })
        }}
      >
        <ToggleButton value="LIST">{L.view.LIST}</ToggleButton>
        <ToggleButton value="BOARD">{L.view.BOARD}</ToggleButton>
      </ToggleButtonGroup>
      <Button
        size="small"
        startIcon={<FilterListOutlined fontSize="small" />}
        aria-haspopup="dialog"
        onClick={(e) => setAnchor(e.currentTarget)}
      >
        {F.button}
      </Button>
      <Popover
        open={anchor !== null}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { role: 'dialog', 'aria-label': F.button } }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 2, minWidth: 260 }}>
          <FormControl size="small">
            <InputLabel id={ids.assignee}>{F.assignee}</InputLabel>
            <Select
              labelId={ids.assignee}
              label={F.assignee}
              value={props.assigneeId}
              onChange={(e) => onPropsChange({ assigneeId: e.target.value })}
            >
              <MenuItem value="">{F.anyone}</MenuItem>
              {members.map((m) => (
                <MenuItem key={m.id} value={m.id}>
                  {m.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {data.milestones.length > 0 ? (
            <FormControl size="small">
              <InputLabel id={ids.milestone}>{F.milestone}</InputLabel>
              <Select
                labelId={ids.milestone}
                label={F.milestone}
                value={liveMilestoneId(props.milestoneId, data)}
                onChange={(e) => onPropsChange({ milestoneId: e.target.value })}
              >
                <MenuItem value="">{F.anyMilestone}</MenuItem>
                {data.milestones.map((m) => (
                  <MenuItem key={m.id} value={m.id}>
                    {m.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : null}
          <FormControl size="small">
            <InputLabel id={ids.status}>{F.status}</InputLabel>
            <Select<string[]>
              labelId={ids.status}
              label={F.status}
              multiple
              displayEmpty
              value={statusIds.filter((id) => data.statuses.some((s) => s.id === id))}
              renderValue={(v) =>
                v.length === 0
                  ? F.anyStatus
                  : data.statuses
                      .filter((s) => v.includes(s.id))
                      .map((s) => s.name)
                      .join(', ')
              }
              onChange={(e) => {
                const v = e.target.value
                onPropsChange({ statusIds: (typeof v === 'string' ? v.split(',') : v).join(',') })
              }}
            >
              {data.statuses.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  <Checkbox size="small" checked={statusIds.includes(s.id)} sx={{ p: 0.5 }} />
                  <ListItemText primary={<StatusChip status={s} />} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={props.showDone}
                onChange={(e) => onPropsChange({ showDone: e.target.checked })}
              />
            }
            label={F.showDone}
          />
          <FormControl size="small">
            <InputLabel id={ids.limit}>{F.limit}</InputLabel>
            <Select<TaskViewLimit>
              labelId={ids.limit}
              label={F.limit}
              value={props.limit}
              onChange={(e) => onPropsChange({ limit: Number(e.target.value) as TaskViewLimit })}
            >
              {TASK_VIEW_LIMITS.map((n) => (
                <MenuItem key={n} value={n}>
                  {F.limitOption(n)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      </Popover>
    </Box>
  )
}
