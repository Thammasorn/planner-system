'use client'
import { useId, useRef, type KeyboardEvent } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Block from '@mui/icons-material/Block'
import Check from '@mui/icons-material/Check'
import { th } from '@/i18n/th'
import { PROJECT_COLORS } from '@/lib/project-colors'

const SIZE = 28

/**
 * Project / client colour (M2-D15): a WAI-ARIA radio group of the 12 PROJECT_COLORS swatches with a roving
 * tabindex (arrows move and select, Space/Enter select). The selection is shown by a check mark and an outline,
 * not by colour alone; each swatch is announced as "สี #RRGGBB". `allowNone` adds "ไม่ระบุสี" (null) first.
 */
export function ColorSwatchPicker({
  value,
  onChange,
  allowNone,
  label,
}: {
  value: string | null
  onChange: (v: string | null) => void
  allowNone?: boolean
  label: string
}) {
  const labelId = useId()
  const items: (string | null)[] = allowNone ? [null, ...PROJECT_COLORS] : [...PROJECT_COLORS]
  const current = value === null ? null : value.toUpperCase()
  const selectedIndex = Math.max(
    0,
    items.findIndex((c) => c === current),
  )
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const select = (i: number) => {
    const n = items.length
    const idx = ((i % n) + n) % n
    refs.current[idx]?.focus()
    onChange(items[idx] ?? null)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault()
        select(i + 1)
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault()
        select(i - 1)
        break
      case 'Home':
        e.preventDefault()
        select(0)
        break
      case 'End':
        e.preventDefault()
        select(items.length - 1)
        break
      case ' ':
      case 'Enter':
        e.preventDefault()
        select(i)
        break
    }
  }

  return (
    <Box>
      <Typography id={labelId} variant="subtitle2" sx={{ mb: 0.5 }}>
        {label}
      </Typography>
      <Box role="radiogroup" aria-labelledby={labelId} sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
        {items.map((c, i) => {
          const isSelected = c === current
          return (
            <Box
              key={c ?? 'none'}
              component="button"
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={c === null ? th.clients.fields.noColor : th.projects.colorOption(c)}
              tabIndex={i === selectedIndex ? 0 : -1}
              ref={(el: HTMLButtonElement | null) => {
                refs.current[i] = el
              }}
              onClick={() => onChange(c)}
              onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) => onKeyDown(e, i)}
              sx={{
                width: SIZE,
                height: SIZE,
                p: 0,
                borderRadius: '6px',
                border: c === null ? '1px dashed' : 'none',
                borderColor: 'text.secondary',
                bgcolor: c ?? 'transparent',
                color: c === null ? 'text.secondary' : '#FFFFFF',
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
                outline: isSelected ? '2px solid' : 'none',
                outlineColor: 'text.primary',
                outlineOffset: 2,
                '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
              }}
            >
              {isSelected ? (
                <Check sx={{ fontSize: 18 }} />
              ) : c === null ? (
                <Block sx={{ fontSize: 16 }} />
              ) : null}
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
