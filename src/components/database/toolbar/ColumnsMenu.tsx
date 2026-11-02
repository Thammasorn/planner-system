'use client'
// src/components/database/toolbar/ColumnsMenu.tsx — "☰ คอลัมน์" (FR-1428, FR-1413): show / hide each column in this
// view (TITLE always shown), show all / hide all. Hidden ids are view settings (one updateDatabaseView per change).
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Popover from '@mui/material/Popover'
import type { JSX } from 'react'
import { th } from '@/i18n/th'
import { TypeIcon } from '../cells/typeIcons'
import { useDbApi } from '../data/contract'
import s from '../menus/menus.module.css'
import type { ToolbarMenuProps } from './SortMenu'

export function ColumnsMenu(p: ToolbarMenuProps): JSX.Element {
  const api = useDbApi()
  const hidden = new Set(p.view.config.hiddenColumnIds ?? [])
  const cols = api.db.columns
  const save = (ids: string[]) =>
    api.updateView(p.view.id, { config: { ...p.view.config, hiddenColumnIds: ids } })
  const t = th.database.toolbar
  return (
    <Popover
      open={p.anchorEl !== null}
      anchorEl={p.anchorEl}
      onClose={p.onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      slotProps={{ paper: { role: 'dialog', 'aria-label': t.columns } }}
    >
      <div className={s.panel} data-testid="db-columns-menu">
        {cols.map((c) => {
          const isTitle = c.type === 'TITLE'
          return (
            <div key={c.id} className={s.row}>
              <span className={s.typeIcon}>
                <TypeIcon type={c.type} />
              </span>
              <FormControlLabel
                className={s.grow}
                label={c.name}
                control={
                  <Checkbox
                    size="small"
                    checked={isTitle || !hidden.has(c.id)}
                    disabled={isTitle}
                    onChange={(e) =>
                      save(e.target.checked ? [...hidden].filter((id) => id !== c.id) : [...hidden, c.id])
                    }
                  />
                }
              />
            </div>
          )
        })}
        <div className={s.row}>
          <Button size="small" onClick={() => save([])}>
            {t.showAll}
          </Button>
          <Button
            size="small"
            color="inherit"
            onClick={() => save(cols.filter((c) => c.type !== 'TITLE').map((c) => c.id))}
          >
            {t.hideAll}
          </Button>
        </div>
      </div>
    </Popover>
  )
}
