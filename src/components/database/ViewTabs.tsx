'use client'
// src/components/database/ViewTabs.tsx — AFFiNE-like view tabs (FR-1405/1406): click / arrow keys switch (the selected
// tab is local UI state, never saved), "+" adds a view of a type, each tab's ⋯ renames / duplicates / deletes (delete
// disabled for the last view; undo toast from the data layer), tabs reorder by drag (dnd-kit, keyboard sensor too).
// Read-only viewers only switch (FR-1461).
import { closestCenter, DndContext, type DragEndEvent } from '@dnd-kit/core'
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers'
import { horizontalListSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Add from '@mui/icons-material/Add'
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined'
import MoreHoriz from '@mui/icons-material/MoreHoriz'
import TableChartOutlined from '@mui/icons-material/TableChartOutlined'
import ViewKanbanOutlined from '@mui/icons-material/ViewKanbanOutlined'
import IconButton from '@mui/material/IconButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { type JSX, type KeyboardEvent, type PointerEventHandler, useRef, useState } from 'react'
import { DB_LIMITS } from '@/domain/database'
import { th } from '@/i18n/th'
import type { DbViewDTO, DbViewType } from '@/lib/contracts/databases'
import { previousId, sameDbId } from '@/lib/database/optimistic'
import { useDbApi } from './data/contract'
import { dndAccessibility, usePointerSensors } from './dnd'
import s from './DatabaseBlock.module.css'

const VIEW_TYPES: readonly DbViewType[] = ['TABLE', 'KANBAN', 'CALENDAR']

export function ViewIcon({ type }: { type: DbViewType }): JSX.Element {
  const Icon =
    type === 'TABLE' ? TableChartOutlined : type === 'KANBAN' ? ViewKanbanOutlined : CalendarMonthOutlined
  return <Icon aria-hidden="true" fontSize="inherit" />
}

/** DOM id of a view's tab, so the tabpanel can be labelled by the selected tab (aria-labelledby). */
export function viewTabId(panelId: string, viewId: string): string {
  return `${panelId}-tab-${viewId}`
}

export interface ViewTabsProps {
  selectedId: string
  onSelect: (viewId: string) => void
  /** id of the element showing the selected view (aria-controls). */
  panelId: string
}

export function ViewTabs(p: ViewTabsProps): JSX.Element {
  const api = useDbApi()
  const views = api.db.views
  const sensors = usePointerSensors()
  const listRef = useRef<HTMLDivElement>(null)
  const [addAnchor, setAddAnchor] = useState<HTMLElement | null>(null)
  const [menu, setMenu] = useState<{ id: string; anchor: HTMLElement } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const t = th.database.views

  const focusTab = (id: string) =>
    [...(listRef.current?.querySelectorAll<HTMLElement>('[data-view-id]') ?? [])]
      .find((el) => el.dataset.viewId === id)
      ?.focus()
  const onKeyDown = (e: KeyboardEvent) => {
    const i = views.findIndex((v) => sameDbId(v.id, p.selectedId))
    let j = -1
    if (e.code === 'ArrowRight' || e.key === 'ArrowRight') j = (i + 1) % views.length
    else if (e.code === 'ArrowLeft' || e.key === 'ArrowLeft') j = (i - 1 + views.length) % views.length
    else if (e.code === 'Home' || e.key === 'Home') j = 0
    else if (e.code === 'End' || e.key === 'End') j = views.length - 1
    if (j < 0 || renaming !== null) return
    e.preventDefault()
    const v = views[j]!
    p.onSelect(v.id)
    focusTab(v.id)
  }
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = views.findIndex((v) => v.id === active.id)
    const to = views.findIndex((v) => v.id === over.id)
    if (from < 0 || to < 0) return
    // after the drop the view sits right after `to`'s left neighbour (moving left) or after `to` (moving right)
    const after = to < from ? previousId(views, views[to]!.id) : views[to]!.id
    api.updateView(String(active.id), { afterViewId: after }, th.database.undo.viewConfig)
  }
  const add = (type: DbViewType) => {
    setAddAnchor(null)
    void api.createView(type).then((id) => {
      if (id !== '') p.onSelect(id)
    })
  }
  const menuView = menu ? views.find((v) => sameDbId(v.id, menu.id)) : undefined

  return (
    <div className={s.tabsBar}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToHorizontalAxis]}
        onDragEnd={onDragEnd}
        accessibility={dndAccessibility((id) => views.find((v) => v.id === id)?.name ?? '')}
      >
        <SortableContext items={views.map((v) => v.id)} strategy={horizontalListSortingStrategy}>
          <div ref={listRef} role="tablist" aria-label={t.tabsLabel} className={s.tabs} onKeyDown={onKeyDown}>
            {views.map((v) => (
              <ViewTab
                key={v.id}
                view={v}
                selected={sameDbId(v.id, p.selectedId)}
                panelId={p.panelId}
                canEdit={api.canEdit}
                renaming={renaming === v.id}
                onSelect={() => p.onSelect(v.id)}
                onMenu={(anchor) => setMenu({ id: v.id, anchor })}
                onRename={(name) => {
                  setRenaming(null)
                  const n = name.trim()
                  if (n !== '' && n !== v.name) api.updateView(v.id, { name: n }, th.database.undo.viewConfig)
                  focusTab(v.id)
                }}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {api.canEdit ? (
        <IconButton
          size="small"
          aria-label={t.add}
          disabled={views.length >= DB_LIMITS.views}
          onClick={(e) => setAddAnchor(e.currentTarget)}
        >
          <Add fontSize="small" />
        </IconButton>
      ) : null}
      <Menu anchorEl={addAnchor} open={addAnchor !== null} onClose={() => setAddAnchor(null)}>
        {VIEW_TYPES.map((type) => (
          <MenuItem key={type} onClick={() => add(type)}>
            <ListItemIcon>
              <ViewIcon type={type} />
            </ListItemIcon>
            <ListItemText>{t[type]}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
      <Menu
        // the tab re-mounts when a new view's temp id becomes its server id: fall back to its live element so the
        // menu never positions against a detached node (top-left corner) — same fix as the column menu
        anchorEl={
          menu
            ? () =>
                menu.anchor.isConnected
                  ? menu.anchor
                  : ([...(listRef.current?.querySelectorAll<HTMLElement>('[data-view-id]') ?? [])].find(
                      (el) => sameDbId(el.dataset.viewId ?? '', menu.id),
                    ) ?? menu.anchor)
            : null
        }
        open={menu !== null && menuView !== undefined}
        onClose={() => setMenu(null)}
      >
        <MenuItem
          onClick={() => {
            setMenu(null)
            if (menuView) setRenaming(menuView.id)
          }}
        >
          {t.rename}
        </MenuItem>
        <MenuItem
          disabled={!menuView || views[0]?.id === menuView.id}
          onClick={() => {
            setMenu(null)
            if (!menuView) return
            const i = views.findIndex((v) => v.id === menuView.id)
            api.updateView(
              menuView.id,
              { afterViewId: i >= 2 ? views[i - 2]!.id : null },
              th.database.undo.viewConfig,
            )
          }}
        >
          {t.moveLeft}
        </MenuItem>
        <MenuItem
          disabled={!menuView || views[views.length - 1]?.id === menuView.id}
          onClick={() => {
            setMenu(null)
            if (!menuView) return
            const i = views.findIndex((v) => v.id === menuView.id)
            api.updateView(menuView.id, { afterViewId: views[i + 1]!.id }, th.database.undo.viewConfig)
          }}
        >
          {t.moveRight}
        </MenuItem>
        <MenuItem
          disabled={views.length >= DB_LIMITS.views}
          onClick={() => {
            setMenu(null)
            if (!menuView) return
            void api.createView(menuView.type, { copyFromViewId: menuView.id }).then((id) => {
              if (id !== '') p.onSelect(id)
            })
          }}
        >
          {t.duplicate}
        </MenuItem>
        <MenuItem
          disabled={views.length <= 1}
          onClick={() => {
            setMenu(null)
            if (!menuView) return
            if (sameDbId(menuView.id, p.selectedId)) {
              const other = views.find((v) => !sameDbId(v.id, menuView.id))
              if (other) p.onSelect(other.id)
            }
            api.deleteView(menuView.id)
          }}
        >
          <ListItemText
            primary={t.delete}
            secondary={views.length <= 1 ? th.database.errors.lastView : undefined}
          />
        </MenuItem>
      </Menu>
    </div>
  )
}

function ViewTab(p: {
  view: DbViewDTO
  selected: boolean
  panelId: string
  canEdit: boolean
  renaming: boolean
  onSelect: () => void
  onMenu: (anchor: HTMLElement) => void
  onRename: (name: string) => void
}): JSX.Element {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: p.view.id,
    disabled: !p.canEdit || p.renaming,
  })
  const [draft, setDraft] = useState(p.view.name)
  const done = useRef(false)
  return (
    <div
      ref={setNodeRef}
      className={s.tabWrap}
      data-selected={p.selected}
      data-dragging={isDragging || undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {p.renaming ? (
        <input
          className={s.tabInput}
          aria-label={th.database.views.rename}
          value={draft}
          maxLength={DB_LIMITS.name}
          autoFocus
          onFocus={(e) => e.target.select()}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.nativeEvent.isComposing) return
            if (e.key === 'Enter') {
              done.current = true
              p.onRename(draft)
            } else if (e.key === 'Escape') {
              done.current = true
              p.onRename(p.view.name)
            }
          }}
          onBlur={() => {
            if (!done.current) p.onRename(draft)
            done.current = false
          }}
        />
      ) : (
        <button
          type="button"
          role="tab"
          id={viewTabId(p.panelId, p.view.id)}
          className={s.tab}
          data-view-id={p.view.id}
          aria-selected={p.selected}
          aria-controls={p.panelId}
          tabIndex={p.selected ? 0 : -1}
          onClick={p.onSelect}
          // pointer drag only: Enter / Space / arrows stay the tablist's (keyboard reorder = ⋯ ย้ายซ้าย / ขวา)
          onPointerDown={
            p.canEdit
              ? (listeners?.onPointerDown as PointerEventHandler<HTMLButtonElement> | undefined)
              : undefined
          }
        >
          <span className={s.tabIcon}>
            <ViewIcon type={p.view.type} />
          </span>
          <span className={s.tabLabel}>{p.view.name}</span>
        </button>
      )}
      {p.canEdit && p.selected && !p.renaming ? (
        <IconButton
          size="small"
          className={s.tabMore}
          aria-label={`${th.database.toolbar.more} ${p.view.name}`}
          onClick={(e) => p.onMenu(e.currentTarget)}
        >
          <MoreHoriz fontSize="inherit" />
        </IconButton>
      ) : null}
    </div>
  )
}
