'use client'
// ↗ "เปิดเป็นหน้า" and 📄 "มีรายละเอียด" — shared by the list rows, board cards, /my, /tasks and the task properties
// (FR-685, FR-691, M6.1-D17). ↗ is a real link (Cmd/Ctrl/middle-click = new tab); a plain click remembers the list's
// scroll position first so ← / Esc on the task page come back to the same place (FR-686, M6.1-D18).
import NorthEastOutlined from '@mui/icons-material/NorthEastOutlined'
import type { MouseEvent } from 'react'
import Link from '@/components/Link'
import { th } from '@/i18n/th'
import { rememberScroll } from '@/lib/nav/scroll-memory'
import { isPlainClick, taskPageHref } from '@/lib/nav/task-href'
import styles from './TaskRow.module.css'

export function OpenAsPageLink({
  taskId,
  label = th.tasks.openAsPage,
  tabIndex,
  alwaysVisible = false,
}: {
  taskId: string
  label?: string
  /** -1 inside roving-focus containers (treegrid rows, board cards). */
  tabIndex?: number
  /** Show without hover (e.g. in the subtask list of the task page). */
  alwaysVisible?: boolean
}) {
  return (
    <Link
      href={taskPageHref(taskId)}
      aria-label={label}
      title={label}
      tabIndex={tabIndex}
      data-open-page=""
      className={alwaysVisible ? styles.iconButton : `${styles.iconButton} ${styles.open}`}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        // the row / card click opens the panel — this link only navigates (and never selects)
        e.stopPropagation()
        if (isPlainClick(e)) rememberScroll()
      }}
    >
      <NorthEastOutlined aria-hidden="true" sx={{ fontSize: 'var(--font-lg)' }} />
    </Link>
  )
}

/** 📄 beside the name when the task's body is not blank (FR-691): text name + tooltip, not colour. */
export function HasBodyMark() {
  return (
    <span role="img" aria-label={th.tasks.hasBody} title={th.tasks.hasBody} className={styles.bodyMark}>
      📄
    </span>
  )
}
