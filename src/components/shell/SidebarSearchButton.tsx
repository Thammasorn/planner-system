'use client'
import Tooltip from '@mui/material/Tooltip'
import SearchOutlined from '@mui/icons-material/SearchOutlined'
import { usePalette } from '@/components/palette/PaletteProvider'
import { th } from '@/i18n/th'
import styles from './SidebarSections.module.css'

/** "🔍 ค้นหา… ⌘K" at the top of the sidebar (SPEC §8.1, X08): opens the command palette; icon only in the rail. */
export function SidebarSearchButton({ collapsed }: { collapsed: boolean }) {
  const { open } = usePalette()
  const button = (
    <button
      type="button"
      className={styles.search}
      data-collapsed={String(collapsed)}
      aria-label={th.palette.open}
      aria-keyshortcuts="Control+K Meta+K"
      aria-haspopup="dialog"
      onClick={() => open()}
    >
      <SearchOutlined className={styles.searchIcon} fontSize="inherit" />
      {collapsed ? null : (
        <>
          <span className={styles.searchLabel}>{th.palette.open}</span>
          <kbd className={styles.kbd} aria-hidden="true">
            {th.palette.shortcut}
          </kbd>
        </>
      )}
    </button>
  )
  return collapsed ? (
    <Tooltip title={`${th.palette.open} ${th.palette.shortcut}`} placement="right">
      {button}
    </Tooltip>
  ) : (
    button
  )
}
