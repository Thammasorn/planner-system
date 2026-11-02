'use client'
// src/components/database/cells/typeIcons.tsx — the column type icon (FR-1410 "หัวคอลัมน์มีไอคอนชนิดเสมอ"); decorative,
// the type name is always given as text or as the accessible name next to it.
import ArrowDropDownCircleOutlined from '@mui/icons-material/ArrowDropDownCircleOutlined'
import CalendarTodayOutlined from '@mui/icons-material/CalendarTodayOutlined'
import CheckBoxOutlined from '@mui/icons-material/CheckBoxOutlined'
import ChecklistOutlined from '@mui/icons-material/ChecklistOutlined'
import LinkOutlined from '@mui/icons-material/LinkOutlined'
import Notes from '@mui/icons-material/Notes'
import Numbers from '@mui/icons-material/Numbers'
import PersonOutlineOutlined from '@mui/icons-material/PersonOutlineOutlined'
import TextFields from '@mui/icons-material/TextFields'
import type { SvgIconComponent } from '@mui/icons-material'
import type { JSX } from 'react'
import type { DbColumnType } from '@/lib/contracts/databases'

const ICONS: Record<DbColumnType, SvgIconComponent> = {
  TITLE: TextFields,
  TEXT: Notes,
  NUMBER: Numbers,
  SELECT: ArrowDropDownCircleOutlined,
  MULTI_SELECT: ChecklistOutlined,
  DATE: CalendarTodayOutlined,
  CHECKBOX: CheckBoxOutlined,
  PERSON: PersonOutlineOutlined,
  URL: LinkOutlined,
}

/** Types offered by "+ column" and "เปลี่ยนชนิด" (TITLE is fixed). */
export const USER_COLUMN_TYPES: readonly Exclude<DbColumnType, 'TITLE'>[] = [
  'TEXT',
  'NUMBER',
  'SELECT',
  'MULTI_SELECT',
  'DATE',
  'CHECKBOX',
  'PERSON',
  'URL',
]

export function TypeIcon({ type }: { type: DbColumnType }): JSX.Element {
  const Icon = ICONS[type]
  return <Icon aria-hidden="true" fontSize="inherit" data-type-icon={type} />
}
