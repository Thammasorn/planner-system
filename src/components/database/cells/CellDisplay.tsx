'use client'
// src/components/database/cells/CellDisplay.tsx — the read view of one cell for every column type (FR-1410, BR-90,
// M11-D36): option chips with names, person chips (+ "ปิดใช้งาน"), numbers through formatNumberCell (display only),
// dates "5 พ.ย. 2569", ☑/☐ with a text name, URL anchors (new tab, rel noopener noreferrer, http/https/mailto only),
// the row title with 📄 when the row has a body (M11-D39). Shared by the table, the row panel, S4's cards and /r.
import CheckBoxOutlineBlankOutlined from '@mui/icons-material/CheckBoxOutlineBlankOutlined'
import CheckBoxOutlined from '@mui/icons-material/CheckBoxOutlined'
import type { JSX } from 'react'
import { formatNumberCell, isDbUrl, numberConfigOf, optionsOf, rowValue } from '@/domain/database'
import { th } from '@/i18n/th'
import type { DbColumnDTO, DbRowDTO } from '@/lib/contracts/databases'
import { formatThaiDate } from '@/lib/format'
import { OptionChip, PersonChip } from './Chips'
import s from './cells.module.css'
import type { PersonLookup } from './people'

export interface CellDisplayProps {
  column: Pick<DbColumnDTO, 'id' | 'type' | 'config'>
  row: Pick<DbRowDTO, 'title' | 'cells' | 'hasBody'>
  people: PersonLookup
  /** 'line' = one line (table, cards); 'block' = wraps (panel, /r). */
  layout?: 'line' | 'block'
  /** Untitled rows show "ไม่มีชื่อ" (default true). */
  showUntitled?: boolean
}

export function BodyMark(): JSX.Element {
  return (
    <span
      className={s.bodyMark}
      role="img"
      aria-label={th.database.rows.hasBody}
      title={th.database.rows.hasBody}
    >
      📄
    </span>
  )
}

export function CheckMark({ checked }: { checked: boolean }): JSX.Element {
  const label = checked ? th.database.cells.checked : th.database.cells.unchecked
  return (
    <span className={s.check} data-checked={checked} role="img" aria-label={label} title={label}>
      {checked ? (
        <CheckBoxOutlined fontSize="inherit" />
      ) : (
        <CheckBoxOutlineBlankOutlined fontSize="inherit" />
      )}
    </span>
  )
}

export function CellDisplay({
  column,
  row,
  people,
  layout = 'line',
  showUntitled = true,
}: CellDisplayProps): JSX.Element | null {
  const v = rowValue(row, column)
  const wrap = layout === 'block' ? ` ${s.wrap}` : ''
  switch (column.type) {
    case 'TITLE':
      return (
        <>
          {v === null ? (
            showUntitled ? (
              <span className={`${s.text} ${s.muted}`}>{th.database.table.untitledRow}</span>
            ) : null
          ) : (
            <span className={layout === 'block' ? s.multiline : s.text}>{v as string}</span>
          )}
          {row.hasBody ? <BodyMark /> : null}
        </>
      )
    case 'CHECKBOX':
      return <CheckMark checked={v === true} />
    default:
      break
  }
  if (v === null) return null
  switch (column.type) {
    case 'TEXT':
      return <span className={layout === 'block' ? s.multiline : s.text}>{v as string}</span>
    case 'NUMBER':
      // Right-aligned in a column of numbers (table, cards); in a label/value property list (panel, /r) it starts where
      // every other value starts (SPEC §4.16 D19, §8.12).
      return (
        <span className={s.number} data-align={layout === 'block' ? 'start' : 'end'}>
          {formatNumberCell(v as string, numberConfigOf(column))}
        </span>
      )
    case 'DATE':
      return <span className={s.text}>{formatThaiDate(v as string, 'medium')}</span>
    case 'URL': {
      const url = v as string
      return isDbUrl(url) ? (
        <a
          className={s.link}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title={th.database.cells.openLink}
        >
          {url}
        </a>
      ) : (
        <span className={s.text}>{url}</span>
      )
    }
    case 'SELECT':
    case 'MULTI_SELECT': {
      const byId = new Map(optionsOf(column).map((o) => [o.id, o]))
      const ids = Array.isArray(v) ? v : [v as string]
      return (
        <span className={`${s.chips}${wrap}`}>
          {ids.map((id) => {
            const o = byId.get(id)
            return o ? <OptionChip key={id} option={o} /> : null
          })}
        </span>
      )
    }
    case 'PERSON':
      return (
        <span className={`${s.chips}${wrap}`}>
          {(v as string[]).map((id) => (
            <PersonChip key={id} person={people(id)} />
          ))}
        </span>
      )
    default:
      return null
  }
}
