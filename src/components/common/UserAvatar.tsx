'use client'
import Avatar from '@mui/material/Avatar'
import { initialOf } from '@/lib/display-name'
import { USER_COLORS } from '@/lib/user-colors'

export interface UserAvatarData {
  name: string
  nickname?: string | null
  color?: string | null
  active?: boolean
}

/**
 * Solid grey for deactivated users (MUI grey.700, ≈ 6.2:1 with white text). Not dimmed with opacity: blending with
 * the page background would drop the initial below the 4.5:1 that SPEC §8.9 / X51 require in light and dark mode.
 */
export const INACTIVE_AVATAR_BG = '#616161' // token-scale-ok: data colour (MUI grey.700), contrast-tested with white

/**
 * Initial on the user's palette colour (M1-D20; every colour ≥ 4.5:1 with white text). Decorative: the name is
 * always rendered next to it, so it is `aria-hidden`. Deactivated users are greyed, but the state is carried by
 * the name's text suffix (UserName), never by colour alone.
 */
export function UserAvatar({ user, size = 28 }: { user: UserAvatarData; size?: number }) {
  const inactive = user.active === false
  const color = user.color ?? USER_COLORS[0]
  return (
    <Avatar
      aria-hidden="true"
      data-testid="user-avatar"
      data-color={color}
      data-inactive={inactive ? 'true' : undefined}
      sx={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.5),
        fontWeight: 'var(--weight-bold)',
        color: 'common.white',
        bgcolor: inactive ? INACTIVE_AVATAR_BG : color,
      }}
    >
      {initialOf(user)}
    </Avatar>
  )
}
