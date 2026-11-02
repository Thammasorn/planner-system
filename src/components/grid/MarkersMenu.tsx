'use client'
// src/components/grid/MarkersMenu.tsx — "⚑ เส้นกำกับ (N) ▾" in the grid toolbar (SPEC FR-819, §8.3, M7.1-D11). The
// project's markers sorted by date; choosing one scrolls the grid to its edge and opens its popover (edit, or the
// read-only variant), which also holds 🗑 — the keyboard path to every flag (flags stay out of the Tab order).
// "+ เพิ่มเส้นกำกับ…" (edit rights only, ≤ 100 live markers) creates a marker on Friday of this week and opens it.
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { useState, type JSX } from 'react'
import { th } from '@/i18n/th'
import type { PlanMarkerDTO } from '@/lib/contracts/plan-markers'
import { formatThaiDate } from '@/lib/format'
import { PLAN_MARKER_LIMIT } from '@/lib/schemas/plan-markers'
import styles from './grid.module.css'

export interface MarkersMenuProps {
  markers: readonly PlanMarkerDTO[]
  canEdit: boolean
  onGoTo: (marker: PlanMarkerDTO) => void
  onAdd: () => void
}

export function MarkersMenu(p: MarkersMenuProps): JSX.Element {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const close = () => setAnchor(null)
  const full = p.markers.length >= PLAN_MARKER_LIMIT
  return (
    <>
      <Button
        size="small"
        variant="outlined"
        className={styles.toolbarToggle}
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        data-testid="markers-menu"
        onClick={(e) => setAnchor(e.currentTarget)}
      >
        <span aria-hidden="true" className={styles.toolbarGlyph}>
          ⚑
        </span>
        {th.planMarkers.menu(p.markers.length)}
        <span aria-hidden="true" className={styles.toolbarGlyph}>
          ▾
        </span>
      </Button>
      <Menu
        open={anchor !== null}
        anchorEl={anchor}
        onClose={close}
        slotProps={{ list: { 'aria-label': th.planMarkers.menu(p.markers.length) } }}
      >
        {p.markers.map((m) => (
          <MenuItem
            key={m.id}
            data-testid={`markers-menu-item-${m.id}`}
            onClick={() => {
              close()
              p.onGoTo(m)
            }}
          >
            <span className={styles.markerSwatch} data-tone={m.color} aria-hidden="true" />
            <span className={styles.markersMenuText}>
              {m.label ?? th.planMarkers.color[m.color]} · {formatThaiDate(m.date, 'medium')}
            </span>
            <span className={styles.srOnly}>{th.planMarkers.color[m.color]}</span>
          </MenuItem>
        ))}
        {p.canEdit && p.markers.length > 0 ? <Divider /> : null}
        {p.canEdit ? (
          <MenuItem
            disabled={full}
            data-testid="markers-menu-add"
            onClick={() => {
              close()
              p.onAdd()
            }}
          >
            {full ? th.planMarkers.limit(PLAN_MARKER_LIMIT) : th.planMarkers.add}
          </MenuItem>
        ) : null}
      </Menu>
    </>
  )
}
