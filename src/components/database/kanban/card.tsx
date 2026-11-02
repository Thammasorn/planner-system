'use client'
// src/components/database/kanban/card.tsx — what kanban and calendar cards share (FR-1432, M11-D39): the domain
// context of the viewer (people, "ฉัน", today, collator), the card's content (title + 📄 + the view's card properties,
// empty values omitted) and the ⋯ "card properties" menu items.
import Check from '@mui/icons-material/Check'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import ListSubheader from '@mui/material/ListSubheader'
import MenuItem from '@mui/material/MenuItem'
import { type JSX, useMemo } from 'react'
import { liveConfig, makeCollator, rowValue } from '@/domain/database'
import type { DbCtx } from '@/domain/types'
import { th } from '@/i18n/th'
import type { DbColumnDTO, DbRowDTO, DbViewDTO } from '@/lib/contracts/databases'
import { BodyMark, CellDisplay } from '../cells/CellDisplay'
import { usePersonLookup } from '../cells/people'
import { useDbApi } from '../data/contract'
import s from './kanban.module.css'

/** The viewer's domain context (BR-94 collator, "@me", today) — the same values DatabaseBlockContent builds. */
export function useDbCtx(): DbCtx {
  const api = useDbApi()
  const people = api.db.people
  return useMemo<DbCtx>(
    () => ({
      people: new Map(Object.entries(people)),
      viewerId: api.viewerId,
      today: api.today,
      collator: makeCollator(),
    }),
    [people, api.viewerId, api.today],
  )
}

/** Title (or "ไม่มีชื่อ"), 📄 when the row has a body, then one line per card property that has a value. */
export function CardContent({ row, view }: { row: DbRowDTO; view: DbViewDTO }): JSX.Element {
  const api = useDbApi()
  const people = usePersonLookup()
  const ids = liveConfig(view.config, api.db.columns).cardColumnIds ?? []
  const cols = ids
    .map((id) => api.db.columns.find((c) => c.id === id))
    .filter((c): c is DbColumnDTO => c !== undefined && c.type !== 'TITLE')
  return (
    <>
      <span className={s.cardTitle}>
        <span className={s.cardTitleText} data-empty={row.title === '' || undefined}>
          {row.title || th.database.table.untitledRow}
        </span>
        {row.hasBody ? <BodyMark /> : null}
      </span>
      {cols.map((c) =>
        rowValue(row, c) === null ? null : (
          <span key={c.id} className={s.cardProp} title={c.name}>
            <CellDisplay column={c} row={row} people={people} layout="line" />
          </span>
        ),
      )}
    </>
  )
}

/** View ⋯ items "คุณสมบัติบนการ์ด": one checkbox item per non-title column (FR-1432; default none). */
export function CardPropertyItems({ view }: { view: DbViewDTO }): JSX.Element {
  const api = useDbApi()
  const chosen = view.config.cardColumnIds ?? []
  const cols = api.db.columns.filter((c) => c.type !== 'TITLE')
  const toggle = (id: string) => {
    const next = chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]
    api.updateView(view.id, { config: { ...view.config, cardColumnIds: next } })
  }
  return (
    <>
      <ListSubheader className={s.menuHeading}>{th.database.kanban.cardProps}</ListSubheader>
      {cols.map((c) => {
        const on = chosen.includes(c.id)
        return (
          <MenuItem key={c.id} role="menuitemcheckbox" aria-checked={on} onClick={() => toggle(c.id)}>
            <ListItemIcon>{on ? <Check fontSize="small" aria-hidden="true" /> : null}</ListItemIcon>
            <ListItemText>{c.name}</ListItemText>
          </MenuItem>
        )
      })}
    </>
  )
}
