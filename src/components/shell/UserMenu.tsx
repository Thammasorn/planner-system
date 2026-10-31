'use client'
import { useId, useState, type MouseEvent } from 'react'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import ListSubheader from '@mui/material/ListSubheader'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Tooltip from '@mui/material/Tooltip'
import { useColorScheme } from '@mui/material/styles'
import AccountCircleOutlined from '@mui/icons-material/AccountCircleOutlined'
import Check from '@mui/icons-material/Check'
import EventBusyOutlined from '@mui/icons-material/EventBusyOutlined'
import Logout from '@mui/icons-material/Logout'
import { useLogout } from '@/components/account/useLogout'
import { useOptionalLeaveDialog } from '@/components/calendar/LeaveDialogProvider'
import { UserAvatar } from '@/components/common/UserAvatar'
import Link from '@/components/Link'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { usePreferences } from '@/hooks/usePreferences'
import { th } from '@/i18n/th'
import { THEMES, type Theme } from '@/lib/schemas/preferences'

/**
 * Bottom of the sidebar (SPEC §8.1, X33): avatar + display name opening a menu with บัญชีของฉัน, แจ้งลา (M5-D14: the
 * leave dialog from any page), the theme choice (saved to user_preferences, applied at once through MUI's colour
 * scheme) and ออกจากระบบ.
 */
export function UserMenu({ collapsed }: { collapsed: boolean }) {
  const user = useCurrentUser()
  const { prefs, setPreference } = usePreferences()
  const { setMode } = useColorScheme()
  const { logout, pending } = useLogout()
  const leaveDialog = useOptionalLeaveDialog()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const menuId = useId()
  if (!user) return null

  const open = anchor !== null
  const close = () => setAnchor(null)
  const onOpen = (e: MouseEvent<HTMLElement>) => setAnchor(e.currentTarget)
  const chooseTheme = (t: Theme) => {
    setMode(t)
    setPreference('theme', t)
    close()
  }
  const trigger = {
    'aria-label': th.nav.userMenu,
    'aria-haspopup': 'menu' as const,
    'aria-expanded': open,
    'aria-controls': open ? menuId : undefined,
    onClick: onOpen,
  }

  return (
    <>
      {collapsed ? (
        <Tooltip title={user.displayName} placement="right">
          <IconButton {...trigger} sx={{ mx: 'auto', display: 'flex' }}>
            <UserAvatar user={user} />
          </IconButton>
        </Tooltip>
      ) : (
        <Button
          {...trigger}
          color="inherit"
          fullWidth
          startIcon={<UserAvatar user={user} />}
          sx={{ justifyContent: 'flex-start', textTransform: 'none', fontWeight: 500, minWidth: 0 }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user.displayName}
          </span>
        </Button>
      )}
      <Menu
        id={menuId}
        anchorEl={anchor}
        open={open}
        onClose={close}
        anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ list: { 'aria-label': th.nav.userMenu, dense: true } }}
      >
        <MenuItem component={Link} href="/account/password" onClick={close}>
          <ListItemIcon>
            <AccountCircleOutlined fontSize="small" />
          </ListItemIcon>
          <ListItemText>{th.nav.account}</ListItemText>
        </MenuItem>
        {leaveDialog ? (
          <MenuItem
            onClick={() => {
              close()
              leaveDialog.open({ mode: 'create' })
            }}
          >
            <ListItemIcon>
              <EventBusyOutlined fontSize="small" />
            </ListItemIcon>
            <ListItemText>{th.nav.reportLeave}</ListItemText>
          </MenuItem>
        ) : null}
        <Divider />
        <ListSubheader disableSticky sx={{ lineHeight: '32px' }}>
          {th.prefs.theme}
        </ListSubheader>
        {THEMES.map((t) => {
          const checked = prefs.theme === t
          return (
            <MenuItem key={t} role="menuitemradio" aria-checked={checked} onClick={() => chooseTheme(t)}>
              {/* the check mark + aria-checked carry the state (not colour) */}
              <ListItemIcon>{checked ? <Check fontSize="small" /> : null}</ListItemIcon>
              <ListItemText>{th.prefs.themes[t]}</ListItemText>
            </MenuItem>
          )
        })}
        <Divider />
        <MenuItem
          disabled={pending}
          onClick={() => {
            close()
            logout()
          }}
        >
          <ListItemIcon>
            <Logout fontSize="small" />
          </ListItemIcon>
          <ListItemText>{th.nav.logout}</ListItemText>
        </MenuItem>
      </Menu>
    </>
  )
}
