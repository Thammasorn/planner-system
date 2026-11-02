'use client'
// src/components/database/toolbar/DatabaseToolbar.tsx — "⇅ เรียง n · ⏷ กรอง n · ☰ คอลัมน์ · ⋯" of the open view
// (SPEC §8.11, FR-1426…1428): counts of live sorts / filters; ⋯ holds the view type's own items (S4: kanban group-by,
// calendar date column). Below 600 px the three buttons collapse into ⋯ (M11-D31). Read-only viewers get no controls
// (FR-1461). The filter menu can also be opened by a column menu's "กรอง" (`filterRequest`).
import FilterListOutlined from '@mui/icons-material/FilterListOutlined'
import MoreHoriz from '@mui/icons-material/MoreHoriz'
import SwapVertOutlined from '@mui/icons-material/SwapVertOutlined'
import ViewColumnOutlined from '@mui/icons-material/ViewColumnOutlined'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { type JSX, useEffect, useRef, useState } from 'react'
import { liveConfig } from '@/domain/database'
import { th } from '@/i18n/th'
import type { DbViewDTO } from '@/lib/contracts/databases'
import { useDbApi } from '../data/contract'
import { databaseView } from '../view-registry'
import { ColumnsMenu } from './ColumnsMenu'
import { FilterMenu } from './FilterMenu'
import { SortMenu } from './SortMenu'
import s from '../DatabaseBlock.module.css'

type Open = 'sort' | 'filter' | 'columns' | 'more' | null

export interface DatabaseToolbarProps {
  view: DbViewDTO
  narrow: boolean
  /** Increments when a column menu asks for the filter menu (its filter was already added). */
  filterRequest: number
}

export function DatabaseToolbar(p: DatabaseToolbarProps): JSX.Element | null {
  const api = useDbApi()
  const [open, setOpen] = useState<Open>(null)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const filterRef = useRef<HTMLButtonElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const live = liveConfig(p.view.config, api.db.columns)
  const nSorts = live.sorts?.length ?? 0
  const nFilters = live.filters?.length ?? 0
  const t = th.database.toolbar
  const MenuItems = databaseView(p.view.type)?.MenuItems

  const lastRequest = useRef(p.filterRequest)
  useEffect(() => {
    if (p.filterRequest === lastRequest.current) return
    lastRequest.current = p.filterRequest
    setAnchor(filterRef.current ?? moreRef.current)
    setOpen('filter')
  }, [p.filterRequest])

  if (!api.canEdit) return null
  const show = (which: Open) => (e: { currentTarget: HTMLElement }) => {
    setAnchor(e.currentTarget)
    setOpen(which)
  }
  const close = () => {
    setOpen(null)
    setAnchor(null)
  }
  const menuAnchor = (which: Open) => (open === which ? anchor : null)

  return (
    <div className={s.toolbar} role="toolbar" aria-label={t.label}>
      {p.narrow ? null : (
        <>
          <Button
            size="small"
            color="inherit"
            startIcon={<SwapVertOutlined />}
            onClick={show('sort')}
            data-active={nSorts > 0}
          >
            {t.sort(nSorts)}
          </Button>
          <Button
            ref={filterRef}
            size="small"
            color="inherit"
            startIcon={<FilterListOutlined />}
            onClick={show('filter')}
            data-active={nFilters > 0}
          >
            {t.filter(nFilters)}
          </Button>
          <Button size="small" color="inherit" startIcon={<ViewColumnOutlined />} onClick={show('columns')}>
            {t.columns}
          </Button>
        </>
      )}
      {p.narrow || MenuItems ? (
        <IconButton ref={moreRef} size="small" aria-label={t.more} onClick={show('more')}>
          <MoreHoriz fontSize="small" />
        </IconButton>
      ) : null}
      <Menu anchorEl={menuAnchor('more')} open={open === 'more'} onClose={close}>
        {p.narrow
          ? [
              <MenuItem key="sort" onClick={() => setOpen('sort')}>
                <ListItemIcon>
                  <SwapVertOutlined fontSize="small" />
                </ListItemIcon>
                <ListItemText>{t.sort(nSorts)}</ListItemText>
              </MenuItem>,
              <MenuItem key="filter" onClick={() => setOpen('filter')}>
                <ListItemIcon>
                  <FilterListOutlined fontSize="small" />
                </ListItemIcon>
                <ListItemText>{t.filter(nFilters)}</ListItemText>
              </MenuItem>,
              <MenuItem key="columns" onClick={() => setOpen('columns')}>
                <ListItemIcon>
                  <ViewColumnOutlined fontSize="small" />
                </ListItemIcon>
                <ListItemText>{t.columns}</ListItemText>
              </MenuItem>,
            ]
          : null}
        {MenuItems ? <MenuItems view={p.view} close={close} /> : null}
      </Menu>
      <SortMenu anchorEl={menuAnchor('sort')} view={p.view} onClose={close} />
      <FilterMenu anchorEl={menuAnchor('filter')} view={p.view} onClose={close} />
      <ColumnsMenu anchorEl={menuAnchor('columns')} view={p.view} onClose={close} />
    </div>
  )
}
