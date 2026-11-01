'use client'
import { useId, useMemo, useState, type KeyboardEvent } from 'react'
import Box from '@mui/material/Box'
import Popover from '@mui/material/Popover'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import CheckOutlined from '@mui/icons-material/CheckOutlined'
import { sortStatuses } from '@/domain/status'
import { th } from '@/i18n/th'
import type { TaskStatusDTO } from '@/lib/contracts/tasks'
import { CategoryIcon, ColorDot } from './StatusChip'

export interface StatusMenuProps {
  statuses: readonly TaskStatusDTO[]
  /** Highlighted as checked; null for a mixed selection. */
  currentId: string | null
  anchorEl: HTMLElement | null
  onPick: (statusId: string) => void
  onClose: () => void
}

/**
 * Status picker (FR-626, M3-D35): a filter field keeps focus (typing narrows the list), ↑/↓ move the highlight,
 * Enter applies, Esc closes. ARIA 1.2 combobox pattern: the field is a `combobox` whose popup is a `listbox` of
 * `option`s (position order, icon + name + category caption); the current status is `aria-selected` + a check icon,
 * the highlight is `aria-activedescendant`. The popover itself is a labelled `dialog` (triggers say haspopup=dialog).
 */
export function StatusMenu({ statuses, currentId, anchorEl, onPick, onClose }: StatusMenuProps) {
  const open = anchorEl !== null
  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      slotProps={{ paper: { role: 'dialog', 'aria-label': th.tasks.status.label, sx: { width: 260, p: 1 } } }}
    >
      {open ? <MenuBody statuses={statuses} currentId={currentId} onPick={onPick} onClose={onClose} /> : null}
    </Popover>
  )
}

function MenuBody({ statuses, currentId, onPick, onClose }: Omit<StatusMenuProps, 'anchorEl'>) {
  const listId = useId()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const items = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('th')
    const sorted = sortStatuses(statuses)
    // name or category caption ("รอ" finds รอข้อมูล and ติดปัญหา via "รอ/ติดขัด")
    const hay = (s: TaskStatusDTO) =>
      `${s.name} ${th.tasks.status.categories[s.category]}`.toLocaleLowerCase('th')
    return q === '' ? sorted : sorted.filter((s) => hay(s).includes(q))
  }, [statuses, query])
  const index = Math.min(active, Math.max(items.length - 1, 0))

  const pick = (id: string) => {
    onPick(id)
    onClose()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(items.length === 0 ? 0 : (index + 1) % items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(items.length === 0 ? 0 : (index - 1 + items.length) % items.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = items[index]
      if (item) pick(item.id)
    }
  }

  return (
    <>
      <TextField
        autoFocus
        fullWidth
        size="small"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
        }}
        onKeyDown={onKeyDown}
        placeholder={th.tasks.status.filter}
        slotProps={{
          htmlInput: {
            'aria-label': th.tasks.status.filter,
            role: 'combobox',
            'aria-expanded': true,
            'aria-autocomplete': 'list',
            'aria-controls': listId,
            'aria-activedescendant': items[index] ? `${listId}-${items[index].id}` : undefined,
            autoComplete: 'off',
          },
        }}
      />
      <Box
        component="ul"
        id={listId}
        role="listbox"
        aria-label={th.tasks.status.label}
        sx={{ listStyle: 'none', m: 0, mt: 1, p: 0, maxHeight: 320, overflowY: 'auto' }}
      >
        {items.map((s, i) => (
          <Box
            component="li"
            key={s.id}
            id={`${listId}-${s.id}`}
            role="option"
            aria-selected={s.id === currentId}
            data-active={i === index ? 'true' : undefined}
            onMouseEnter={() => setActive(i)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(s.id)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1,
              py: 1,
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              bgcolor: i === index ? 'action.selected' : 'transparent',
              outline: i === index ? '1px solid' : 'none',
              outlineColor: 'primary.main',
            }}
          >
            <CategoryIcon category={s.category} />
            <ColorDot color={s.color} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" component="span" sx={{ display: 'block' }}>
                {s.name}
              </Typography>
              <Typography
                variant="caption"
                component="span"
                sx={{ display: 'block', color: 'text.secondary' }}
              >
                {th.tasks.status.categories[s.category]}
              </Typography>
            </Box>
            {s.id === currentId ? <CheckOutlined aria-hidden="true" sx={{ fontSize: 'var(--font-lg)' }} /> : null}
          </Box>
        ))}
      </Box>
    </>
  )
}
