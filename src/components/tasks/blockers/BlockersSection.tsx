'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import CloseOutlined from '@mui/icons-material/CloseOutlined'
import Link from '@/components/Link'
import { PropertyRow } from '@/components/layout/PropertyList'
import { th } from '@/i18n/th'
import { taskPageHref } from '@/lib/nav/task-href'
import type { ProjectTasksResponse } from '@/lib/contracts/tasks'
import type { TaskRowModel } from '@/lib/tasks/tree'
import { descendantIds } from '@/lib/tree/ops'
import { StatusChip } from '../status/StatusChip'
import { openTaskPanel } from '../task-param'
import { useTaskMutations } from '../useTaskMutations'
import { BlockerBadge } from './BlockerBadge'

/** A task named in a property row: the panel opens it in the panel, the task page links to its page (FR-683/684). */
export function TaskRefButton({
  taskId,
  name,
  variant,
  done = false,
  lead = false,
}: {
  taskId: string
  name: string
  variant: 'panel' | 'page'
  done?: boolean
  /** Starts a property value line: hangs its start padding outside the column (PropertyList `data-lead`). */
  lead?: boolean
}) {
  const leadProps = lead ? { 'data-lead': '' } : {}
  const sx = {
    textTransform: 'none',
    color: 'text.primary',
    fontWeight: 'var(--weight-regular)',
    fontSize: 'var(--font-md)',
    minWidth: 0,
    px: 0.5,
    justifyContent: 'flex-start',
    textAlign: 'start',
    overflowWrap: 'anywhere',
    textDecoration: done ? 'line-through' : 'none',
  } as const
  return variant === 'page' ? (
    <Button size="small" component={Link} href={taskPageHref(taskId)} sx={sx} {...leadProps}>
      {name}
    </Button>
  ) : (
    <Button size="small" onClick={() => openTaskPanel(taskId)} sx={sx} {...leadProps}>
      {name}
    </Button>
  )
}

/**
 * Property rows "ถูกขวางโดย" / "กำลังขวาง" (FR-640–644, M3-D31; light rows FR-1604): add a same-project blocker from a
 * picker that already leaves out self, ancestors, descendants and current blockers (the server re-checks cycles and
 * shows the path); × removes with undo; the reverse list opens those tasks (panel, or the task page on `/t`).
 */
export function BlockersSection({
  projectId,
  task,
  rows,
  data,
  canEdit,
  variant = 'panel',
}: {
  projectId: string
  task: TaskRowModel
  rows: readonly TaskRowModel[]
  data: ProjectTasksResponse
  canEdit: boolean
  variant?: 'panel' | 'page'
}) {
  const m = useTaskMutations(projectId)
  const [adding, setAdding] = useState(false)
  // Picking or Esc unmounts the focused picker: focus goes back to "+ เพิ่มงานที่ขวาง" (never to <body>).
  const addRef = useRef<HTMLButtonElement>(null)
  const refocusAdd = useRef(false)
  const stopAdding = (refocus: boolean) => {
    refocusAdd.current = refocus
    setAdding(false)
  }
  useEffect(() => {
    if (adding || !refocusAdd.current) return
    refocusAdd.current = false
    addRef.current?.focus()
  }, [adding])
  // × unmounts its own (focused) item: before removing, hand focus to the next × in the list (else the previous one,
  // else "+ เพิ่มงานที่ขวาง") so Esc still returns to the row and keyboard users keep their place (§8.9)
  const listRef = useRef<HTMLUListElement>(null)
  const focusAfterRemove = (btn: HTMLElement) => {
    const all = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-blocker-remove]') ?? [])]
    const i = all.indexOf(btn)
    const target = all[i + 1] ?? all[i - 1] ?? addRef.current
    target?.focus()
  }
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows])
  const statusOf = (id: string) => data.statuses.find((s) => s.id === byId.get(id)?.statusId)
  const blockedBy = data.blockerEdges.filter((e) => e.taskId === task.id && byId.has(e.blockerTaskId))
  const blocking = data.blockerEdges.filter((e) => e.blockerTaskId === task.id && byId.has(e.taskId))
  const options = useMemo(() => {
    const excluded = new Set<string>([task.id, ...descendantIds(rows, task.id)])
    for (let p = task.parentId; p !== null; p = byId.get(p)?.parentId ?? null) excluded.add(p)
    for (const e of data.blockerEdges) if (e.taskId === task.id) excluded.add(e.blockerTaskId)
    return rows.filter((r) => !excluded.has(r.id))
  }, [rows, task.id, task.parentId, byId, data.blockerEdges])
  const names = blockedBy.map((e) => byId.get(e.blockerTaskId)?.name ?? '')

  return (
    <>
      <PropertyRow label={th.taskPage.properties.blockedBy}>
        <Box sx={{ display: 'grid', gap: 0.5, justifyItems: 'start' }} data-testid="blocked-by">
          {blockedBy.length > 0 ? (
            <Box
              component="ul"
              ref={listRef}
              sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.5 }}
            >
              {blockedBy.map((e) => {
                const name = byId.get(e.blockerTaskId)?.name ?? ''
                const status = statusOf(e.blockerTaskId)
                return (
                  <Box
                    component="li"
                    key={e.id}
                    sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}
                  >
                    <TaskRefButton taskId={e.blockerTaskId} name={name} variant={variant} lead />
                    {status ? <StatusChip status={status} /> : null}
                    {canEdit ? (
                      <IconButton
                        size="small"
                        aria-label={th.tasks.blockers.remove(name)}
                        data-blocker-remove=""
                        onClick={(ev) => {
                          focusAfterRemove(ev.currentTarget)
                          m.removeBlocker(e.id, name)
                        }}
                      >
                        <CloseOutlined fontSize="small" />
                      </IconButton>
                    ) : null}
                  </Box>
                )
              })}
            </Box>
          ) : null}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', width: '100%' }}>
            <BlockerBadge open={task.blockers.open} total={task.blockers.total} names={names} />
            {blockedBy.length === 0 && !canEdit ? (
              <Typography
                component="span"
                sx={{ color: 'var(--text-secondary)', fontSize: 'var(--font-md)' }}
              >
                {th.tasks.blockers.none}
              </Typography>
            ) : null}
            {canEdit ? (
              adding ? (
                <Box sx={{ flex: 1, minWidth: 200 }}>
                  <Autocomplete<TaskRowModel, false, false, false>
                    options={options}
                    getOptionLabel={(o) => o.name}
                    isOptionEqualToValue={(x, y) => x.id === y.id}
                    value={null}
                    openOnFocus
                    autoHighlight
                    size="small"
                    noOptionsText={th.tasks.blockers.none}
                    onChange={(_e, v) => {
                      if (v) m.addBlocker(task.id, v.id)
                      stopAdding(true)
                    }}
                    onClose={(_e, reason) => {
                      if (reason === 'escape') stopAdding(true)
                      else if (reason === 'blur') stopAdding(false)
                    }}
                    renderOption={(props, o) => {
                      const { key, ...rest } = props
                      return (
                        <li key={key} {...rest}>
                          <span>{o.name}</span>
                          {o.parentPath.length > 0 ? (
                            <Typography
                              component="span"
                              variant="caption"
                              sx={{ ml: 1, color: 'var(--text-secondary)' }}
                            >
                              {th.tasks.groups.parentPath(o.parentPath.join(' › '))}
                            </Typography>
                          ) : null}
                        </li>
                      )
                    }}
                    renderInput={(params) => (
                      <TextField {...params} autoFocus label={th.tasks.blockers.pickerLabel} />
                    )}
                  />
                </Box>
              ) : (
                <Button
                  ref={addRef}
                  size="small"
                  data-lead=""
                  onClick={() => setAdding(true)}
                  sx={{ color: 'var(--text-secondary)', px: 0.5 }}
                >
                  {th.tasks.blockers.add}
                </Button>
              )
            ) : null}
          </Box>
        </Box>
      </PropertyRow>
      <PropertyRow label={th.taskPage.properties.blocking}>
        {blocking.length === 0 ? (
          <Typography component="span" sx={{ color: 'var(--text-secondary)', fontSize: 'var(--font-md)' }}>
            {th.tasks.blockers.none}
          </Typography>
        ) : (
          <Box
            component="ul"
            sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}
          >
            {blocking.map((e, i) => (
              <li key={e.id}>
                <TaskRefButton
                  taskId={e.taskId}
                  name={byId.get(e.taskId)?.name ?? ''}
                  variant={variant}
                  lead={i === 0}
                />
              </li>
            ))}
          </Box>
        )}
      </PropertyRow>
    </>
  )
}
