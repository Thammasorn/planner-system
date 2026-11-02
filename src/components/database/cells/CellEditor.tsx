'use client'
// src/components/database/cells/CellEditor.tsx — the edit mode of one cell for every column type (FR-1410, FR-1421,
// BR-90…92, M11-D33/D36): text (TEXT: Shift+Enter = new line), number (parseNumberInput, the stored value is the
// exact canonical string), URL (http/https/mailto only), date (typed via parseDateInput incl. พ.ศ., or the calendar),
// SELECT / MULTI_SELECT Autocomplete with "สร้าง "…"" (→ addOption), PERSON Autocomplete over active people only.
// Enter / Tab / Shift+Tab confirm, Esc cancels, clicking elsewhere confirms (invalid input is dropped then). Keys are
// matched on e.code (X49) and ignored while an IME composes. CHECKBOX has no editor (toggled in place).
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined'
import Autocomplete from '@mui/material/Autocomplete'
import IconButton from '@mui/material/IconButton'
import Popover from '@mui/material/Popover'
import TextField from '@mui/material/TextField'
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar'
import { type JSX, type KeyboardEvent, useMemo, useRef, useState } from 'react'
import { dayjsToIso, isoToDayjs } from '@/components/common/DateField'
import { DB_LIMITS, isDbUrl, optionsOf, parseDateInput, parseNumberInput, rowValue } from '@/domain/database'
import type { ISODate } from '@/domain/types'
import { usePeopleOptions } from '@/hooks/usePeopleOptions'
import { th } from '@/i18n/th'
import type { CellValue, DbColumnDTO, DbRowDTO } from '@/lib/contracts/databases'
import { displayName } from '@/lib/display-name'
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

const CREATE = '\u0000create:'

/** Plain keys handled by the picker never reach the grid / panel (Esc closes only the picker); Mod+K etc. pass. */
function stopKeys(e: KeyboardEvent): void {
  if (!e.metaKey && !e.ctrlKey) e.stopPropagation()
}

function OptionsEditor(p: Inner): JSX.Element {
  const multi = p.column.type === 'MULTI_SELECT'
  const options = optionsOf(p.column)
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options])
  const initial = p.current === null ? [] : Array.isArray(p.current) ? p.current : [p.current as string]
  const [draft, setDraft] = useState<string[]>(initial)
  const [input, setInput] = useState(p.initialText ?? '')
  const settled = useRef(false)
  const canCreate = p.createOption !== undefined && options.length < DB_LIMITS.optionsPerColumn

  const done = (reason: EditorDone, value?: string[]) => {
    if (settled.current) return
    settled.current = true
    if (reason !== 'escape' && value !== undefined) {
      p.commit(value.length === 0 ? null : multi ? value : value[0]!)
    }
    p.onDone(reason)
  }
  const create = async (name: string): Promise<string | null> => {
    if (!p.createOption) return null
    const id = await p.createOption(name.trim())
    return id === '' ? null : id
  }

  const label = (id: string): string =>
    id.startsWith(CREATE)
      ? th.database.cells.createOption(id.slice(CREATE.length))
      : (byId.get(id)?.name ?? id)

  return (
    <div className={s.editor} data-testid="db-cell-editor" onKeyDown={stopKeys}>
      <Autocomplete<string, boolean, false, false>
        open
        multiple={multi}
        disableCloseOnSelect={multi}
        size="small"
        options={options.map((o) => o.id)}
        value={multi ? draft : (draft[0] ?? null)}
        inputValue={input}
        onInputChange={(_e, v, reason) => {
          if (reason !== 'reset') setInput(v)
        }}
        getOptionLabel={label}
        getOptionDisabled={(id) => multi && !draft.includes(id) && draft.length >= DB_LIMITS.multi}
        filterOptions={(ids, state) => {
          const q = state.inputValue.trim().toLocaleLowerCase()
          const shown = q === '' ? ids : ids.filter((id) => label(id).toLocaleLowerCase().includes(q))
          const exact = options.some((o) => o.name.trim().toLocaleLowerCase() === q)
          return canCreate && q !== '' && !exact ? [...shown, `${CREATE}${state.inputValue.trim()}`] : shown
        }}
        onChange={(_e, v) => {
          const list = Array.isArray(v) ? v : v === null ? [] : [v]
          const creating = list.find((x) => x.startsWith(CREATE))
          if (creating) {
            const name = creating.slice(CREATE.length)
            void create(name).then((id) => {
              if (id === null) return
              const next = list.map((x) => (x === creating ? id : x))
              if (multi) {
                setDraft(next)
                setInput('')
              } else done('picked', [id])
            })
            return
          }
          if (multi) setDraft(list)
          else done('picked', list)
        }}
        onClose={(_e, reason) => {
          if (reason === 'escape') done('escape')
          else if (reason === 'blur') done('blur', draft)
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            autoFocus
            placeholder={th.database.cells.pickOption}
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
