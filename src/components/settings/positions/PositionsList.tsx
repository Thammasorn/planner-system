'use client'
import {
  useLayoutEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type SubmitEvent,
  type KeyboardEvent,
} from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import Add from '@mui/icons-material/Add'
import ArrowDownward from '@mui/icons-material/ArrowDownward'
import ArrowUpward from '@mui/icons-material/ArrowUpward'
import DeleteOutlined from '@mui/icons-material/DeleteOutlined'
import EditOutlined from '@mui/icons-material/EditOutlined'
import { toast } from 'sonner'
import { EmptyState } from '@/components/common/EmptyState'
import { helperText } from '@/components/forms/field-errors'
import { useUndo } from '@/components/undo/useUndo'
import { th } from '@/i18n/th'
import { unwrap } from '@/lib/action-result'
import type { PositionRow } from '@/lib/contracts/users'
import { positionName } from '@/lib/schemas/positions'
import {
  createPosition,
  deletePosition,
  movePosition,
  renamePosition,
  restorePosition,
} from '@/server/actions/positions'

type ButtonKind = 'rename' | 'delete' | 'up' | 'down'

type Op =
  | { kind: 'rename'; id: string; name: string }
  | { kind: 'move'; id: string; direction: 'up' | 'down' }
  | { kind: 'delete'; id: string }

/** Optimistic view of one pending operation; the server's refresh() replaces it when the action settles. */
function applyOp(rows: PositionRow[], op: Op): PositionRow[] {
  switch (op.kind) {
    case 'rename':
      return rows.map((r) => (r.id === op.id ? { ...r, name: op.name } : r))
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

function nameErrors(name: string): string[] {
  const parsed = positionName.safeParse(name)
  return parsed.success ? [] : parsed.error.issues.map((i) => i.message)
}

/**
 * /settings/positions (FR-208, M1-D14): ordered list with inline rename (Enter saves, Esc cancels), move up/down,
 * delete with an 8 s undo toast + Cmd/Ctrl+Z (no confirm dialog — P2). A position in use cannot be deleted; the
 * server's message says how many people use it.
 */
export function PositionsList({ rows }: { rows: PositionRow[] }) {
  const [list, apply] = useOptimistic(rows, applyOp)
  const [, startTransition] = useTransition()
  const undo = useUndo()
  const [editing, setEditing] = useState<{ id: string; value: string; errors: string[] } | null>(null)
  const [newName, setNewName] = useState('')
  const [addErrors, setAddErrors] = useState<string[]>([])
  const [adding, startAdding] = useTransition()
  // Focus targets (SPEC §8.9 keyboard-only use): when the focused control disappears — the rename field closes,
  // a row is deleted, or a move button becomes disabled at the list end — focus moves to a stable neighbour
  // instead of dropping to <body>.
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const addInput = useRef<HTMLInputElement>(null)
  const listEl = useRef<HTMLUListElement>(null)
  const movedRow = useRef<{ id: string; direction: 'up' | 'down' } | null>(null)
  const buttonRef = (kind: ButtonKind, id: string) => (el: HTMLButtonElement | null) => {
    const key = `${kind}:${id}`
    if (!el) return
    buttons.current.set(key, el)
    return () => {
      if (buttons.current.get(key) === el) buttons.current.delete(key)
    }
  }
  const focusButton = (kind: ButtonKind, id: string) => buttons.current.get(`${kind}:${id}`)?.focus()

  // After a move renders, keep focus on the moved row: React restores focus across the <li> reorder, but the
  // pressed button is disabled once the row reaches the list end — then the opposite move button takes focus.
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

  const remove = (row: PositionRow) => {
    // Next row's delete button, else the previous one, else the add field (list becomes empty).
    const i = list.findIndex((r) => r.id === row.id)
    const neighbour = list[i + 1] ?? list[i - 1]
    if (neighbour) focusButton('delete', neighbour.id)
    else addInput.current?.focus()
    startTransition(async () => {
      apply({ kind: 'delete', id: row.id })
      const r = await deletePosition({ id: row.id })
      if (!r.ok) {
        toast.error(r.message) // IN_USE carries the count
        return
      }
      const deleted = r.deleted
      const message = th.positions.deleted(deleted.name)
      undo.push(
        {
          label: message,
          undo: () => unwrap(restorePosition(deleted)).then(() => {}),
          redo: () => unwrap(deletePosition({ id: deleted.id })).then(() => {}),
        },
        { toast: message },
      )
    })
  }

  const move = (row: PositionRow, direction: 'up' | 'down') => {
    movedRow.current = { id: row.id, direction }
    startTransition(async () => {
      apply({ kind: 'move', id: row.id, direction })
      const r = await movePosition({ id: row.id, direction })
      if (!r.ok) toast.error(r.message)
    })
  }

  /** Saves the inline rename; true when the field closed (false while it shows a validation error). */
  const saveRename = (): boolean => {
    if (!editing) return false
    const row = list.find((r) => r.id === editing.id)
    const name = editing.value.trim()
    if (!row || name === row.name) {
      setEditing(null)
      return true
    }
    const errors = nameErrors(name)
    if (errors.length > 0) {
      setEditing({ ...editing, errors })
      return false
    }
    const id = editing.id
    setEditing(null)
    startTransition(async () => {
      apply({ kind: 'rename', id, name })
      const r = await renamePosition({ id, name })
      if (!r.ok) {
        const fieldMsgs = r.fieldErrors?.name
        if (fieldMsgs?.length) setEditing({ id, value: name, errors: fieldMsgs })
        else toast.error(r.message)
      }
    })
    return true
  }

  const onRenameKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!editing) return
    const id = editing.id
    if (e.key === 'Enter') {
      e.preventDefault()
      if (saveRename()) focusButton('rename', id)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setEditing(null)
      focusButton('rename', id)
    }
  }

  const onAdd = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (adding) return
    const errors = nameErrors(newName)
    setAddErrors(errors)
    if (errors.length > 0) return
    startAdding(async () => {
      const r = await createPosition({ name: newName })
      if (!r.ok) {
        setAddErrors(r.fieldErrors?.name ?? [r.message])
        return
      }
      setNewName('')
      setAddErrors([])
    })
  }

  return (
    <Stack spacing={2} sx={{ maxWidth: 720 }}>
      {list.length === 0 ? (
        <EmptyState title={th.positions.empty} />
      ) : (
        <Paper variant="outlined">
          <List ref={listEl} aria-label={th.positions.title} disablePadding>
            {list.map((row, i) => {
              const isEditing = editing?.id === row.id
              return (
                <ListItem key={row.id} divider={i < list.length - 1} data-position-id={row.id} sx={{ gap: 1 }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    {isEditing ? (
                      <TextField
                        autoFocus
                        fullWidth
                        value={editing.value}
                        onChange={(e) => setEditing({ ...editing, value: e.target.value, errors: [] })}
                        onKeyDown={onRenameKey}
                        onFocus={(e) => e.target.select()}
                        error={editing.errors.length > 0}
                        helperText={helperText(editing.errors)}
                        slotProps={{ htmlInput: { 'aria-label': th.positions.rename } }}
                      />
                    ) : (
                      <Typography sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.name}
                      </Typography>
                    )}
                  </Box>
                  <Chip size="small" variant="outlined" label={th.positions.userCount(row.userCount)} />
                  <Tooltip title={th.positions.rename}>
                    <IconButton
                      ref={buttonRef('rename', row.id)}
                      aria-label={th.positions.rename}
                      onClick={() => setEditing({ id: row.id, value: row.name, errors: [] })}
                    >
                      <EditOutlined fontSize="small" />
                    </IconButton>
                  </Tooltip>
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
                  <Tooltip title={th.common.delete}>
                    <IconButton ref={buttonRef('delete', row.id)} aria-label={th.common.delete} onClick={() => remove(row)}>
                      <DeleteOutlined fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </ListItem>
              )
            })}
          </List>
        </Paper>
      )}
      <Stack component="form" direction="row" spacing={1} noValidate onSubmit={onAdd} sx={{ alignItems: 'flex-start' }}>
        <TextField
          fullWidth
          placeholder={th.positions.namePlaceholder}
          inputRef={addInput}
          value={newName}
          onChange={(e) => {
            setNewName(e.target.value)
            if (addErrors.length) setAddErrors([])
          }}
          error={addErrors.length > 0}
          helperText={helperText(addErrors)}
          slotProps={{ htmlInput: { 'aria-label': th.positions.namePlaceholder, maxLength: 100 } }}
        />
        <Button type="submit" variant="contained" startIcon={<Add />} disabled={adding} sx={{ flex: 'none', mt: '2px' }}>
          {th.positions.add}
        </Button>
      </Stack>
    </Stack>
  )
}
