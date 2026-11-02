'use client'
// src/components/database/menus/NumberConfigEditor.tsx — NUMBER display settings (FR-1410, BR-91, M11-D36): decimals
// shown ("ตามค่าจริง" or 0–6) and thousands separators. Display only — stored values never change.
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import type { JSX } from 'react'
import { DB_LIMITS, numberConfigOf } from '@/domain/database'
import { th } from '@/i18n/th'
import type { DbColumnDTO } from '@/lib/contracts/databases'
import { useDbApi } from '../data/contract'
import s from './menus.module.css'

const AUTO = 'auto'

export function NumberConfigEditor({ column }: { column: DbColumnDTO }): JSX.Element {
  const api = useDbApi()
  const cfg = numberConfigOf(column)
  return (
    <div className={s.section}>
      <TextField
        select
        size="small"
        label={th.database.columnMenu.decimals}
        value={cfg.decimals === null ? AUTO : String(cfg.decimals)}
        onChange={(e) =>
          api.updateColumn(column.id, {
            config: { ...cfg, decimals: e.target.value === AUTO ? null : Number(e.target.value) },
          })
        }
      >
        <MenuItem value={AUTO}>{th.database.columnMenu.decimalsAuto}</MenuItem>
        {Array.from({ length: DB_LIMITS.decimalsMax + 1 }, (_, i) => (
          <MenuItem key={i} value={String(i)}>
            {i}
          </MenuItem>
        ))}
      </TextField>
      <FormControlLabel
        control={
          <Switch
            size="small"
            checked={cfg.thousands}
            onChange={(e) => api.updateColumn(column.id, { config: { ...cfg, thousands: e.target.checked } })}
          />
        }
        label={th.database.columnMenu.thousands}
      />
    </div>
  )
}
