'use client'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS as DndCSS } from '@dnd-kit/utilities'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import FormControl from '@mui/material/FormControl'
import IconButton from '@mui/material/IconButton'
import InputLabel from '@mui/material/InputLabel'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Popover from '@mui/material/Popover'
import Select from '@mui/material/Select'
import Typography from '@mui/material/Typography'
import ArrowDownwardOutlined from '@mui/icons-material/ArrowDownwardOutlined'
import ArrowUpwardOutlined from '@mui/icons-material/ArrowUpwardOutlined'
import DeleteOutlined from '@mui/icons-material/DeleteOutlined'
import DragIndicator from '@mui/icons-material/DragIndicator'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { InlineEditText } from '@/components/common/InlineEditText'
import { CategoryIcon, ColorDot, StatusChip } from '@/components/tasks/status/StatusChip'
import { useUndo } from '@/components/undo/useUndo'
import { defaultStatus, sortStatuses, STATUS_COLORS, type StatusColor } from '@/domain/status'
import type { TaskStatusCategory } from '@/domain/types'
import { th } from '@/i18n/th'
import { unwrap } from '@/lib/action-result'
import { getJson } from '@/lib/api'
import type { ProjectStatusesResponse, TaskStatusDTO } from '@/lib/contracts/tasks'
import { invalidateStatuses } from '@/lib/invalidate'
import { qk } from '@/lib/query-keys'
import {
  createTaskStatus,
  deleteTaskStatus,
  reorderTaskStatus,
  restoreTaskStatusBatch,
  updateTaskStatus,
} from '@/server/actions/task-statuses'
import { errorMessage } from './errors'

const CATEGORIES: readonly TaskStatusCategory[] = ['TODO', 'IN_PROGRESS', 'WAITING', 'DONE']
const COLOR_KEYS = ['slate', 'blue', 'teal', 'green', 'amber', 'orange', 'red', 'purple'] as const
const AMBER: StatusColor = '#B45309'
const colorName = (c: string) => {
  const i = STATUS_COLORS.findIndex((x) => x === c)
  return th.tasks.status.settings.colorName[COLOR_KEYS[i] ?? 'slate']
}

/** GET /api/projects/[id]/statuses (FR-622). */
export function useProjectStatuses(projectId: string) {
  return useQuery({
    queryKey: qk.projectStatuses(projectId),
    queryFn: ({ signal }) =>
      getJson<ProjectStatusesResponse>(`/api/projects/${projectId}/statuses`, { signal }),
  })
}

/**
 * ภาพรวม › สถานะงาน (FR-622–624, PERM-23, M3-D29/D30): LEAD/Manager add (before the first DONE, WAITING, amber),
 * rename inline, change category/colour, reorder (undo) by dragging the pointer-only handle or with the ↑/↓ buttons
 * (keyboard parity, M3-D10), delete — unused at once with undo, used through a
 * destination popover (a choice, not a confirm). Server VALIDATION reasons render under the row. Others read only.
 */
export function StatusSettings({ projectId }: { projectId: string }) {
  const q = useProjectStatuses(projectId)
  const headingId = useId()
  return (
    <Paper variant="outlined" component="section" aria-labelledby={headingId} sx={{ p: 2 }}>
      <Typography id={headingId} variant="h6" component="h2" sx={{ mb: 1 }}>
        {th.tasks.status.settings.title}
      </Typography>
      {q.isPending ? (
        <Typography variant="body2">{th.common.loading}</Typography>
      ) : q.isError ? (
        <Alert severity="error">{errorMessage(q.error)}</Alert>
      ) : (
        <Body projectId={projectId} data={q.data} />
      )}
    </Paper>
  )
}

function Body({ projectId, data }: { projectId: string; data: ProjectStatusesResponse }) {
  const qc = useQueryClient()
  const undo = useUndo()
  const statuses = useMemo(() => sortStatuses(data.statuses), [data.statuses])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [del, setDel] = useState<{ anchor: HTMLElement; status: TaskStatusDTO; to: string } | null>(null)
  const [renameId, setRenameId] = useState<string | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const canManage = data.canManage
  const refresh = () => invalidateStatuses(qc, projectId)
  const fail = (key: string, err: unknown) => {
    setErrors((e) => ({ ...e, [key]: errorMessage(err) }))
    void refresh()
  }
  const okFor = (key: string) =>
    setErrors((e) => {
      const { [key]: _gone, ...rest } = e
      return rest
    })

  // open the new status's name for renaming once it is in the list — once per add: a later `statuses` change (the
  // refetch after the rename itself lands a tick after the editor closed) must not reopen the editor
  const renamed = useRef<string | null>(null)
  useEffect(() => {
    if (renameId === null || renamed.current === renameId) return
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-testid="status-row-${CSS.escape(renameId)}"] [data-inline-edit]`,
    )
    if (!el) return // not rendered yet; runs again when `statuses` changes
    renamed.current = renameId
    el.click()
  }, [renameId, statuses])

  const add = async () => {
    const firstDone = statuses.findIndex((s) => s.category === 'DONE')
    const afterId =
      firstDone > 0
        ? (statuses[firstDone - 1]?.id ?? null)
        : firstDone === 0
          ? null
          : (statuses.at(-1)?.id ?? null)
    const taken = new Set(statuses.map((s) => s.name.toLocaleLowerCase('th')))
    let name: string = th.tasks.status.settings.newName
    for (let n = 2; taken.has(name.toLocaleLowerCase('th')); n++)
      name = `${th.tasks.status.settings.newName} ${n}`
    try {
      const r = await unwrap(
        createTaskStatus({ projectId, name, category: 'WAITING', color: AMBER, afterId }),
      )
      okFor('new')
      let batch: string | null = null
      const statusId = r.status.id
      undo.push(
        {
          label: th.tasks.undoLabel.statusCreate,
          undo: async () => {
            batch = (await unwrap(deleteTaskStatus({ statusId }))).batch
            await refresh()
          },
          redo: async () => {
            if (batch) await unwrap(restoreTaskStatusBatch({ batch, moveToStatusId: null, moved: [] }))
            await refresh()
          },
        },
        { toast: th.tasks.status.toast.created(name) },
      )
      setRenameId(statusId)
      await refresh()
    } catch (err) {
      fail('new', err)
    }
  }

  const update = async (
    s: TaskStatusDTO,
    patch: { name?: string; category?: TaskStatusCategory; color?: StatusColor },
  ) => {
    try {
      await unwrap(updateTaskStatus({ statusId: s.id, patch }))
      okFor(s.id)
      await refresh()
    } catch (err) {
      fail(s.id, err)
      throw err
    }
  }

  // the deleted row unmounts with its focused delete button: once it is gone from the list, focus the next row's
  // delete button (else the previous one), else "+ เพิ่มสถานะ" — never <body> (§8.9)
  const deleteFocus = useRef<{ goneId: string; nextId: string | null } | null>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const f = deleteFocus.current
    if (f === null || statuses.some((x) => x.id === f.goneId)) return
    deleteFocus.current = null
    const next =
      f.nextId === null
        ? null
        : listRef.current?.querySelector<HTMLElement>(
            `[data-testid="status-row-${CSS.escape(f.nextId)}"] [data-status-delete]`,
          )
    ;(next ?? addRef.current)?.focus()
  }, [statuses])

  const remove = async (s: TaskStatusDTO, moveToStatusId?: string) => {
    const at = statuses.findIndex((x) => x.id === s.id)
    deleteFocus.current = { goneId: s.id, nextId: (statuses[at + 1] ?? statuses[at - 1])?.id ?? null }
    try {
      const r = await unwrap(
        deleteTaskStatus({ statusId: s.id, ...(moveToStatusId ? { moveToStatusId } : {}) }),
      )
      okFor(s.id)
      let current = r
      const toName = statuses.find((x) => x.id === moveToStatusId)?.name ?? ''
      undo.push(
        {
          label: th.tasks.undoLabel.statusDelete,
          undo: async () => {
            const res = await unwrap(
              restoreTaskStatusBatch({
                batch: current.batch,
                moveToStatusId: current.moveToStatusId,
                moved: current.moved,
              }),
            )
            if (res.skipped > 0) toast(th.tasks.status.toast.restoreSkipped(res.skipped))
            await refresh()
          },
          redo: async () => {
            current = await unwrap(
              deleteTaskStatus({ statusId: s.id, ...(moveToStatusId ? { moveToStatusId } : {}) }),
            )
            await refresh()
          },
        },
        {
          toast: moveToStatusId
            ? th.tasks.status.toast.deletedMoved(r.moved.length, toName)
            : th.tasks.status.toast.deleted(s.name),
        },
      )
      await refresh()
    } catch (err) {
      deleteFocus.current = null // the row stays (with its reason under it): focus stays on its delete button
      fail(s.id, err)
    }
  }

  const onDelete = (anchor: HTMLElement, s: TaskStatusDTO) => {
    if ((data.usage[s.id] ?? 0) === 0) {
      void remove(s)
      return
    }
    const rest = statuses.filter((x) => x.id !== s.id)
    let to = rest[0]?.id ?? ''
    try {
      to = defaultStatus(rest).id // FR-624 default = สถานะเริ่มต้น of the remaining set (M3-D30)
    } catch {
      /* no TODO left: the server answers BR-84 */
    }
    setDel({ anchor, status: s, to })
  }

  const reorder = async (s: TaskStatusDTO, afterId: string | null) => {
    try {
      const r = await unwrap(reorderTaskStatus({ statusId: s.id, afterId }))
      okFor(s.id)
      undo.push({
        label: th.tasks.undoLabel.statusReorder,
        undo: async () => {
          await unwrap(reorderTaskStatus({ statusId: s.id, afterId: r.previousAfterId }))
          await refresh()
        },
        redo: async () => {
          await unwrap(reorderTaskStatus({ statusId: s.id, afterId }))
          await refresh()
        },
      })
      await refresh()
    } catch (err) {
      fail(s.id, err)
    }
  }

  // after a ↑/↓ move React re-inserts the row, which drops focus: put it back on the same (or the other) button
  const moveFocus = useRef<{ id: string; dir: 'up' | 'down' } | null>(null)
  useEffect(() => {
    const f = moveFocus.current
    if (f === null) return
    moveFocus.current = null
    const row = listRef.current?.querySelector<HTMLElement>(`[data-testid="status-row-${CSS.escape(f.id)}"]`)
    const btn = (dir: 'up' | 'down') =>
      row?.querySelector<HTMLButtonElement>(`[data-move="${dir}"]:not(:disabled)`) ?? null
    const target = btn(f.dir) ?? btn(f.dir === 'up' ? 'down' : 'up')
    target?.focus()
  }, [statuses])

  const moveStatus = (from: number, to: number) => {
    const s = statuses[from]
    if (!s || to < 0 || to >= statuses.length || from === to) return
    const moved = arrayMove(statuses, from, to)
    const at = moved.findIndex((x) => x.id === s.id)
    const afterId = at > 0 ? (moved[at - 1]?.id ?? null) : null
    // optimistic order
    qc.setQueryData<ProjectStatusesResponse>(qk.projectStatuses(projectId), (d) =>
      d ? { ...d, statuses: moved.map((x, i) => ({ ...x, position: `a${String(i).padStart(3, '0')}` })) } : d,
    )
    void reorder(s, afterId)
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    moveStatus(
      statuses.findIndex((s) => s.id === active.id),
      statuses.findIndex((s) => s.id === over.id),
    )
  }

  const moveBy = (s: TaskStatusDTO, d: -1 | 1) => {
    const from = statuses.findIndex((x) => x.id === s.id)
    moveFocus.current = { id: s.id, dir: d < 0 ? 'up' : 'down' }
    moveStatus(from, from + d)
  }

  const rows = (
    <Box component="ul" ref={listRef} sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.5 }}>
      {statuses.map((s, i) => (
        <StatusRow
          key={s.id}
          status={s}
          first={i === 0}
          last={i === statuses.length - 1}
          onMove={(d) => moveBy(s, d)}
          usage={data.usage[s.id] ?? 0}
          canManage={canManage}
          error={errors[s.id]}
          onRename={(name) => update(s, { name })}
          onCategory={(category) => void update(s, { category }).catch(() => {})}
          onColor={(color) => void update(s, { color }).catch(() => {})}
          onDelete={(anchor) => onDelete(anchor, s)}
        />
      ))}
    </Box>
  )

  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      {canManage ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={statuses.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            {rows}
          </SortableContext>
        </DndContext>
      ) : (
        <>
          {rows}
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {th.tasks.status.settings.readOnly}
          </Typography>
        </>
      )}
      {canManage ? (
        <Box>
          <Button ref={addRef} size="small" onClick={() => void add()}>
            {th.tasks.status.settings.add}
          </Button>
          {errors.new ? (
            <Typography variant="body2" role="alert" sx={{ color: 'error.main' }}>
              {errors.new}
            </Typography>
          ) : null}
        </Box>
      ) : null}
      <Popover
        open={del !== null}
        anchorEl={del?.anchor ?? null}
        onClose={() => setDel(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {del ? (
          <Box sx={{ p: 2, width: 280, display: 'grid', gap: 1.5 }}>
            <Typography variant="body2">{th.tasks.status.errors.needDestination}</Typography>
            <FormControl size="small" fullWidth>
              <InputLabel id="status-move-to">{th.tasks.status.settings.moveTo}</InputLabel>
              <Select
                labelId="status-move-to"
                label={th.tasks.status.settings.moveTo}
                value={del.to}
                onChange={(e) => setDel({ ...del, to: e.target.value })}
              >
                {statuses
                  .filter((x) => x.id !== del.status.id)
                  .map((x) => (
                    <MenuItem key={x.id} value={x.id}>
                      {x.name}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
            <Button
              variant="contained"
              color="error"
              disabled={del.to === ''}
              onClick={() => {
                const { status, to } = del
                setDel(null)
                void remove(status, to)
              }}
            >
              {th.tasks.status.settings.moveAndDelete}
            </Button>
          </Box>
        ) : null}
      </Popover>
    </Box>
  )
}

function StatusRow({
  status,
  first,
  last,
  onMove,
  usage,
  canManage,
  error,
  onRename,
  onCategory,
  onColor,
  onDelete,
}: {
  status: TaskStatusDTO
  first: boolean
  last: boolean
  onMove: (d: -1 | 1) => void
  usage: number
  canManage: boolean
  error: string | undefined
  onRename: (name: string) => Promise<void>
  onCategory: (c: TaskStatusCategory) => void
  onColor: (c: StatusColor) => void
  onDelete: (anchor: HTMLElement) => void
}) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition } = useSortable({
    id: status.id,
    disabled: !canManage,
  })
  const [colorMenu, setColorMenu] = useState<HTMLElement | null>(null)
  const catId = useId()
  return (
    <Box
      component="li"
      ref={setNodeRef}
      data-testid={`status-row-${status.id}`}
      style={{ transform: DndCSS.Translate.toString(transform), transition }}
      sx={{ display: 'grid', gap: 0.25, py: 0.5, borderBottom: 1, borderColor: 'divider' }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        {canManage ? (
          <>
            {/* pointer-only: keyboard users reorder with ↑/↓ below, so no tab stop and no dnd-kit "press space"
                instructions (only PointerSensor is registered) */}
            <IconButton
              size="small"
              ref={setActivatorNodeRef}
              {...attributes}
              {...listeners}
              tabIndex={-1}
              aria-describedby={undefined}
              aria-roledescription={undefined}
              aria-label={th.tasks.status.settings.dragHandle}
              sx={{ cursor: 'grab', touchAction: 'none' }}
            >
              <DragIndicator fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              data-move="up"
              disabled={first}
              aria-label={th.tasks.status.settings.moveUp(status.name)}
              onClick={() => onMove(-1)}
            >
              <ArrowUpwardOutlined fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              data-move="down"
              disabled={last}
              aria-label={th.tasks.status.settings.moveDown(status.name)}
              onClick={() => onMove(1)}
            >
              <ArrowDownwardOutlined fontSize="small" />
            </IconButton>
          </>
        ) : null}
        {canManage ? (
          <>
            <CategoryIcon category={status.category} />
            <Box sx={{ flex: '1 1 140px', minWidth: 0 }}>
              <InlineEditText
                value={status.name}
                label={th.tasks.status.settings.name}
                maxLength={40}
                variant="body2"
                onCommit={onRename}
              />
            </Box>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel id={catId}>{th.tasks.status.settings.category}</InputLabel>
              <Select
                labelId={catId}
                label={th.tasks.status.settings.category}
                value={status.category}
                onChange={(e) => {
                  const c = CATEGORIES.find((x) => x === e.target.value)
                  if (c && c !== status.category) onCategory(c)
                }}
              >
                {CATEGORIES.map((c) => (
                  <MenuItem key={c} value={c}>
                    {th.tasks.status.categories[c]}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              size="small"
              aria-haspopup="menu"
              aria-label={`${th.tasks.status.settings.color}: ${colorName(status.color)}`}
              onClick={(e) => setColorMenu(e.currentTarget)}
              startIcon={<ColorDot color={status.color} />}
            >
              {colorName(status.color)}
            </Button>
            <Menu anchorEl={colorMenu} open={colorMenu !== null} onClose={() => setColorMenu(null)}>
              {STATUS_COLORS.map((c) => (
                <MenuItem
                  key={c}
                  selected={c === status.color}
                  onClick={() => {
                    setColorMenu(null)
                    if (c !== status.color) onColor(c)
                  }}
                >
                  <ColorDot color={c} />
                  <Box component="span" sx={{ ml: 1 }}>
                    {colorName(c)}
                  </Box>
                </MenuItem>
              ))}
            </Menu>
          </>
        ) : (
          <>
            <StatusChip status={status} />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {th.tasks.status.categories[status.category]}
            </Typography>
          </>
        )}
        <Typography variant="body2" sx={{ color: 'text.secondary', ml: 'auto' }}>
          {th.tasks.status.settings.usage(usage)}
        </Typography>
        {canManage ? (
          <IconButton
            size="small"
            aria-label={th.tasks.status.settings.delete(status.name)}
            data-status-delete=""
            onClick={(e) => onDelete(e.currentTarget)}
          >
            <DeleteOutlined fontSize="small" />
          </IconButton>
        ) : null}
      </Box>
      {error ? (
        <Typography variant="body2" role="alert" sx={{ color: 'error.main' }}>
          {error}
        </Typography>
      ) : null}
    </Box>
  )
}
