'use client'
import { useState, type ReactNode } from 'react'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import MenuIcon from '@mui/icons-material/Menu'
import { CommandPalette } from '@/components/palette/CommandPalette'
import { PaletteProvider } from '@/components/palette/PaletteProvider'
import { useHotkeys } from '@/hooks/useHotkeys'
import { usePreferences } from '@/hooks/usePreferences'
import { th } from '@/i18n/th'
import { HOTKEYS } from '@/lib/keys'
import { ShortcutHelp } from './ShortcutHelp'
import { Sidebar } from './Sidebar'
import styles from './AppShell.module.css'

/** App chrome (SPEC §8.1, X33): skip link, collapsible sidebar (Cmd/Ctrl+\), a temporary Drawer under 900 px,
 *  the main landmark and the command palette (Cmd/Ctrl+K, X08 — mounted once here). The collapsed state is the
 *  `sidebar.collapsed` preference (saved, debounced — X05). */
export function AppShell({ children }: { children: ReactNode }) {
  const { prefs, setPreference } = usePreferences()
  const collapsed = prefs['sidebar.collapsed']
  const [drawerOpen, setDrawerOpen] = useState(false)
  const toggle = () => setPreference('sidebar.collapsed', !collapsed)
  useHotkeys([{ hotkey: HOTKEYS.toggleSidebar, handler: toggle }])
  return (
    <PaletteProvider>
      <div className={styles.shell} data-collapsed={String(collapsed)}>
        <a className={styles.skipLink} href="#main">
          {th.nav.skipToContent}
        </a>
        <aside
          id="app-sidebar"
          data-testid="app-sidebar"
          data-collapsed={String(collapsed)}
          className={styles.sidebar}
        >
          <Sidebar collapsed={collapsed} onToggle={toggle} />
        </aside>
        <header className={styles.mobileBar}>
          <IconButton aria-label={th.nav.openMenu} onClick={() => setDrawerOpen(true)}>
            <MenuIcon />
          </IconButton>
          <span className={styles.mobileTitle}>{th.meta.appName}</span>
        </header>
        <Drawer
          variant="temporary"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          slotProps={{ paper: { 'aria-label': th.nav.sidebarLabel, sx: { width: 264 } } }}
        >
          <Sidebar collapsed={false} onNavigate={() => setDrawerOpen(false)} />
        </Drawer>
        <main id="main" tabIndex={-1} className={styles.main}>
          {children}
        </main>
        <ShortcutHelp />
        <CommandPalette />
      </div>
    </PaletteProvider>
  )
}
