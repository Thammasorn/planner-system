'use client'
import { useRef, useState, type KeyboardEvent } from 'react'
import { usePathname } from 'next/navigation'
import Skeleton from '@mui/material/Skeleton'
import Add from '@mui/icons-material/Add'
import BlockOutlined from '@mui/icons-material/BlockOutlined'
import ChevronRight from '@mui/icons-material/ChevronRight'
import DragIndicator from '@mui/icons-material/DragIndicator'
import ExpandMore from '@mui/icons-material/ExpandMore'
import LockOutlined from '@mui/icons-material/LockOutlined'
import type { Announcements } from '@dnd-kit/core'
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import Link from '@/components/Link'
import { SortableTree, type MoveIntent, type TreeRowState } from '@/components/tree/SortableTree'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { usePreferences } from '@/hooks/usePreferences'
import { th } from '@/i18n/th'
import { unwrap } from '@/lib/action-result'
import type { PageSpace, PageTreeNode, PageTreeResponse } from '@/lib/contracts/pages'
import { invalidatePages } from '@/lib/invalidate'
import {
  expandedPageIds,
  flattenPageTree,
  keyboardMoves,
  toggleExpanded,
  type TreeRow,
} from '@/lib/pages/tree'
import { qk } from '@/lib/query-keys'
import { movePage } from '@/server/actions/pages'
import { DEFAULT_PAGE_ICON } from './IconPicker'
import { PageActionsMenu } from './PageActionsMenu'
import { errorMessage, useCreatePage } from './usePageActions'
import { treeQueryOptions, usePageTreeRoots } from './usePageTree'
import styles from './PageTree.module.css'

/** Deepest page depth index (FR-502: 10 levels, 0…9). */
export const PAGE_MAX_DEPTH_INDEX = 9

export interface PageTreeProps {
  space: PageSpace
  projectId: string | null
  /** Accessible name of the tree (th.pages.tree.wikiLabel / projectLabel(name)). */
  label: string
  variant: 'sidebar' | 'full'
  /** Text when the space has no page (defaults to th.pages.tree.empty). */
  emptyLabel?: string
  onNavigate?: () => void
}

/** Ids of expanded rows whose children must be loaded: expanded, has children, and reachable through loaded levels. */
function reachableExpanded(
  roots: readonly PageTreeNode[],
  expanded: ReadonlySet<string>,
  cached: (id: string) => PageTreeResponse | undefined,
): string[] {
  const out: string[] = []
  const visit = (nodes: readonly PageTreeNode[]) => {
    for (const n of nodes) {
      if (!n.hasChildren || !expanded.has(n.id)) continue
      out.push(n.id)
      const d = cached(n.id)
      if (d) visit(d.nodes)
    }
  }
  visit(roots)
  return out
}

const titleOf = (n: { title: string }) => n.title || th.pages.untitled

/** The drag handle is pointer-only (no KeyboardSensor; the ⋯ menu is the keyboard path, FR-503): keep dnd-kit's
 *  listeners, drop its role / tabIndex / aria-roledescription / aria-describedby (English "sortable" semantics). */
function pointerOnly(props: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(props).filter(([k]) => /^on[A-Z]/.test(k)))
}

const ROW_SELECTOR = '[role="treeitem"][data-page-id]'

/**
 * Lazily loaded page tree of one space (FR-503, M4-D23) for the sidebar and the project เอกสาร tab: one query per
 * level (`GET /api/pages/tree`), expansion remembered in `sidebar.expanded` (`page:<id>`, X05), drag to reorder /
 * re-parent through M3's SortableTree (intent only; the server is the authority on depth and protection).
 */
export function PageTree({ space, projectId, label, variant, emptyLabel, onNavigate }: PageTreeProps) {
  const qc = useQueryClient()
  const pathname = usePathname()
  const isManager = useCurrentUser()?.role === 'manager'
  const { prefs, setPreference } = usePreferences()
  const stored = prefs['sidebar.expanded'] ?? []
  const expanded = expandedPageIds(stored)
  const roots = usePageTreeRoots(space, projectId)
  const rootNodes = roots.data?.nodes ?? []
  const toLoad = reachableExpanded(rootNodes, expanded, (id) =>
    qc.getQueryData<PageTreeResponse>(qk.pagesTree(space, projectId, id)),
  )
  const levels = useQueries({ queries: toLoad.map((id) => treeQueryOptions(space, projectId, id)) })
  const children = new Map<string, readonly PageTreeNode[]>()
  /** Level query of each expanded row: its pending / error state is shown under the row (SPEC P4, S3.3). */
  const levelOf = new Map<string, (typeof levels)[number]>()
  toLoad.forEach((id, i) => {
    const level = levels[i]
    if (!level) return
    levelOf.set(id, level)
    if (level.data) children.set(id, level.data.nodes)
  })
  const rows = flattenPageTree(rootNodes, children, expanded)
  const byId = new Map(rows.map((r) => [r.id, r]))
  const writable = roots.data?.canCreate ?? false
  const scope = { space, projectId }
  const { create } = useCreatePage()
  const treeRef = useRef<HTMLDivElement>(null)
  /** Roving tab stop (WAI-ARIA tree): the focused row, else the open page, else the first row. */
  const [focusId, setFocusId] = useState<string | null>(null)
  const current = rows.find((r) => pathname === `/p/${r.id}`)
  const activeId = (focusId && byId.has(focusId) ? focusId : (current?.id ?? rows[0]?.id)) ?? null

  const move = useMutation({
    mutationFn: (m: MoveIntent) =>
      unwrap(movePage({ pageId: m.id, parentId: m.parentId, afterId: m.afterId })),
    onError: (e) => toast.error(errorMessage(e, th.pages.toasts.moveFailed)),
    onSettled: () => invalidatePages(qc, scope),
  })

  const focusRow = (id: string | undefined) => {
    if (!id) return
    setFocusId(id)
    treeRef.current?.querySelector<HTMLElement>(`${ROW_SELECTOR}[data-page-id="${id}"]`)?.focus()
  }
  /** The empty state takes focus when the last row was deleted from its ⋯ menu (focus never lands on <body>). */
  const focusEmpty = useRef(false)
  /** A row is about to disappear (deleted from its ⋯ menu): focus the next visible row after its subtree, else the
   *  previous row, else the empty state — before the refetch unmounts the focused ⋯ button (SPEC §8.9; M2/M3 rule). */
  const focusAfterRemoval = (id: string) => {
    const i = rows.findIndex((r) => r.id === id)
    const row = rows[i]
    if (!row) return
    const next = rows.slice(i + 1).find((r) => r.depth <= row.depth)
    const target = next ?? rows[i - 1]
    if (target) focusRow(target.id)
    else focusEmpty.current = true
  }
  const setOpen = (id: string, open: boolean) =>
    setPreference('sidebar.expanded', toggleExpanded(stored, id, open))

  /** "ย้ายเข้าไปใต้หน้าก่อนหน้า": last child of the new parent (its level is fetched when not loaded yet). */
  const indentUnder = async (row: TreeRow, parentId: string) => {
    const parent = byId.get(parentId)
    let afterId: string | null = null
    if (parent?.node.hasChildren) {
      try {
        const level =
          children.get(parentId) ?? (await qc.query(treeQueryOptions(space, projectId, parentId))).nodes
        afterId = level.filter((n) => n.id !== row.id).at(-1)?.id ?? null
      } catch (e) {
        toast.error(errorMessage(e, th.pages.toasts.moveFailed))
        return
      }
    }
    if (!expanded.has(parentId)) setOpen(parentId, true) // the moved row stays visible
    move.mutate({ id: row.id, parentId, afterId })
  }

  const rowMoves = (row: TreeRow) => {
    const m = keyboardMoves(rows, row.id, PAGE_MAX_DEPTH_INDEX)
    const go = (to: { parentId: string | null; afterId: string | null } | null) =>
      to ? () => move.mutate({ id: row.id, ...to }) : undefined
    const indent = m.indent && !row.node.isCharter ? m.indent : null // the charter stays a root (M4-D6)
    return {
      up: go(m.up),
      down: go(m.down),
      indent: indent ? () => void indentUnder(row, indent.parentId) : undefined,
      outdent: go(m.outdent),
    }
  }

  /** WAI-ARIA tree keys on a focused row: ↑/↓ Home/End move focus, → expands / enters, ← collapses / goes up, Enter
   *  opens the page. Keys pressed on the row's own buttons and links are left to them. */
  const onRowKeyDown = (e: KeyboardEvent<HTMLDivElement>, row: TreeRow) => {
    if (e.target !== e.currentTarget || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    const i = rows.findIndex((r) => r.id === row.id)
    const isOpen = expanded.has(row.id)
    const handled = (() => {
      switch (e.code) {
        case 'ArrowDown':
          focusRow(rows[i + 1]?.id)
          return true
        case 'ArrowUp':
          focusRow(rows[i - 1]?.id)
          return true
        case 'Home':
          focusRow(rows[0]?.id)
          return true
        case 'End':
          focusRow(rows.at(-1)?.id)
          return true
        case 'ArrowRight':
          if (row.node.hasChildren && !isOpen) setOpen(row.id, true)
          else if (isOpen && rows[i + 1]?.parentId === row.id) focusRow(rows[i + 1]?.id)
          return true
        case 'ArrowLeft':
          if (row.node.hasChildren && isOpen) setOpen(row.id, false)
          else focusRow(row.parentId ?? undefined)
          return true
        case 'Enter':
        case 'NumpadEnter':
          e.currentTarget.querySelector<HTMLAnchorElement>('a[href]')?.click()
          return true
        default:
          return false
      }
    })()
    if (handled) e.preventDefault()
  }

  const announce = (id: string | number) => {
    const row = byId.get(String(id))
    return row ? titleOf(row.node) : th.pages.untitled
  }
  /** Thai live-region text with row titles — never dnd-kit's English defaults or raw page ids (SPEC §8.8). */
  const announcements: Announcements = {
    onDragStart: ({ active }) => th.pages.tree.dragStart(announce(active.id)),
    onDragOver: ({ active, over }) =>
      over ? th.pages.tree.dragOver(announce(active.id), announce(over.id)) : undefined,
    onDragEnd: ({ active }) => th.pages.tree.dragEnd(announce(active.id)),
    onDragCancel: ({ active }) => th.pages.tree.dragCancel(announce(active.id)),
  }
  const accessibility = {
    screenReaderInstructions: { draggable: th.pages.tree.dragInstructions },
    announcements,
  }

  const statusClass = variant === 'full' ? `${styles.status} ${styles.statusFull}` : styles.status

  if (roots.isPending) {
    return (
      <div aria-busy="true">
        <span className={styles.srOnly}>{th.common.loading}</span>
        {[0, 1].map((i) => (
          <div key={i} className={styles.skeleton} aria-hidden="true">
            <Skeleton variant="text" width={`${60 - i * 15}%`} />
          </div>
        ))}
      </div>
    )
  }
  if (roots.isError && !roots.data) {
    return (
      <div className={statusClass} role="alert">
        {th.pages.tree.loadError}
        <button type="button" className={styles.retry} onClick={() => void roots.refetch()}>
          {th.pages.tree.retry}
        </button>
      </div>
    )
  }
  if (rows.length === 0) {
    return (
      <div
        className={statusClass}
        tabIndex={-1}
        ref={(el) => {
          if (el && focusEmpty.current) {
            focusEmpty.current = false
            el.focus()
          }
        }}
      >
        {emptyLabel ?? th.pages.tree.empty}
      </div>
    )
  }

  const renderRow = (row: TreeRow, s: TreeRowState) => {
    const n = row.node
    const title = titleOf(n)
    const href = `/p/${n.id}`
    const isOpen = expanded.has(n.id)
    const rowEditable = writable && (isManager || !n.effectiveProtected)
    const parent = row.parentId ? byId.get(row.parentId) : undefined
    const parentProtected = parent?.node.effectiveProtected ?? false
    const canAddChild = rowEditable && n.depth < PAGE_MAX_DEPTH_INDEX
    const level = isOpen ? levelOf.get(n.id) : undefined
    const childrenPending = level?.isPending === true
    const childrenFailed = level !== undefined && level.isError && !level.data
    const childStyle = { paddingLeft: `calc(var(--indent) * ${s.depth + 1} + 40px)` }
    /** Inner controls are reachable with Tab only on the tab-stop row (one tab stop per tree; all stay clickable). */
    const inner = n.id === activeId ? 0 : -1
    return (
      <>
        <div
          role="treeitem"
          tabIndex={inner}
          onFocus={() => setFocusId(n.id)}
          onKeyDown={(e) => onRowKeyDown(e, row)}
          aria-level={s.depth + 1}
          aria-expanded={n.hasChildren ? isOpen : undefined}
          aria-busy={childrenPending ? true : undefined}
          // The focused element's name carries the row's states too (🔒, invalid drop): a descendant's role=img label is
          // replaced by aria-label, so a screen reader moving with the arrows would never hear them (FR-510, §8.9).
          aria-label={[title, n.effectiveProtected && th.pages.protectedIcon, s.invalid && th.pages.tree.dropInvalid]
            .filter(Boolean)
            .join(' ')}
          aria-selected={pathname === href}
          className={styles.row}
          style={{ paddingLeft: `calc(var(--indent) * ${s.depth})` }}
          data-dragging={s.dragging ? 'true' : undefined}
          data-page-id={n.id}
        >
          {rowEditable ? (
            <button
              type="button"
              ref={s.handleRef}
              {...pointerOnly(s.handleProps)}
              tabIndex={-1}
              className={styles.handle}
              aria-label={th.pages.tree.dragHandle}
            >
              <DragIndicator fontSize="inherit" />
            </button>
          ) : (
            <span className={styles.handleSpacer} />
          )}
          {n.hasChildren ? (
            <button
              type="button"
              className={styles.toggle}
              tabIndex={inner}
              aria-expanded={isOpen}
              aria-label={isOpen ? th.pages.tree.collapse(title) : th.pages.tree.expand(title)}
              onClick={() => setOpen(n.id, !isOpen)}
            >
              {isOpen ? <ExpandMore fontSize="small" /> : <ChevronRight fontSize="small" />}
            </button>
          ) : (
            <span className={styles.spacer} />
          )}
          <Link
            className={styles.link}
            tabIndex={inner}
            href={href}
            aria-current={pathname === href ? 'page' : undefined}
            onClick={onNavigate}
          >
            <span className={styles.icon} aria-hidden="true">
              {n.icon ?? DEFAULT_PAGE_ICON}
            </span>
            <span className={styles.title}>{title}</span>
          </Link>
          {n.effectiveProtected ? (
            <span className={styles.lock} role="img" aria-label={th.pages.protectedIcon}>
              <LockOutlined fontSize="inherit" />
            </span>
          ) : null}
          {s.invalid ? (
            <span className={styles.invalid} role="status">
              <BlockOutlined fontSize="inherit" />
              {th.pages.tree.dropInvalid}
            </span>
          ) : null}
          <span className={styles.actions}>
            {canAddChild ? (
              <button
                type="button"
                className={styles.action}
                tabIndex={inner}
                aria-label={th.pages.addChild(title)}
                onClick={() => void create({ space, projectId, parentId: n.id })}
              >
                <Add fontSize="small" />
              </button>
            ) : null}
            <PageActionsMenu
              className={styles.action}
              tabIndex={inner}
              moves={rowEditable ? rowMoves(row) : undefined}
              page={{ id: n.id, title: n.title, space, projectId, isCharter: n.isCharter, locked: n.locked }}
              can={{
                duplicate: writable && (isManager || !parentProtected),
                delete: rowEditable,
                protect: isManager && writable && space === 'WORKSPACE',
              }}
              navigateAfterDelete={pathname === href}
              onDeleted={() => focusAfterRemoval(n.id)}
            />
          </span>
        </div>
        {childrenPending ? (
          <div
            className={styles.childStatus}
            style={childStyle}
            aria-hidden="true"
            data-testid="tree-children-loading"
          >
            <Skeleton variant="text" width="50%" />
          </div>
        ) : null}
        {childrenFailed ? (
          <div
            role="treeitem"
            aria-level={s.depth + 2}
            aria-selected={false}
            className={styles.childStatus}
            style={childStyle}
          >
            <span role="alert">{th.pages.tree.loadError}</span>
            <button type="button" className={styles.retry} onClick={() => void level.refetch()}>
              {th.pages.tree.retry}
            </button>
          </div>
        ) : null}
      </>
    )
  }

  return (
    <div ref={treeRef} role="tree" aria-label={label} className={styles.tree} data-variant={variant}>
      <SortableTree<TreeRow>
        accessibility={accessibility}
        items={rows}
        fullItems={rows}
        maxDepthIndex={PAGE_MAX_DEPTH_INDEX}
        disabled={!writable}
        onMove={(m) => move.mutate(m)}
        renderRow={renderRow}
        renderOverlay={(row) => (
          <div className={styles.overlay}>
            <span className={styles.icon} aria-hidden="true">
              {row.node.icon ?? DEFAULT_PAGE_ICON}
            </span>
            <span className={styles.title}>{titleOf(row.node)}</span>
          </div>
        )}
      />
    </div>
  )
}
