'use client'
import type { MouseEvent } from 'react'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined'
import PauseCircleOutlined from '@mui/icons-material/PauseCircleOutlined'
import RadioButtonUncheckedOutlined from '@mui/icons-material/RadioButtonUncheckedOutlined'
import TimelapseOutlined from '@mui/icons-material/TimelapseOutlined'
import type { TaskStatusCategory } from '@/domain/types'
import { th } from '@/i18n/th'
import type { StatusRef } from '@/lib/contracts/tasks'
import { VisuallyHidden } from '@/components/common/VisuallyHidden'

/** Category glyph (FR-627, §8.10): the shape carries the category, never the colour alone. */
export const CATEGORY_ICONS: Record<TaskStatusCategory, typeof CheckCircleOutlined> = {
  TODO: RadioButtonUncheckedOutlined,
  IN_PROGRESS: TimelapseOutlined,
  WAITING: PauseCircleOutlined,
  DONE: CheckCircleOutlined,
}

export function CategoryIcon({ category }: { category: TaskStatusCategory }) {
  const Icon = CATEGORY_ICONS[category]
  return <Icon aria-hidden="true" sx={{ fontSize: 16 }} data-category={category} />
}

/** Decorative 8 px dot in the status colour (M3-D25: text stays in the default foreground). */
export function ColorDot({ color }: { color: string }) {
  return (
    <Box
      component="span"
      aria-hidden="true"
      data-color={color}
      sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, flex: 'none', display: 'inline-block' }}
    />
  )
}

/**
 * Status chip (FR-626/627): category icon + name + colour dot + a visually hidden category label. When `onClick` is
 * given it is a popup button (`aria-haspopup="dialog"`) that opens StatusMenu (combobox + listbox in a popover).
 */
export function StatusChip({
  status,
  onClick,
  size = 'small',
  disabled,
  tabIndex,
}: {
  status: StatusRef
  onClick?: ((e: MouseEvent<HTMLElement>) => void) | undefined
  size?: 'small' | 'medium'
  disabled?: boolean | undefined
  /** -1 inside a roving-focus row/card, where `S` opens the menu instead (M3-D22). */
  tabIndex?: number | undefined
}) {
  const label = (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
      <ColorDot color={status.color} />
      <span>{status.name}</span>
      <VisuallyHidden>{th.tasks.status.categories[status.category]}</VisuallyHidden>
    </Box>
  )
  const common = {
    size,
    variant: 'outlined' as const,
    icon: <CategoryIcon category={status.category} />,
    label,
    'data-status-id': status.id,
    'data-category': status.category,
    sx: { height: size === 'small' ? 24 : 32, maxWidth: 220, color: 'text.primary' },
  }
  if (onClick && !disabled) {
    return (
      <Chip
        {...common}
        clickable
        onClick={onClick}
        {...(tabIndex !== undefined ? { tabIndex } : {})}
        aria-haspopup="dialog"
        aria-label={th.tasks.status.menuLabel(status.name)}
      />
    )
  }
  return <Chip {...common} />
}
