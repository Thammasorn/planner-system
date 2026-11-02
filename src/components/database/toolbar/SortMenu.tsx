'use client'
// src/components/database/toolbar/SortMenu.tsx — the view's sorts (FR-1426, BR-94): up to 3 keys (column + น้อย→มาก /
// มาก→น้อย), applied in order. Shared view settings: every change is one updateDatabaseView (undo without toast).
import Close from '@mui/icons-material/Close'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Popover from '@mui/material/Popover'
import TextField from '@mui/material/TextField'
import type { JSX } from 'react'
import { DB_LIMITS, liveConfig } from '@/domain/database'
import type { ViewSort } from '@/domain/types'
import { th } from '@/i18n/th'
import type { DbViewDTO } from '@/lib/contracts/databases'
import { useDbApi } from '../data/contract'
import s from '../menus/menus.module.css'

export interface ToolbarMenuProps {
  anchorEl: HTMLElement | null
  view: DbViewDTO
  onClose: () => void
}

export function SortMenu(p: ToolbarMenuProps): JSX.Element {
  const api = useDbApi()
  const cols = api.db.columns
  // only sorts on live columns are shown and edited; suspended ones come back with their column (FR-1415)
  const sorts = liveConfig(p.view.config, cols).sorts ?? []
  const t = th.database.toolbar
  const save = (next: ViewSort[]) => api.updateView(p.view.id, { config: { ...p.view.config, sorts: next } })
  const used = new Set(sorts.map((x) => x.columnId))
  const free = cols.filter((c) => !used.has(c.id))
  return (
    <Popover
      open={p.anchorEl !== null}
      anchorEl={p.anchorEl}
      onClose={p.onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      slotProps={{ paper: { role: 'dialog', 'aria-label': t.sort(sorts.length) } }}
    >
      <div className={`${s.panel} ${s.wide}`} data-testid="db-sort-menu">
        {sorts.map((x, i) => (
          <div key={x.columnId} className={s.row}>
            <TextField
              select
              size="small"
              className={s.grow}
              value={x.columnId}
              slotProps={{ htmlInput: { 'aria-label': t.sortColumn } }}
              onChange={(e) => save(sorts.map((y, j) => (j === i ? { ...y, columnId: e.target.value } : y)))}
            >
              {cols
                .filter((c) => c.id === x.columnId || !used.has(c.id))
                .map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                  </MenuItem>
                ))}
            </TextField>
            <TextField
              select
              size="small"
              value={x.dir}
              slotProps={{ htmlInput: { 'aria-label': t.sortDir } }}
              onChange={(e) =>
                save(sorts.map((y, j) => (j === i ? { ...y, dir: e.target.value as ViewSort['dir'] } : y)))
              }
            >
              <MenuItem value="ASC">{t.asc}</MenuItem>
              <MenuItem value="DESC">{t.desc}</MenuItem>
            </TextField>
            <IconButton
              size="small"
              aria-label={t.removeSort}
              onClick={() => save(sorts.filter((_, j) => j !== i))}
            >
              <Close fontSize="small" />
            </IconButton>
          </div>
        ))}
        <Button
          size="small"
          disabled={sorts.length >= DB_LIMITS.sorts || free.length === 0}
          onClick={() => save([...sorts, { columnId: free[0]!.id, dir: 'ASC' }])}
          sx={{ alignSelf: 'flex-start' }}
        >
          {sorts.length >= DB_LIMITS.sorts ? th.database.errors.limit.sorts(DB_LIMITS.sorts) : t.addSort}
        </Button>
      </div>
    </Popover>
  )
}
