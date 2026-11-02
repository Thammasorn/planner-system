'use client'
import { useMemo, useState, type ReactNode } from 'react'
import Drawer from '@mui/material/Drawer'
import { LeaveDialogProvider } from '@/components/calendar/LeaveDialogProvider'
import { InAppHistoryProvider } from '@/components/layout/InAppHistory'
import { ShellDrawerContext, type ShellDrawerApi } from '@/components/layout/ShellDrawer'
import { CommandPalette } from '@/components/palette/CommandPalette'
import { PaletteProvider } from '@/components/palette/PaletteProvider'
import { useHotkeys } from '@/hooks/useHotkeys'
import { usePreferences } from '@/hooks/usePreferences'
import { th } from '@/i18n/th'
import { HOTKEYS } from '@/lib/keys'
import { ShortcutHelp } from './ShortcutHelp'
import { Sidebar } from './Sidebar'
import styles from './AppShell.module.css'

export { useShellDrawer } from '@/components/layout/ShellDrawer'

/** App chrome (SPEC §8.1, X33): skip link, collapsible sidebar (Cmd/Ctrl+\), a temporary Drawer under 900 px (opened
 *  by ☰ in each screen's PageHeaderBar through `useShellDrawer()` — M6.1-D19 replaced the separate mobile bar), the
 *  main landmark and the command palette (Cmd/Ctrl+K, X08 — mounted once here). The collapsed state is the
 *  `sidebar.collapsed` preference (saved, debounced — X05). The one leave dialog (M5-D14) is hosted here so the
 *  user menu, /calendar and later pages open it through `useLeaveDialog()`. */
export function AppShell({
  children,
  initialWorkloadOver = 0,
}: {
  children: ReactNode
  /** M9-D11 (X31): the Workload ทีม ●N computed by the (app) layout. */
  initialWorkloadOver?: number
}) {
  const { prefs, setPreference } = usePreferences()
  const collapsed = prefs['sidebar.collapsed']
  const [drawerOpen, setDrawerOpen] = useState(false)
  const drawer = useMemo<ShellDrawerApi>(() => ({ open: () => setDrawerOpen(true) }), [])
  const toggle = () => setPreference('sidebar.collapsed', !collapsed)
  useHotkeys([{ hotkey: HOTKEYS.toggleSidebar, handler: toggle }])
  return (
    <PaletteProvider>
      <LeaveDialogProvider>
        <ShellDrawerContext.Provider value={drawer}>
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
              <Sidebar collapsed={collapsed} onToggle={toggle} initialWorkloadOver={initialWorkloadOver} />
            </aside>
            <Drawer
              variant="temporary"
              open={drawerOpen}
              onClose={() => setDrawerOpen(false)}
              slotProps={{
                paper: { 'aria-label': th.nav.sidebarLabel, sx: { width: 'var(--sidebar-width)' } },
              }}
            >
              <Sidebar
                collapsed={false}
                onNavigate={() => setDrawerOpen(false)}
                initialWorkloadOver={initialWorkloadOver}
              />
            </Drawer>
            <main id="main" tabIndex={-1} className={styles.main}>
              <InAppHistoryProvider>{children}</InAppHistoryProvider>
            </main>
            <ShortcutHelp />
            <CommandPalette />
          </div>
        </ShellDrawerContext.Provider>
      </LeaveDialogProvider>
    </PaletteProvider>
  )
}
