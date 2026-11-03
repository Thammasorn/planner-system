'use client'
// src/components/database/toolbar/FilterMenu.tsx — the view's filters (FR-1427, BR-95, M11-D23): up to 10 conditions
// joined by "และ" only, operators per column type (domain filterOpsFor), a value editor per operator kind (text /
// number, option or person ids incl. "ฉัน", a date or "วันนี้"), incomplete conditions shown dimmed (skipped by the
// domain), "ล้างตัวกรอง". Shared view settings: every change is one updateDatabaseView.
import Close from '@mui/icons-material/Close'
import Autocomplete from '@mui/material/Autocomplete'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Popover from '@mui/material/Popover'
import TextField from '@mui/material/TextField'
import { type JSX, useState } from 'react'
import {
  DB_LIMITS,
  filterOpsFor,
  isFilterComplete,
  ME_TOKEN,
  optionsOf,
  parseDateInput,
} from '@/domain/database'
import type { FilterOp, ViewFilter } from '@/domain/types'
import { usePeopleOptions } from '@/hooks/usePeopleOptions'
import { th } from '@/i18n/th'
import type { DbColumnDTO } from '@/lib/contracts/databases'
import { displayName } from '@/lib/display-name'
import { FILTER_VALUE_KIND } from '@/lib/schemas/databases'
import { maxISO, minISO } from '@/domain/dates'
import { dateEditText } from '../cells/CellEditor'
import { useDbApi } from '../data/contract'
import s from '../menus/menus.module.css'
import type { ToolbarMenuProps } from './SortMenu'

const keepKeys = (e: { key: string; stopPropagation: () => void }) => {
  if (e.key !== 'Escape') e.stopPropagation()
}

/** A new, incomplete filter on `col` (first operator of its type). */
export function newFilter(col: Pick<DbColumnDTO, 'id' | 'type'>): ViewFilter {
  return { columnId: col.id, op: filterOpsFor(col.type)[0]! }
}

export function FilterMenu(p: ToolbarMenuProps): JSX.Element {
  const api = useDbApi()
  const cols = api.db.columns
  const byId = new Map(cols.map((c) => [c.id, c]))
  const all = p.view.config.filters ?? []
  // filters on deleted columns stay stored (they return with the column, FR-1415) but are not shown
  const shown = all.map((f, i) => ({ f, i, col: byId.get(f.columnId) })).filter((x) => x.col !== undefined)
  const t = th.database.filters
  const save = (next: ViewFilter[]) =>
    api.updateView(p.view.id, { config: { ...p.view.config, filters: next } })
  const replace = (i: number, f: ViewFilter) => save(all.map((x, j) => (j === i ? f : x)))
  return (
    <Popover
      open={p.anchorEl !== null}
      anchorEl={p.anchorEl}
      onClose={p.onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      slotProps={{ paper: { role: 'dialog', 'aria-label': th.database.toolbar.filter(shown.length) } }}
    >
      <div className={`${s.panel} ${s.wide}`} data-testid="db-filter-menu">
        {shown.map(({ f, i, col }) => {
          const complete = isFilterComplete(f, col!)
          return (
            <div
              key={`${i}-${f.columnId}`}
              className={`${s.section}${complete ? '' : ` ${s.incomplete}`}`}
              data-testid="db-filter-row"
              data-incomplete={complete ? undefined : 'true'}
            >
              <div className={s.row}>
                <TextField
                  select
                  size="small"
                  className={s.grow}
                  value={f.columnId}
                  slotProps={{ htmlInput: { 'aria-label': t.column } }}
                  onChange={(e) => {
                    const c = byId.get(e.target.value)
                    if (c) replace(i, newFilter(c))
                  }}
                >
                  {cols.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  size="small"
                  className={s.grow}
                  value={f.op}
                  slotProps={{ htmlInput: { 'aria-label': t.op } }}
                  onChange={(e) => {
                    const op = e.target.value as FilterOp
                    const keep = FILTER_VALUE_KIND[op] === FILTER_VALUE_KIND[f.op] && f.value !== undefined
                    replace(i, keep ? { ...f, op } : { columnId: f.columnId, op })
                  }}
                >
                  {filterOpsFor(col!.type).map((op) => (
                    <MenuItem key={op} value={op}>
                      {t.ops[op]}
                    </MenuItem>
                  ))}
                </TextField>
                <IconButton
                  size="small"
                  aria-label={t.remove}
                  onClick={() => save(all.filter((_, j) => j !== i))}
                >
                  <Close fontSize="small" />
                </IconButton>
              </div>
              <FilterValue filter={f} column={col!} onChange={(f2) => replace(i, f2)} />
              {complete ? null : <span className={s.hint}>{t.incomplete}</span>}
            </div>
          )
        })}
        <div className={s.row}>
          <Button
            size="small"
            disabled={all.length >= DB_LIMITS.filters}
            onClick={() => save([...all, newFilter(cols[0]!)])}
          >
            {all.length >= DB_LIMITS.filters ? th.database.errors.limit.filters(DB_LIMITS.filters) : t.add}
          </Button>
          {shown.length > 0 ? (
            <Button size="small" color="inherit" onClick={() => save([])}>
              {th.database.toolbar.clearFilters}
            </Button>
          ) : null}
        </div>
      </div>
    </Popover>
  )
}

function FilterValue(p: {
  filter: ViewFilter
  column: DbColumnDTO
  onChange: (f: ViewFilter) => void
}): JSX.Element | null {
  const kind = FILTER_VALUE_KIND[p.filter.op]
  if (kind === 'none') return null
  if (kind === 'string') return <StringValue {...p} />
  if (kind === 'date') return <DateValue {...p} />
  if (kind === 'dateRange') return <DateRangeValue {...p} />
  return <IdsValue {...p} />
}

function StringValue(p: { filter: ViewFilter; onChange: (f: ViewFilter) => void }): JSX.Element {
  const stored = typeof p.filter.value === 'string' ? p.filter.value : ''
  const [draft, setDraft] = useState(stored)
  const commit = () => {
    if (draft !== stored) p.onChange({ ...p.filter, value: draft === '' ? undefined : draft })
  }
  return (
    <TextField
      size="small"
      value={draft}
      placeholder={th.database.filters.value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        keepKeys(e)
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) commit()
      }}
      slotProps={{ htmlInput: { 'aria-label': th.database.filters.value, maxLength: DB_LIMITS.text } }}
    />
  )
}

function stripValue(f: ViewFilter): ViewFilter {
  return { columnId: f.columnId, op: f.op }
}

function DateValue(p: { filter: ViewFilter; onChange: (f: ViewFilter) => void }): JSX.Element {
  const today = useDbApi().today
  const raw = typeof p.filter.value === 'object' && !Array.isArray(p.filter.value) ? p.filter.value : null
  const ref = raw?.kind === 'range' ? null : raw
  const [draft, setDraft] = useState(ref?.kind === 'date' ? dateEditText(ref.date) : '')
  const [error, setError] = useState(false)
  const commit = () => {
    const r = parseDateInput(draft, today)
    if (r === 'invalid') return setError(true)
    setError(false)
    p.onChange(r === null ? stripValue(p.filter) : { ...p.filter, value: { kind: 'date', date: r } })
  }
  return (
    <div className={s.row}>
      <TextField
        select
        size="small"
        value={ref?.kind ?? 'date'}
        slotProps={{ htmlInput: { 'aria-label': th.database.filters.value } }}
        onChange={(e) =>
          p.onChange(
            e.target.value === 'today' ? { ...p.filter, value: { kind: 'today' } } : stripValue(p.filter),
          )
        }
      >
        <MenuItem value="today">{th.database.filters.today}</MenuItem>
        <MenuItem value="date">{th.database.filters.specificDate}</MenuItem>
      </TextField>
      {ref?.kind === 'today' ? null : (
        <TextField
          size="small"
          className={s.grow}
          value={draft}
          error={error}
          helperText={error ? th.database.cells.invalidDate : undefined}
          placeholder={dateEditText(today)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            keepKeys(e)
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) commit()
          }}
          slotProps={{ htmlInput: { 'aria-label': th.database.filters.specificDate } }}
        />
      )}
    </div>
  )
}

/** BR-95 (v3.7) "อยู่ในช่วง": two typed dates (either order); both filled → `{ kind: 'range', start, end }`. */
function DateRangeValue(p: { filter: ViewFilter; onChange: (f: ViewFilter) => void }): JSX.Element {
  const today = useDbApi().today
  const v = p.filter.value
  const ref = typeof v === 'object' && !Array.isArray(v) && v.kind === 'range' ? v : null
  const [start, setStart] = useState(ref ? dateEditText(ref.start) : '')
  const [end, setEnd] = useState(ref ? dateEditText(ref.end) : '')
  const [error, setError] = useState(false)
  const commit = () => {
    const a = parseDateInput(start, today)
    const b = parseDateInput(end, today)
    if (a === 'invalid' || b === 'invalid') return setError(true)
    setError(false)
    p.onChange(
      a === null || b === null
        ? stripValue(p.filter)
        : { ...p.filter, value: { kind: 'range', start: minISO(a, b), end: maxISO(a, b) } },
    )
  }
  const field = (value: string, set: (s: string) => void, label: string) => (
    <TextField
      size="small"
      className={s.grow}
      value={value}
      error={error}
      placeholder={dateEditText(today)}
      onChange={(e) => set(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        keepKeys(e)
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) commit()
      }}
      slotProps={{ htmlInput: { 'aria-label': label } }}
    />
  )
  return (
    <div className={s.row}>
      {field(start, setStart, th.database.filters.rangeStart)}
      {field(end, setEnd, th.database.filters.rangeEnd)}
      {error ? (
        <span className={s.hint} role="alert">
          {th.database.cells.invalidDate}
        </span>
      ) : null}
    </div>
  )
}

function IdsValue(p: {
  filter: ViewFilter
  column: DbColumnDTO
  onChange: (f: ViewFilter) => void
}): JSX.Element {
  const person = p.column.type === 'PERSON'
  const people = usePeopleOptions({ enabled: person }).data
  const value = Array.isArray(p.filter.value) ? p.filter.value : []
  const options = person
    ? [ME_TOKEN, ...(people ?? []).filter((x) => x.active || value.includes(x.id)).map((x) => x.id)]
    : optionsOf(p.column).map((o) => o.id)
  const label = (id: string): string => {
    if (id === ME_TOKEN) return th.database.filters.me
    if (person) {
      const x = people?.find((y) => y.id === id)
      return x ? displayName(x) : th.database.cells.unknownPerson
    }
    return optionsOf(p.column).find((o) => o.id === id)?.name ?? id
  }
  return (
    <Autocomplete<string, true, false, false>
      multiple
      size="small"
      options={options}
      value={value.filter((id) => options.includes(id))}
      getOptionLabel={label}
      onChange={(_e, v) => p.onChange(v.length === 0 ? stripValue(p.filter) : { ...p.filter, value: v })}
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder={th.database.filters.value}
          onKeyDown={keepKeys}
          slotProps={{
            ...params.slotProps,
            htmlInput: { ...params.slotProps.htmlInput, 'aria-label': th.database.filters.value },
          }}
        />
      )}
    />
  )
}
