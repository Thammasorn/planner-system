'use client'
import {
  useLayoutEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
  type SubmitEvent,
} from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import Add from '@mui/icons-material/Add'
import DeleteOutlined from '@mui/icons-material/DeleteOutlined'
import EditOutlined from '@mui/icons-material/EditOutlined'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { DateField } from '@/components/common/DateField'
import { EmptyState } from '@/components/common/EmptyState'
import { helperText, zodFieldErrors, type FieldErrors } from '@/components/forms/field-errors'
import { useUndo } from '@/components/undo/useUndo'
import { isoWeekday } from '@/domain/dates'
import type { ISODate } from '@/domain/types'
import { th } from '@/i18n/th'
import { unwrap, type ActionError } from '@/lib/action-result'
import type { HolidayDTO } from '@/lib/contracts/holidays'
import { formatThaiDate } from '@/lib/format'
import { invalidateCalendar, invalidateLoad } from '@/lib/invalidate'
import { createHolidaySchema, updateHolidaySchema } from '@/lib/schemas/holidays'
import { createHoliday, deleteHoliday, restoreHoliday, updateHoliday } from '@/server/actions/holidays'
import { HolidayImportDialog } from './HolidayImportDialog'

type Op = { kind: 'delete'; id: string } | { kind: 'update'; row: HolidayDTO }

/** Optimistic view of one pending operation; the action's refresh() replaces it when it settles. */
function applyOp(rows: HolidayDTO[], op: Op): HolidayDTO[] {
  return op.kind === 'delete'
    ? rows.filter((r) => r.id !== op.id)
    : rows.map((r) => (r.id === op.row.id ? op.row : r))
}

const yearOf = (d: ISODate) => Number(d.slice(0, 4))
const weekdayOf = (d: ISODate) => th.calendar.weekdaysLong[isoWeekday(d) - 1]

/** A taken date comes back as CONFLICT (holidays_date_unique) — show it under the date field. */
function serverErrors(r: ActionError): FieldErrors | null {
  if (r.fieldErrors && Object.keys(r.fieldErrors).length > 0) return r.fieldErrors
  if (r.code === 'CONFLICT') return { date: [r.message] }
  return null
}

interface Draft {
  date: ISODate | null
  name: string
  errors: FieldErrors
}

/**
 * /settings/holidays (FR-901, M5-D11): holidays of one year (Buddhist-era labels), add / inline edit, delete with an
 * 8 s undo toast + Cmd/Ctrl+Z that re-inserts the same row (hard delete, X64 — no confirm dialog), CSV import.
 * Every write refreshes the calendar and load views (capacity changes with holidays).
 */
export function HolidaysTable({ rows, initialYear }: { rows: HolidayDTO[]; initialYear: number }) {
  const qc = useQueryClient()
  const undo = useUndo()
  const [list, apply] = useOptimistic(rows, applyOp)
  const [, startTransition] = useTransition()
  const [adding, startAdding] = useTransition()
  const [year, setYear] = useState(initialYear)
  const [editing, setEditing] = useState<(Draft & { id: string }) | null>(null)
  const [draft, setDraft] = useState<Draft>({ date: null, name: '', errors: {} })

  const years = useMemo(
    () => [...new Set([...list.map((r) => yearOf(r.date)), initialYear, year])].sort((a, b) => a - b),
    [list, initialYear, year],
  )
  const shown = useMemo(
    () => list.filter((r) => yearOf(r.date) === year).sort((a, b) => (a.date < b.date ? -1 : 1)),
    [list, year],
  )
  // Focus targets (SPEC §8.9 keyboard-only use, the PositionsList pattern): a deleted row takes its focused delete
  // button with it and closing the inline edit unmounts the focused field — focus moves to a stable neighbour.
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const addDate = useRef<HTMLDivElement>(null)
  /** The row's edit button only mounts once the inline edit closes: focus it after that render. */
  const focusEditOf = useRef<string | null>(null)
  const buttonRef = (kind: 'edit' | 'delete', id: string) => (el: HTMLButtonElement | null) => {
    const key = `${kind}:${id}`
    if (!el) return
    buttons.current.set(key, el)
    return () => {
      if (buttons.current.get(key) === el) buttons.current.delete(key)
    }
  }
  // MUI X renders the date as sections; the first one is the field's tab stop (the native input is aria-hidden).
  const focusAddDate = () =>
    addDate.current
      ?.querySelector<HTMLElement>('[tabindex]:not([tabindex="-1"]), input:not([aria-hidden="true"])')
      ?.focus()

  useLayoutEffect(() => {
    const id = focusEditOf.current
    if (id === null || editing !== null) return
    focusEditOf.current = null
    const target = buttons.current.get(`edit:${id}`)
    if (target) target.focus()
    else focusAddDate() // the edited date moved the row to another year
  })

  const closeEdit = (id: string) => {
    focusEditOf.current = id
    setEditing(null)
  }

  const refreshViews = () => Promise.all([invalidateCalendar(qc), invalidateLoad(qc)]).then(() => {})

  const remove = (row: HolidayDTO) => {
    // Next row's delete button, else the previous one, else the add form's date field (the year becomes empty).
    const i = shown.findIndex((r) => r.id === row.id)
    const neighbour = shown[i + 1] ?? shown[i - 1]
    const next = neighbour ? buttons.current.get(`delete:${neighbour.id}`) : undefined
    if (next) next.focus()
    else focusAddDate()
    startTransition(async () => {
      apply({ kind: 'delete', id: row.id })
      const r = await deleteHoliday({ id: row.id })
      if (!r.ok) {
        toast.error(r.message)
        return
      }
      const deleted = r.deleted
      const message = th.holidays.deleted(deleted.name, formatThaiDate(deleted.date))
      undo.push(
        {
          label: message,
          undo: () => unwrap(restoreHoliday(deleted)).then(refreshViews),
          redo: () => unwrap(deleteHoliday({ id: deleted.id })).then(refreshViews),
        },
        { toast: message },
      )
      void refreshViews()
    })
  }

  const saveEdit = () => {
    if (!editing) return
    const input = { id: editing.id, date: editing.date ?? '', name: editing.name }
    const parsed = updateHolidaySchema.safeParse(input)
    if (!parsed.success) {
      setEditing({ ...editing, errors: zodFieldErrors(parsed.error) })
      return
    }
    const current = editing
    closeEdit(current.id)
    startTransition(async () => {
      apply({ kind: 'update', row: { id: current.id, date: parsed.data.date, name: parsed.data.name } })
      const r = await updateHoliday(input)
      if (!r.ok) {
        const errors = serverErrors(r)
        if (errors) setEditing({ ...current, errors })
        else toast.error(r.message)
        return
      }
      void refreshViews()
    })
  }

  // Key events bubble here through the date picker's portal too: Enter that a child control already handled (a day in
  // the calendar popup calls preventDefault) or that belongs to a button (open-picker, clear) is not a save — saving
  // then would close the row with the date from before the pick. Same guard as LeaveDialog's onFormKeyDown.
  const onEditKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') {
      if (e.defaultPrevented || e.nativeEvent.isComposing) return
      const t = e.target
      if (!(t instanceof Element) || t.closest('button, [role="dialog"], [role="grid"]')) return
      e.preventDefault()
      saveEdit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      if (editing) closeEdit(editing.id)
    }
  }

  const onAdd = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (adding) return
    const input = { date: draft.date ?? '', name: draft.name }
    const parsed = createHolidaySchema.safeParse(input)
    if (!parsed.success) {
      setDraft({ ...draft, errors: zodFieldErrors(parsed.error) })
      return
    }
    startAdding(async () => {
      const r = await createHoliday(input)
      if (!r.ok) {
        const errors = serverErrors(r)
        if (errors) setDraft((d) => ({ ...d, errors }))
        else toast.error(r.message)
        return
      }
      toast.success(th.holidays.created(r.holiday.name))
      setDraft({ date: null, name: '', errors: {} })
      setYear(yearOf(r.holiday.date)) // show the year the new holiday belongs to
      void refreshViews()
    })
  }

  return (
    <Stack spacing={2} sx={{ maxWidth: 880 }}>
      <Stack direction="row" spacing={2} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="h6" component="h2">
          {th.holidays.title}
        </Typography>
        <TextField
          select
          size="small"
          label={th.holidays.year}
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          sx={{ minWidth: 120 }}
        >
          {years.map((y) => (
            <MenuItem key={y} value={y}>
              {y + 543}
            </MenuItem>
          ))}
        </TextField>
        <Box sx={{ flex: 1 }} />
        <HolidayImportDialog existing={list} />
      </Stack>

      {shown.length === 0 ? (
        <EmptyState title={th.holidays.empty} />
      ) : (
        <Paper variant="outlined">
          <Table size="small" aria-label={th.holidays.title}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 220 }}>{th.holidays.date}</TableCell>
                <TableCell>{th.holidays.name}</TableCell>
                <TableCell align="right" sx={{ width: 120 }}>
                  {th.common.actions}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {shown.map((row) =>
                editing?.id === row.id ? (
                  <TableRow key={row.id} data-holiday-id={row.id}>
                    <TableCell onKeyDown={onEditKey}>
                      <DateField
                        label={th.holidays.date}
                        value={editing.date}
                        onChange={(date) => setEditing({ ...editing, date, errors: {} })}
                        error={editing.errors.date?.[0]}
                      />
                    </TableCell>
                    <TableCell onKeyDown={onEditKey}>
                      <TextField
                        autoFocus
                        fullWidth
                        size="small"
                        label={th.holidays.name}
                        value={editing.name}
                        onChange={(e) => setEditing({ ...editing, name: e.target.value, errors: {} })}
                        error={Boolean(editing.errors.name?.length)}
                        helperText={helperText(editing.errors.name)}
                        slotProps={{ htmlInput: { maxLength: 200 } }}
                      />
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      <Button size="small" variant="contained" onClick={saveEdit}>
                        {th.holidays.save}
                      </Button>
                      <Button size="small" onClick={() => closeEdit(row.id)} sx={{ ml: 1 }}>
                        {th.holidays.cancel}
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow key={row.id} data-holiday-id={row.id}>
                    <TableCell>
                      {formatThaiDate(row.date)}
                      <Typography variant="caption" component="div" sx={{ color: 'text.secondary' }}>
                        {weekdayOf(row.date)}
                      </Typography>
                    </TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      <Tooltip title={th.holidays.edit}>
                        <IconButton
                          ref={buttonRef('edit', row.id)}
                          aria-label={th.holidays.edit}
                          onClick={() =>
                            setEditing({ id: row.id, date: row.date, name: row.name, errors: {} })
                          }
                        >
                          <EditOutlined fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={th.holidays.delete}>
                        <IconButton
                          ref={buttonRef('delete', row.id)}
                          aria-label={th.holidays.delete}
                          onClick={() => remove(row)}
                        >
                          <DeleteOutlined fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ),
              )}
            </TableBody>
          </Table>
        </Paper>
      )}

      <Stack
        component="form"
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        noValidate
        onSubmit={onAdd}
        aria-label={th.holidays.add}
        sx={{ alignItems: 'flex-start' }}
      >
        <Box ref={addDate} sx={{ width: { xs: '100%', sm: 200 }, flex: 'none' }}>
          <DateField
            label={th.holidays.date}
            value={draft.date}
            onChange={(date) => setDraft({ ...draft, date, errors: {} })}
            error={draft.errors.date?.[0]}
          />
        </Box>
        <TextField
          fullWidth
          size="small"
          label={th.holidays.name}
          placeholder={th.holidays.namePlaceholder}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value, errors: {} })}
          error={Boolean(draft.errors.name?.length)}
          helperText={helperText(draft.errors.name)}
          slotProps={{ htmlInput: { maxLength: 200 } }}
        />
        <Button type="submit" variant="contained" startIcon={<Add />} disabled={adding} sx={{ flex: 'none' }}>
          {th.holidays.add}
        </Button>
      </Stack>
    </Stack>
  )
}
