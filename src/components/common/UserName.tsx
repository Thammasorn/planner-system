'use client'
import Tooltip from '@mui/material/Tooltip'
import { th } from '@/i18n/th'
import { displayName } from '@/lib/display-name'

export interface UserNameData {
  name: string
  nickname?: string | null
  positionName?: string | null
  /** default true; false adds the "(ปิดใช้งาน)" suffix (FR-205, AC-203) */
  active?: boolean
}

/**
 * The display name used everywhere (FR-210): nickname, else full name; hover/focus shows the full name and
 * position. Deactivated users carry a text suffix, never colour alone (SPEC §8.9).
 */
export function UserName({ user, className }: { user: UserNameData; className?: string }) {
  const text = user.active === false ? `${displayName(user)} ${th.users.deactivatedSuffix}` : displayName(user)
  return (
    <Tooltip title={th.users.tooltip(user.name, user.positionName ?? null)} describeChild>
      <span className={className} data-inactive={user.active === false ? 'true' : undefined}>
        {text}
      </span>
    </Tooltip>
  )
}
