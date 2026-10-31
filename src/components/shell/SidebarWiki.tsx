'use client'
import { useId } from 'react'
import Tooltip from '@mui/material/Tooltip'
import Add from '@mui/icons-material/Add'
import MenuBookOutlined from '@mui/icons-material/MenuBookOutlined'
import { PageTree } from '@/components/pages/PageTree'
import { useCreatePage } from '@/components/pages/usePageActions'
import { th } from '@/i18n/th'
import styles from './SidebarSections.module.css'

/** Sidebar "Wiki ทีม" section (SPEC §8.1, FR-506, M4-D27): header with `+` for every user, then the wiki tree. */
export function SidebarWiki({ onNavigate }: { onNavigate: (() => void) | undefined }) {
  const { create, pending } = useCreatePage()
  const headingId = useId()
  return (
    <section className={styles.section} aria-labelledby={headingId} data-testid="sidebar-wiki">
      <div className={styles.header}>
        <h2 id={headingId} className={styles.heading}>
          <MenuBookOutlined className={styles.headingIcon} fontSize="inherit" />
          <span>{th.sidebar.wikiHeading}</span>
        </h2>
        <Tooltip title={th.sidebar.newWikiPage}>
          <button
            type="button"
            className={styles.add}
            aria-label={th.sidebar.newWikiPage}
            disabled={pending}
            onClick={() => {
              onNavigate?.()
              void create({ space: 'WORKSPACE', projectId: null, parentId: null })
            }}
          >
            <Add fontSize="small" />
          </button>
        </Tooltip>
      </div>
      <PageTree
        space="WORKSPACE"
        projectId={null}
        label={th.pages.tree.wikiLabel}
        variant="sidebar"
        onNavigate={onNavigate}
      />
    </section>
  )
}
