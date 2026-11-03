'use client'
// src/components/database/cells/CellEditor.tsx — the edit mode of one cell for every column type (FR-1410, FR-1421,
// BR-90…92, M11-D33/D36): text (TEXT: Shift+Enter = new line), number (parseNumberInput, the stored value is the
// exact canonical string), URL (http/https/mailto only), date (typed via parseDateInput incl. พ.ศ., or the calendar),
// SELECT / MULTI_SELECT Autocomplete with "สร้าง "…"" (→ addOption), PERSON Autocomplete over active people only.
// Enter / Tab / Shift+Tab confirm, Esc cancels, clicking elsewhere confirms (invalid input is dropped then). Keys are
// matched on e.code (X49) and ignored while an IME composes. CHECKBOX has no editor (toggled in place).
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined'
import Check from '@mui/icons-material/Check'
import Close from '@mui/icons-material/Close'
import Autocomplete from '@mui/material/Autocomplete'
import IconButton from '@mui/material/IconButton'
import Popover from '@mui/material/Popover'
import TextField from '@mui/material/TextField'
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar'
import { type JSX, type KeyboardEvent, useId, useMemo, useRef, useState } from 'react'
import { dayjsToIso, isoToDayjs } from '@/components/common/DateField'
import {
  DB_LIMITS,
  isDbUrl,
  optionKey,
  optionsOf,
  parseDateInput,
  parseNumberInput,
  rowValue,
} from '@/domain/database'
import type { ISODate } from '@/domain/types'
import { usePeopleOptions } from '@/hooks/usePeopleOptions'
import { th } from '@/i18n/th'
import type { CellValue, DbColumnDTO, DbRowDTO } from '@/lib/contracts/databases'
import { resolveDbId, sameDbId } from '@/lib/database/optimistic'
import { displayName } from '@/lib/display-name'
import { OptionChip } from './Chips'
import s from './cells.module.css'
import type { PersonLookup } from './people'

export type EditorDone = 'enter' | 'tab' | 'shiftTab' | 'escape' | 'blur' | 'picked'

export interface CellEditorProps {
  column: Pick<DbColumnDTO, 'id' | 'type' | 'config' | 'name'>
  row: Pick<DbRowDTO, 'title' | 'cells'>
  /** Type-to-replace: the first key typed on a selected cell (FR-1421). */
  initialText?: string
  /** The new value (TITLE: a string, '' allowed); only called when it differs from the stored one. */
  onCommit: (v: CellValue | null) => void
  onDone: (reason: EditorDone) => void
  /** SELECT / MULTI_SELECT: create an option by typing (resolves to its id). Absent → no "สร้าง" item. */
  createOption?: (name: string) => Promise<string>
  people: PersonLookup
  today: ISODate
  /** Accessible name (the column name). */
  label: string
}

const isEnter = (e: KeyboardEvent): boolean =>
  e.code === 'Enter' || e.code === 'NumpadEnter' || e.key === 'Enter'
const isTab = (e: KeyboardEvent): boolean => e.code === 'Tab' || e.key === 'Tab'
const isEsc = (e: KeyboardEvent): boolean => e.code === 'Escape' || e.key === 'Escape'

/** D/M/BBBB (พ.ศ.) of an ISO date — what a typed date edit starts from (BR-92). */
export function dateEditText(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  return `${d}/${m}/${y + 543}`
}

const sameValue = (a: CellValue | null, b: CellValue | null): boolean =>
  Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((x, i) => x === b[i]) : a === b

export function CellEditor(p: CellEditorProps): JSX.Element {
  const current = p.column.type === 'TITLE' ? p.row.title : rowValue(p.row, p.column)
  const commit = (v: CellValue | null) => {
    if (p.column.type === 'TITLE') {
      const next = typeof v === 'string' ? v : ''
      if (next !== p.row.title) p.onCommit(next)
      return
    }
    if (!sameValue(v, current)) p.onCommit(v)
  }
  switch (p.column.type) {
    case 'SELECT':
    case 'MULTI_SELECT':
      return <OptionsEditor {...p} commit={commit} current={current} />
    case 'PERSON':
      return <PersonEditor {...p} commit={commit} current={current} />
    case 'CHECKBOX':
      return <></>
    default:
      return <TextEditor {...p} commit={commit} current={current} />
  }
}

type Inner = CellEditorProps & { commit: (v: CellValue | null) => void; current: CellValue | null }

type Parsed = { ok: true; value: CellValue | null } | { ok: false; error: string }

function parseText(type: DbColumnDTO['type'], text: string, today: ISODate): Parsed {
  switch (type) {
    case 'TITLE':
      return { ok: true, value: text.trim() }
    case 'TEXT':
      return { ok: true, value: text.trim() === '' ? null : text }
    case 'NUMBER': {
      const r = parseNumberInput(text)
      return r.ok ? { ok: true, value: r.value } : { ok: false, error: th.database.cells.invalidNumber }
    }
    case 'URL': {
      const t = text.trim()
      if (t === '') return { ok: true, value: null }
      return isDbUrl(t) ? { ok: true, value: t } : { ok: false, error: th.database.cells.invalidUrl }
    }
    case 'DATE': {
      const r = parseDateInput(text, today)
      return r === 'invalid' ? { ok: false, error: th.database.cells.invalidDate } : { ok: true, value: r }
    }
    default:
      return { ok: true, value: null }
  }
}

function TextEditor(p: Inner): JSX.Element {
  const { type } = p.column
  const start =
    p.initialText ??
    (p.current === null ? '' : type === 'DATE' ? dateEditText(p.current as string) : (p.current as string))
  const [draft, setDraft] = useState(start)
  const [error, setError] = useState<string | null>(null)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const settled = useRef(false)

  const finish = (reason: EditorDone, text = draft) => {
    if (settled.current) return
    if (reason === 'escape') {
      settled.current = true
      p.onDone('escape')
      return
    }
    const r = parseText(type, text, p.today)
    if (!r.ok) {
      if (reason === 'blur') {
        settled.current = true
        p.onDone('escape') // invalid input is dropped when focus leaves
        return
      }
      setError(r.error)
      return
    }
    settled.current = true
    p.commit(r.value)
    p.onDone(reason)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return
    if (isEsc(e)) {
      e.preventDefault()
      e.stopPropagation()
      finish('escape')
    } else if (isEnter(e) && !(type === 'TEXT' && e.shiftKey)) {
      e.preventDefault()
      e.stopPropagation()
      finish('enter')
    } else if (isTab(e)) {
      e.preventDefault()
      e.stopPropagation()
      finish(e.shiftKey ? 'shiftTab' : 'tab')
    }
  }
  const common = {
    className: `${s.input}${type === 'TEXT' ? ` ${s.textarea}` : ''}`,
    value: draft,
    autoFocus: true,
    'aria-label': p.label,
    'aria-invalid': error !== null,
    maxLength: type === 'TITLE' ? DB_LIMITS.rowTitle : DB_LIMITS.text,
    onChange: (e: { target: { value: string } }) => {
      setDraft(e.target.value)
      setError(null)
    },
    onKeyDown,
    onBlur: (e: { relatedTarget: EventTarget | null }) => {
      if (anchor !== null) return
      if (e.relatedTarget instanceof Node && wrapRef.current?.contains(e.relatedTarget)) return
      finish('blur')
    },
    onFocus: (e: { target: HTMLInputElement | HTMLTextAreaElement }) => {
      // type-to-replace keeps the caret after the typed key; a plain edit selects nothing
      const n = e.target.value.length
      e.target.setSelectionRange(n, n)
    },
  }
  return (
    <div ref={wrapRef} className={s.editor} data-testid="db-cell-editor">
      <div className={s.editorRow}>
        {type === 'TEXT' ? (
          <textarea {...common} rows={3} />
        ) : (
          <input
            {...common}
            type="text"
            inputMode={type === 'NUMBER' ? 'decimal' : type === 'URL' ? 'url' : undefined}
          />
        )}
        {type === 'DATE' ? (
          <IconButton
            size="small"
            aria-label={th.database.cells.pickDate}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => setAnchor(e.currentTarget)}
          >
            <CalendarMonthOutlined fontSize="small" />
          </IconButton>
        ) : null}
      </div>
      {error !== null ? (
        <span className={s.error} role="alert">
          {error}
        </span>
      ) : null}
      {type === 'DATE' ? (
        <Popover
          open={anchor !== null}
          anchorEl={anchor}
          onClose={() => setAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        >
          <DateCalendar
            value={(() => {
              const r = parseDateInput(draft, p.today)
              return isoToDayjs(r === 'invalid' || r === null ? null : r)
            })()}
            onChange={(d) => {
              const iso = dayjsToIso(d)
              setAnchor(null)
              if (iso) finish('picked', iso)
            }}
          />
        </Popover>
      ) : null}
    </div>
  )
}

/** Draft placeholder while a create has not answered yet (never committed: addOption answers synchronously). */
const PENDING = '\u0000pending'

/** Plain keys handled by the picker never reach the grid / panel (Esc closes only the picker); Mod+K etc. pass. */
function stopKeys(e: KeyboardEvent): void {
  if (!e.metaKey && !e.ctrlKey) e.stopPropagation()
}

/**
 * SELECT / MULTI_SELECT editor (owner request 2026-11-03, Notion / AFFiNE-like): the picked chips on top, a full-width
 * search input, the options below. Typing filters; Enter picks the highlighted item — "สร้าง “…”" is first and
 * highlighted when no option has that name (BR-90: an existing name, any case, is picked instead of created) — then
 * MULTI clears the input and stays for the next name (type, Enter, type, Enter…) while SELECT closes; ↑/↓ move the
 * highlight; Backspace on an empty input drops the last chip; Esc / Tab / clicking elsewhere close and commit.
 * Temp ids of options created here are shown by name and committed as server ids once known (resolveDbId).
 */
function OptionsEditor(p: Inner): JSX.Element {
  const multi = p.column.type === 'MULTI_SELECT'
  const options = optionsOf(p.column)
  const initial = p.current === null ? [] : Array.isArray(p.current) ? p.current : [p.current as string]
  const [draft, setDraft] = useState<string[]>(initial)
  const [input, setInput] = useState(p.initialText ?? '')
  const [hi, setHi] = useState(0)
  const settled = useRef(false)
  /** Options created by this editor: id → name, and name key → id (one create per name, however fast Enter is). */
  // the ref answers event handlers at once (two fast Enters); the state copy renders names and the "สร้าง" item
  const [known, setKnown] = useState(() => ({
    names: new Map<string, string>(),
    ids: new Map<string, string>(),
  }))
  const created = useRef(known)
  const remember = (key: string, id: string | null, name: string) => {
    const c = created.current
    const next = { names: new Map(c.names), ids: new Map(c.ids) }
    if (id === null) next.ids.delete(key)
    else {
      next.ids.set(key, id)
      next.names.set(id, name)
    }
    created.current = next
    setKnown(next)
  }
  const listId = useId()
  const canCreate = p.createOption !== undefined && options.length < DB_LIMITS.optionsPerColumn

  /** The option an id names now (a temp id may have become a server id meanwhile). */
  const optionOf = (id: string) =>
    options.find((o) => o.id === id) ?? options.find((o) => o.id === resolveDbId(id))
  const nameOf = (id: string): string => optionOf(id)?.name ?? known.names.get(id) ?? ''
  const existingIn = (ids: ReadonlyMap<string, string>, name: string): string | undefined =>
    options.find((o) => optionKey(o.name) === optionKey(name))?.id ?? ids.get(optionKey(name))

  const q = input.trim()
  const matches = (name: string) => q === '' || name.toLocaleLowerCase().includes(q.toLocaleLowerCase())
  // options this editor created that the column does not show yet (their create is still on its way)
  const fresh = [...known.ids.values()].filter((id) => optionOf(id) === undefined && matches(nameOf(id)))
  const shown = [...options.filter((o) => matches(o.name)).map((o) => o.id), ...fresh]
  const offerCreate = canCreate && q !== '' && existingIn(known.ids, q) === undefined
  type Item = { kind: 'create'; name: string } | { kind: 'option'; id: string }
  const items: Item[] = [
    ...(offerCreate ? [{ kind: 'create' as const, name: q }] : []),
    ...shown.map((id) => ({ kind: 'option' as const, id })),
  ]
  const active = Math.min(hi, Math.max(0, items.length - 1))
  const full = multi && draft.length >= DB_LIMITS.multi

  const finish = (reason: EditorDone, value: string[] | undefined) => {
    if (settled.current) return
    settled.current = true
    if (value !== undefined) {
      const ids = value.filter((x) => !x.startsWith(PENDING)).map(resolveDbId)
      p.commit(ids.length === 0 ? null : multi ? ids : ids[0]!)
    }
    p.onDone(reason)
  }

  const idFor = (item: Item): string | null => {
    if (item.kind === 'option') return item.id
    const existing = existingIn(created.current.ids, item.name)
    if (existing !== undefined) return existing
    if (!p.createOption) return null
    // a placeholder until addOption answers (a microtask later, with the temp id): a second Enter on the same name
    // in the meantime finds it and never creates twice
    const key = optionKey(item.name)
    const placeholder = `${PENDING}${key}`
    remember(key, placeholder, item.name)
    void p.createOption(item.name).then((x) => {
      if (x === '') {
        remember(key, null, item.name)
        setDraft((d) => d.filter((y) => y !== placeholder))
        return
      }
      remember(key, x, item.name)
      setDraft((d) => d.map((y) => (y === placeholder ? x : y)))
      if (!multi) finish('picked', [x])
    })
    return placeholder
  }

  const pick = (item: Item, toggle: boolean) => {
    const id = idFor(item)
    if (id === null) return
    if (!multi) {
      if (!id.startsWith(PENDING)) finish('picked', [id])
      return
    }
    setDraft((d) => {
      const has = d.some((x) => sameDbId(x, id))
      if (has) return toggle ? d.filter((x) => !sameDbId(x, id)) : d
      return d.length >= DB_LIMITS.multi ? d : [...d, id]
    })
    setInput('')
    setHi(0)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.code === 'ArrowDown' || e.key === 'ArrowDown') {
      e.preventDefault()
      setHi(Math.min(items.length - 1, active + 1))
    } else if (e.code === 'ArrowUp' || e.key === 'ArrowUp') {
      e.preventDefault()
      setHi(Math.max(0, active - 1))
    } else if (isEnter(e)) {
      e.preventDefault()
      const item = items[active]
      // an exact name (any case) always picks that option, whatever is highlighted (BR-90)
      const exact = q === '' ? undefined : existingIn(created.current.ids, q)
      if (exact !== undefined) pick({ kind: 'option', id: exact }, false)
      else if (q !== '' && item) pick(item, false)
      else if (q === '' && !multi && item) pick(item, false)
      else finish('enter', draft)
    } else if (isTab(e)) {
      e.preventDefault()
      finish(e.shiftKey ? 'shiftTab' : 'tab', draft)
    } else if (isEsc(e)) {
      e.preventDefault()
      finish('escape', draft) // closes and keeps what was picked (owner, 2026-11-03)
    } else if (
      (e.code === 'Backspace' || e.key === 'Backspace') &&
      input === '' &&
      multi &&
      draft.length > 0
    ) {
      e.preventDefault()
      setDraft((d) => d.slice(0, -1))
    }
  }

  const optionDomId = (i: number) => `${listId}-${i}`
  return (
    <div
      className={`${s.editor} ${s.optionsEditor}`}
      data-testid="db-cell-editor"
      onKeyDown={stopKeys}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) finish('blur', draft)
      }}
    >
      {draft.length > 0 ? (
        <div className={s.optionsPicked}>
          {draft.map((id) => {
            const o = optionOf(id)
            const name = nameOf(id)
            return (
              <span key={id} className={s.pickedChip}>
                <OptionChip option={{ name, color: o?.color ?? 'gray' }} />
                {multi ? (
                  <button
                    type="button"
                    className={s.chipRemove}
                    aria-label={th.database.cells.removeOption(name)}
                    tabIndex={-1}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setDraft((d) => d.filter((x) => x !== id))}
                  >
                    <Close fontSize="inherit" aria-hidden="true" />
                  </button>
                ) : null}
              </span>
            )
          })}
        </div>
      ) : null}
      <input
        className={s.input}
        role="combobox"
        aria-label={p.label}
        aria-expanded="true"
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={items.length > 0 ? optionDomId(active) : undefined}
        autoFocus
        placeholder={canCreate ? th.database.cells.pickOption : th.database.cells.pickOptionOnly}
        value={input}
        onChange={(e) => {
          setInput(e.target.value)
          setHi(0)
        }}
        onKeyDown={onKeyDown}
      />
      <ul
        id={listId}
        role="listbox"
        aria-label={p.label}
        aria-multiselectable={multi || undefined}
        className={s.optionList}
      >
        {items.map((item, i) => {
          const selected = item.kind === 'option' && draft.some((x) => sameDbId(x, item.id))
          const disabled = item.kind === 'option' && full && !selected
          return (
            <li
              key={item.kind === 'create' ? 'create' : item.id}
              id={optionDomId(i)}
              role="option"
              aria-selected={selected}
              aria-disabled={disabled || undefined}
              data-active={i === active || undefined}
              className={s.optionItem}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHi(i)}
              onClick={() => {
                if (!disabled) pick(item, true)
              }}
            >
              {item.kind === 'create' ? (
                <span className={s.createItem}>{th.database.cells.createOption(item.name)}</span>
              ) : (
                <OptionChip option={{ name: nameOf(item.id), color: optionOf(item.id)?.color ?? 'gray' }} />
              )}
              {selected ? <Check fontSize="inherit" className={s.optionCheck} aria-hidden="true" /> : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function PersonEditor(p: Inner): JSX.Element {
  const people = usePeopleOptions().data
  const [initial] = useState<string[]>(() => (Array.isArray(p.current) ? p.current : []))
  const [draft, setDraft] = useState<string[]>(initial)
  const [input, setInput] = useState(p.initialText ?? '')
  const settled = useRef(false)
  // active people from the directory (M11-D33) + ids already in the cell (deactivated ones stay, never offered)
  const ids = useMemo(() => {
    const active = (people ?? []).filter((x) => x.active).map((x) => x.id)
    return [...active, ...initial.filter((id) => !active.includes(id))]
  }, [people, initial])
  const activeSet = useMemo(() => new Set((people ?? []).filter((x) => x.active).map((x) => x.id)), [people])

  const name = (id: string): string => {
    const o = people?.find((x) => x.id === id)
    const ref = o ? { name: o.name, nickname: o.nickname, deactivated: !o.active } : p.people(id)
    if (!ref) return th.database.cells.unknownPerson
    const n = displayName(ref)
    return ref.deactivated ? `${n} (${th.database.cells.deactivated})` : n
  }
  const done = (reason: EditorDone, value?: string[]) => {
    if (settled.current) return
    settled.current = true
    if (reason !== 'escape' && value !== undefined) p.commit(value.length === 0 ? null : value)
    p.onDone(reason)
  }

  return (
    <div className={s.editor} data-testid="db-cell-editor" onKeyDown={stopKeys}>
      <Autocomplete<string, true, false, false>
        open
        multiple
        disableCloseOnSelect
        size="small"
        options={ids}
        value={draft}
        inputValue={input}
        onInputChange={(_e, v, reason) => {
          if (reason !== 'reset') setInput(v)
        }}
        getOptionLabel={name}
        getOptionDisabled={(id) => !draft.includes(id) && draft.length >= DB_LIMITS.people}
        filterOptions={(list, state) => {
          const q = state.inputValue.trim().toLocaleLowerCase()
          return list.filter(
            (id) => activeSet.has(id) && (q === '' || name(id).toLocaleLowerCase().includes(q)),
          )
        }}
        onChange={(_e, v) => setDraft(v)}
        onClose={(_e, reason) => {
          if (reason === 'escape') done('escape')
          else if (reason === 'blur') done('blur', draft)
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            autoFocus
            placeholder={th.database.cells.pickPerson}
            slotProps={{
              ...params.slotProps,
              htmlInput: { ...params.slotProps.htmlInput, 'aria-label': p.label },
            }}
            onKeyDown={(e) => {
              if (isTab(e)) {
                e.preventDefault()
                done(e.shiftKey ? 'shiftTab' : 'tab', draft)
              }
            }}
          />
        )}
      />
    </div>
  )
}
