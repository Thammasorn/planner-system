'use client'
// src/components/grid/MarkerPopover.tsx — edit one plan marker (SPEC FR-819, §8.13, M7.1-D11/D14, FR-1604 light form).
// Three named colour buttons ("แดง" "เหลือง" "เขียว", ✓ + aria-pressed on the chosen one — never colour alone), the
// label (≤ 80, debounced 400 ms, flushed on blur / close), the date (M3 DateField, Buddhist calendar) and 🗑. No save
// button: every change applies at once (optimistic, usePlanMarkers). Viewers without edit rights get the read-only
// variant (same facts + th.planMarkers.readOnly).
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Popover from '@mui/material/Popover'
import TextField from '@mui/material/TextField'
import DeleteOutlined from '@mui/icons-material/DeleteOutlined'
import { useEffect, useRef, useState, type JSX } from 'react'
import { DateField } from '@/components/common/DateField'
import type { ISODate } from '@/domain/types'
import { th } from '@/i18n/th'
import { PLAN_MARKER_COLORS, type PlanMarkerColor, type PlanMarkerDTO } from '@/lib/contracts/plan-markers'
import { formatThaiDate } from '@/lib/format'
import { PLAN_MARKER_LABEL_MAX } from '@/lib/schemas/plan-markers'
import type { MarkerPatch } from './usePlanMarkers'
import styles from './grid.module.css'

export const LABEL_DEBOUNCE_MS = 400

export interface MarkerPopoverProps {
  marker: PlanMarkerDTO | null
  anchorEl: Element | null
  editable: boolean
  onChange: (markerId: string, patch: MarkerPatch) => void
  onDelete: (markerId: string) => void
  onClose: () => void
}

export function MarkerPopover(p: MarkerPopoverProps): JSX.Element {
  const m = p.marker
  const open = m !== null && p.anchorEl !== null
  const close = () => p.onClose()
  return (
    <Popover
      open={open}
      anchorEl={open ? p.anchorEl : null}
      onClose={close}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      slotProps={{
        paper: { role: 'dialog', 'aria-label': p.editable ? th.planMarkers.edit : th.planMarkers.readOnly },
      }}
    >
      {m ? (
        // keyed by id: a different marker re-seeds the label field (typing is never reset by its own updates); the
        // form flushes a pending label when it unmounts (popover closed)
        <MarkerForm key={m.id} {...p} marker={m} onClose={close} />
      ) : null}
    </Popover>
  )
}

function MarkerForm(p: Omit<MarkerPopoverProps, 'marker'> & { marker: PlanMarkerDTO }): JSX.Element {
  const m = p.marker
  const [label, setLabel] = useState(m.label ?? '')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const sent = useRef<string>(m.label ?? '')
  const latest = useRef(label)
  const flushLabel = (value: string) => {
    clearTimeout(timer.current)
    if (value === sent.current) return
    sent.current = value
    p.onChange(m.id, { label: value })
  }
  const flushRef = useRef(flushLabel)
  useEffect(() => {
    flushRef.current = flushLabel
    latest.current = label
  })
  useEffect(() => {
    const t = timer
    const flush = flushRef
    const value = latest
    return () => {
      clearTimeout(t.current)
      flush.current(value.current) // the popover closed: a pending label is saved, not lost
    }
  }, [])

  return (
    <Box className={styles.markerForm} data-testid="marker-popover">
      {p.editable ? (
        <>
          <div role="group" aria-label={th.planMarkers.edit} className={styles.markerColors}>
            {PLAN_MARKER_COLORS.map((c: PlanMarkerColor) => (
              <button
                key={c}
                type="button"
                className={styles.markerColor}
                aria-pressed={m.color === c}
                data-tone={c}
                data-testid={`marker-color-${c}`}
                onClick={() => {
                  if (m.color !== c) p.onChange(m.id, { color: c })
                }}
              >
                <span className={styles.markerSwatch} data-tone={c} aria-hidden="true" />
                {m.color === c ? '✓ ' : ''}
                {th.planMarkers.color[c]}
              </button>
            ))}
          </div>
          <TextField
            size="small"
            label={th.planMarkers.label}
            placeholder={th.planMarkers.labelPlaceholder}
            value={label}
            autoFocus
            slotProps={{ htmlInput: { maxLength: PLAN_MARKER_LABEL_MAX, 'data-testid': 'marker-label' } }}
            onChange={(e) => {
              const v = e.target.value
              setLabel(v)
              clearTimeout(timer.current)
              timer.current = setTimeout(() => flushLabel(v), LABEL_DEBOUNCE_MS)
            }}
            onBlur={() => flushLabel(label)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                p.onClose()
              }
            }}
          />
          <div className={styles.markerFormRow}>
            <DateField
              label={th.planMarkers.date}
              value={m.date}
              onChange={(d: ISODate | null) => {
                if (d && d !== m.date) p.onChange(m.id, { date: d })
              }}
            />
            <IconButton
              aria-label={th.planMarkers.delete}
              data-testid="marker-delete"
              onClick={() => {
                clearTimeout(timer.current)
                sent.current = latest.current // nothing left to flush: the marker is gone
                p.onDelete(m.id)
                p.onClose()
              }}
            >
              <DeleteOutlined fontSize="small" />
            </IconButton>
          </div>
        </>
      ) : (
        <dl className={styles.markerReadOnly}>
          <dt>{th.planMarkers.label}</dt>
          <dd>{m.label ?? '—'}</dd>
          <dt>{th.planMarkers.date}</dt>
          <dd>{formatThaiDate(m.date, 'medium')}</dd>
          <dd>
            <span className={styles.markerSwatch} data-tone={m.color} aria-hidden="true" />
            {th.planMarkers.color[m.color]}
          </dd>
          <dd className={styles.muted}>{th.planMarkers.readOnly}</dd>
        </dl>
      )}
    </Box>
  )
}
