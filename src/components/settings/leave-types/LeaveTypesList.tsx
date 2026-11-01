'use client'
import {
  useLayoutEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
  type MouseEvent,
  type SubmitEvent,
} from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Add from '@mui/icons-material/Add'
import ArrowDownward from '@mui/icons-material/ArrowDownward'
import ArrowUpward from '@mui/icons-material/ArrowUpward'
import Check from '@mui/icons-material/Check'
import DeleteOutlined from '@mui/icons-material/DeleteOutlined'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ColorSwatchPicker } from '@/components/common/ColorSwatchPicker'
import { EmptyState } from '@/components/common/EmptyState'
import { helperText, zodFieldErrors, type FieldErrors } from '@/components/forms/field-errors'
import { useUndo, type UndoEntry } from '@/components/undo/useUndo'
import { th } from '@/i18n/th'
import { unwrap, type ActionError } from '@/lib/action-result'
import type { LeaveTypeAdminDTO } from '@/lib/contracts/leave-types'
import { invalidateLeaveTypes } from '@/lib/invalidate'
import { PROJECT_COLORS } from '@/lib/project-colors'
import { createLeaveTypeSchema, updateLeaveTypeSchema } from '@/lib/schemas/leave-types'
import {
  createLeaveType,
  deleteLeaveType,
  moveLeaveType,
  restoreLeaveType,
  setLeaveTypeArchived,
  updateLeaveType,
} from '@/server/actions/leave-types'

type ButtonKind = 'name' | 'delete' | 'up' | 'down'

type Op =
  | { kind: 'patch'; id: string; patch: Partial<Pick<LeaveTypeAdminDTO, 'name' | 'color' | 'archived'>> }
  | { kind: 'move'; id: string; direction: 'up' | 'down' }
  | { kind: 'delete'; id: string }

/** Optimistic view of one pending operation; the action's refresh() replaces it when it settles. */
function applyOp(rows: LeaveTypeAdminDTO[], op: Op): LeaveTypeAdminDTO[] {
  switch (op.kind) {
    case 'patch':
      return rows.map((r) => (r.id === op.id ? { ...r, ...op.patch } : r))
    case 'delete':
      return rows.filter((r) => r.id !== op.id)
    case 'move': {
      const i = rows.findIndex((r) => r.id === op.id)
      const j = op.direction === 'up' ? i - 1 : i + 1
      if (i < 0 || j < 0 || j >= rows.length) return rows
      const next = [...rows]
      ;[next[i], next[j]] = [next[j]!, next[i]!]
      return next
    }
  }
}

/** A taken name comes back as CONFLICT (leave_types_name_unique) — show it under the name field. */
function nameErrors(r: ActionError): string[] | null {
  if (r.fieldErrors?.name?.length) return r.fieldErrors.name
  if (r.code === 'CONFLICT' && !r.fieldErrors) return [r.message]
  return null
}

function Swatch({ color, size = 20 }: { color: string; size?: number }) {
  return (
    <Box
      component="span"
      aria-hidden="true"
      sx={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: 'var(--radius-sm)',
        bgcolor: color,
        flex: 'none',
      }}
    />
  )
}

/**
 * /settings/leave-types (FR-902, M5-D10): ordered list with colour (swatch menu), inline rename (Enter saves, Esc
 * cancels), move up/down, archive / unarchive and delete. A type that is in use is archived instead of deleted;
 * the last active type cannot be archived or deleted (server message). Every change has an 8 s undo toast +
 * Cmd/Ctrl+Z (no confirm dialog). The colour is only a swatch / chip border, never a text background.
 */
export function LeaveTypesList({ rows }: { rows: LeaveTypeAdminDTO[] }) {
  const qc = useQueryClient()
  const undo = useUndo()
  const [list, apply] = useOptimistic(rows, applyOp)
  const [, startTransition] = useTransition()
  const [adding, startAdding] = useTransition()
  const [editing, setEditing] = useState<{ id: string; value: string; errors: string[] } | null>(null)
  const [colorMenu, setColorMenu] = useState<{ id: string; anchor: HTMLElement } | null>(null)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState<string | null>(null)
  const [addErrors, setAddErrors] = useState<FieldErrors>({})
  // Focus targets (SPEC §8.9 keyboard-only use, the PositionsList pattern): when the focused control disappears —
  // the rename field closes, a row is deleted, or a move button becomes disabled at the list end — focus moves to a
  // stable neighbour instead of dropping to <body>.
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const addInput = useRef<HTMLInputElement>(null)
  const listEl = useRef<HTMLUListElement>(null)
  const movedRow = useRef<{ id: string; direction: 'up' | 'down' } | null>(null)
  /** The row's name button only mounts once the rename field closes: focus it after that render. */
  const focusNameOf = useRef<string | null>(null)
  const buttonRef = (kind: ButtonKind, id: string) => (el: HTMLButtonElement | null) => {
    const key = `${kind}:${id}`
    if (!el) return
    buttons.current.set(key, el)
    return () => {
      if (buttons.current.get(key) === el) buttons.current.delete(key)
    }
  }
  const focusButton = (kind: ButtonKind, id: string) => buttons.current.get(`${kind}:${id}`)?.focus()

  useLayoutEffect(() => {
    const nameOf = focusNameOf.current
    if (nameOf !== null && editing === null) {
      focusNameOf.current = null
      focusButton('name', nameOf)
    }
  })

  // After a move renders, keep focus on the moved row: the pressed button is disabled once the row reaches the list
  // end — then the opposite move button takes focus.
  useLayoutEffect(() => {
    const moved = movedRow.current
    if (!moved) return
    movedRow.current = null
    const pressed = buttons.current.get(`${moved.direction}:${moved.id}`)
    const opposite = buttons.current.get(`${moved.direction === 'up' ? 'down' : 'up'}:${moved.id}`)
    const target = pressed && !pressed.disabled ? pressed : opposite
    const active = document.activeElement
    // Only when focus is still on the list (or was lost) — never steal it from a control the user moved to.
    const focusInList = !active || active === document.body || listEl.current?.contains(active)
    if (target && !target.disabled && focusInList && active !== target) target.focus()
  }, [list])

  const closeRename = (id: string) => {
    focusNameOf.current = id
    setEditing(null)
  }

  const used = new Set(list.map((r) => r.color.toUpperCase()))
  const defaultColor = PROJECT_COLORS.find((c) => !used.has(c)) ?? PROJECT_COLORS[0]
  const color = newColor ?? defaultColor
  const refresh = () => invalidateLeaveTypes(qc)
  const pushUndo = (entry: UndoEntry, message: string) => undo.push(entry, { toast: message })

  const patch = (row: LeaveTypeAdminDTO, p: { name?: string; color?: string }) => {
    startTransition(async () => {
      apply({ kind: 'patch', id: row.id, patch: p })
      const r = await updateLeaveType({ id: row.id, ...p })
      if (!r.ok) {
        const errors = p.name !== undefined ? nameErrors(r) : null
        if (errors && p.name !== undefined) setEditing({ id: row.id, value: p.name, errors })
        else toast.error(r.message)
        return
      }
      void refresh()
    })
  }

  const setArchived = (row: LeaveTypeAdminDTO, archived: boolean) => {
    startTransition(async () => {
      apply({ kind: 'patch', id: row.id, patch: { archived } })
      const r = await setLeaveTypeArchived({ id: row.id, archived })
      if (!r.ok) {
        toast.error(r.message) // e.g. lastActive
        return
      }
      const message = archived ? th.leaveTypes.archived(row.name) : th.leaveTypes.unarchived(row.name)
      pushUndo(
        {
          label: message,
          undo: () => unwrap(setLeaveTypeArchived({ id: row.id, archived: !archived })).then(refresh),
          redo: () => unwrap(setLeaveTypeArchived({ id: row.id, archived })).then(refresh),
        },
        message,
      )
      void refresh()
    })
  }

  const remove = (row: LeaveTypeAdminDTO) => {
    if (row.usageCount === 0) {
      // The row goes away: next row's delete button, else the previous one, else the add field (list becomes empty).
      const i = list.findIndex((r) => r.id === row.id)
      const neighbour = list[i + 1] ?? list[i - 1]
      if (neighbour) focusButton('delete', neighbour.id)
      else addInput.current?.focus()
    }
    startTransition(async () => {
      // In use → the server archives instead (M5-D10); predict that so the row does not flicker away.
      apply(
        row.usageCount > 0
          ? { kind: 'patch', id: row.id, patch: { archived: true } }
          : { kind: 'delete', id: row.id },
      )
      const r = await deleteLeaveType({ id: row.id })
      if (!r.ok) {
        toast.error(r.message) // e.g. lastActive
        return
      }
      if (r.outcome === 'deleted') {
        const deleted = r.deleted
        const message = th.leaveTypes.deleted(deleted.name)
        pushUndo(
          {
            label: message,
            undo: () => unwrap(restoreLeaveType(deleted)).then(refresh),
            redo: () => unwrap(deleteLeaveType({ id: deleted.id })).then(refresh),
          },
          message,
        )
      } else {
        const message = th.leaveTypes.archivedInstead(row.name)
        pushUndo(
          {
            label: message,
            undo: () => unwrap(setLeaveTypeArchived({ id: row.id, archived: false })).then(refresh),
            redo: () => unwrap(setLeaveTypeArchived({ id: row.id, archived: true })).then(refresh),
          },
          message,
        )
      }
      void refresh()
    })
  }

  const move = (row: LeaveTypeAdminDTO, direction: 'up' | 'down') => {
    movedRow.current = { id: row.id, direction }
    startTransition(async () => {
      apply({ kind: 'move', id: row.id, direction })
      const r = await moveLeaveType({ id: row.id, direction })
      if (!r.ok) toast.error(r.message)
      else void refresh()
    })
  }

  const saveRename = () => {
    if (!editing) return
    const row = list.find((r) => r.id === editing.id)
    const name = editing.value.trim()
    if (!row || name === row.name) {
      closeRename(editing.id)
      return
    }
    const parsed = updateLeaveTypeSchema.safeParse({ id: row.id, name })
    if (!parsed.success) {
      setEditing({ ...editing, errors: parsed.error.issues.map((i) => i.message) })
      return
    }
    closeRename(row.id)
    patch(row, { name })
  }
  const onRenameKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveRename()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      if (editing) closeRename(editing.id)
    }
  }

  const onAdd = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (adding) return
    const input = { name: newName, color }
    const parsed = createLeaveTypeSchema.safeParse(input)
    if (!parsed.success) {
      setAddErrors(zodFieldErrors(parsed.error))
      return
    }
    startAdding(async () => {
      const r = await createLeaveType(input)
      if (!r.ok) {
        const errors = nameErrors(r)
        if (errors) setAddErrors({ name: errors })
        else toast.error(r.message)
        return
      }
      setNewName('')
      setNewColor(null)
      setAddErrors({})
      void refresh()
    })
  }

  const menuRow = colorMenu ? list.find((r) => r.id === colorMenu.id) : undefined

  return (
    <Stack spacing={2}>
      {list.length === 0 ? (
        <EmptyState title={th.leaveTypes.title} />
      ) : (
        <Box data-light-form="" sx={{ borderBlock: '1px solid var(--border-subtle)' }}>
          <List ref={listEl} aria-label={th.leaveTypes.title} disablePadding>
            {list.map((row, i) => {
              const isEditing = editing?.id === row.id
              return (
                <ListItem
                  key={row.id}
                  divider={i < list.length - 1}
                  data-leave-type-id={row.id}
                  data-archived={row.archived || undefined}
                  sx={{ gap: 1, flexWrap: 'wrap' }}
                >
                  <Tooltip title={th.leaveTypes.color}>
                    <IconButton
                      aria-label={`${th.leaveTypes.color} ${row.name}: ${th.leaveTypes.swatch(row.color)}`}
                      aria-haspopup="menu"
                      onClick={(e: MouseEvent<HTMLElement>) =>
                        setColorMenu({ id: row.id, anchor: e.currentTarget })
                      }
                    >
                      <Swatch color={row.color} />
                    </IconButton>
                  </Tooltip>
                  <Box sx={{ flex: 1, minWidth: 160 }}>
                    {isEditing ? (
                      <TextField
                        autoFocus
                        fullWidth
                        size="small"
                        value={editing.value}
                        onChange={(e) => setEditing({ ...editing, value: e.target.value, errors: [] })}
                        onKeyDown={onRenameKey}
                        onFocus={(e) => e.target.select()}
                        error={editing.errors.length > 0}
                        helperText={helperText(editing.errors)}
                        slotProps={{ htmlInput: { 'aria-label': th.leaveTypes.name, maxLength: 60 } }}
                      />
                    ) : (
                      <Tooltip title={th.common.edit} describeChild>
                        <ButtonBase
                          ref={buttonRef('name', row.id)}
                          onClick={() => setEditing({ id: row.id, value: row.name, errors: [] })}
                          sx={{
                            font: 'inherit',
                            px: 0.5,
                            borderRadius: 'var(--radius-sm)',
                            maxWidth: '100%',
                            justifyContent: 'flex-start',
                            textAlign: 'start',
                            color: row.archived ? 'text.secondary' : 'text.primary',
                            '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
                          }}
                        >
                          {row.name}
                        </ButtonBase>
                      </Tooltip>
                    )}
                  </Box>
                  {row.archived ? <Chip size="small" label={th.leaveTypes.archivedChip} /> : null}
                  <Chip size="small" variant="outlined" label={th.leaveTypes.usage(row.usageCount)} />
                  <Tooltip title={th.common.moveUp}>
                    <span>
                      <IconButton
                        ref={buttonRef('up', row.id)}
                        aria-label={th.common.moveUp}
                        disabled={i === 0}
                        onClick={() => move(row, 'up')}
                      >
                        <ArrowUpward fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title={th.common.moveDown}>
                    <span>
                      <IconButton
                        ref={buttonRef('down', row.id)}
                        aria-label={th.common.moveDown}
                        disabled={i === list.length - 1}
                        onClick={() => move(row, 'down')}
                      >
                        <ArrowDownward fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Button size="small" onClick={() => setArchived(row, !row.archived)}>
                    {row.archived ? th.leaveTypes.unarchive : th.leaveTypes.archive}
                  </Button>
                  <Tooltip title={th.leaveTypes.delete}>
                    <IconButton
                      ref={buttonRef('delete', row.id)}
                      aria-label={th.leaveTypes.delete}
                      onClick={() => remove(row)}
                    >
                      <DeleteOutlined fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </ListItem>
              )
            })}
          </List>
        </Box>
      )}

      <Menu
        anchorEl={colorMenu?.anchor ?? null}
        open={colorMenu !== null}
        onClose={() => setColorMenu(null)}
        slotProps={{ list: { 'aria-label': th.leaveTypes.color, dense: true } }}
      >
        {PROJECT_COLORS.map((c) => {
          const checked = menuRow?.color.toUpperCase() === c
          return (
            <MenuItem
              key={c}
              role="menuitemradio"
              aria-checked={checked}
              aria-label={th.leaveTypes.swatch(c)}
              onClick={() => {
                setColorMenu(null)
                if (menuRow && !checked) patch(menuRow, { color: c })
              }}
            >
              <ListItemIcon>
                <Swatch color={c} />
              </ListItemIcon>
              <ListItemText>{c}</ListItemText>
              {checked ? <Check fontSize="small" sx={{ ml: 1 }} /> : null}
            </MenuItem>
          )
        })}
      </Menu>

      <Box sx={{ pt: 1 }}>
        <Stack component="form" spacing={1.5} noValidate onSubmit={onAdd} aria-label={th.leaveTypes.add}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
            <TextField
              fullWidth
              size="small"
              label={th.leaveTypes.name}
              placeholder={th.leaveTypes.namePlaceholder}
              inputRef={addInput}
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value)
                if (addErrors.name) setAddErrors({})
              }}
              error={Boolean(addErrors.name?.length)}
              helperText={helperText(addErrors.name)}
              slotProps={{ htmlInput: { maxLength: 60 } }}
            />
            <Button
              type="submit"
              variant="contained"
              startIcon={<Add />}
              disabled={adding}
              sx={{ flex: 'none' }}
            >
              {th.leaveTypes.add}
            </Button>
          </Stack>
          <ColorSwatchPicker label={th.leaveTypes.color} value={color} onChange={(c) => setNewColor(c)} />
        </Stack>
      </Box>
    </Stack>
  )
}
