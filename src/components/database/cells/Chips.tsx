'use client'
// src/components/database/cells/Chips.tsx — option chips (name on a token colour, FR-1410 / §8.9 never colour alone)
// and person chips (avatar + display name + "ปิดใช้งาน", M11-D33).
import type { JSX } from 'react'
import { UserAvatar } from '@/components/common/UserAvatar'
import type { SelectOption } from '@/domain/types'
import { th } from '@/i18n/th'
import type { DbPersonRef } from '@/lib/contracts/databases'
import { displayName } from '@/lib/display-name'
import s from './cells.module.css'

export function OptionChip({ option }: { option: Pick<SelectOption, 'name' | 'color'> }): JSX.Element {
  return (
    <span className={s.chip} data-color={option.color} data-testid="db-option-chip">
      <span className={s.chipLabel}>{option.name}</span>
    </span>
  )
}

export function PersonChip({ person }: { person: DbPersonRef | undefined }): JSX.Element {
  if (!person)
    return (
      <span className={`${s.person} ${s.muted}`} data-testid="db-person-chip">
        {th.database.cells.unknownPerson}
      </span>
    )
  return (
    <span className={s.person} data-testid="db-person-chip">
      <UserAvatar user={{ ...person, active: !person.deactivated }} size={18} />
      <span className={s.chipLabel}>{displayName(person)}</span>
      {person.deactivated ? <span className={s.badge}>{th.database.cells.deactivated}</span> : null}
    </span>
  )
}
