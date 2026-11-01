'use client'
// Kanban board (SPEC v3.1 FR-660–664, X74, M3-D35): generic so /tasks, M9's person tab and M10's embed reuse it.
// Cross-column drag only (no reordering inside a column, FR-662), pointer-only from a handle (M3-D10); the keyboard
// path is the card's `S` status menu. Arrow keys move focus between cards (roving tabIndex).
import { createContext, useContext, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  closestCorners,
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import DragIndicator from '@mui/icons-material/DragIndicator'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { th } from '@/i18n/th'
import type { BoardColumn } from '@/lib/tasks/board'
import { CategoryIcon, StatusChip } from '../status/StatusChip'
import styles from './TaskBoard.module.css'

export interface TaskBoardProps<C extends { id: string }> {
  columns: readonly BoardColumn<C>[]
  /** Content only; TaskBoard wraps it in the draggable, focusable slot + handle. */
  renderCard: (card: C) => ReactNode
  /** Only when toColumnKey ≠ the card's column (FR-662); the caller maps key → status. */
  onMove: (cardId: string, toColumnKey: string) => void
  /** false → no handles, no drag, no footer. */
  canEdit: boolean
  /** e.g. the column quick add (FR-664); rendered only when canEdit. */
  footer?: (column: BoardColumn<C>) => ReactNode
  /** Accessible card name for the drag handle (defaults to the card id). */
  cardLabel?: (card: C) => string
}

/** Focus slot of one card: TaskCard reads its roving tabIndex from here. */
interface CardSlot {
  id: string
  tabIndex: 0 | -1
  onFocus: () => void
}
const CardSlotContext = createContext<CardSlot | null>(null)

/** Roving tabIndex + `data-board-card` for a card root (standalone use: always focusable). */
export function useCardSlot(id: string): {
  tabIndex: 0 | -1
  onFocus: () => void
  'data-board-card': string
} {
  const slot = useContext(CardSlotContext)
  return { tabIndex: slot?.tabIndex ?? 0, onFocus: slot?.onFocus ?? (() => {}), 'data-board-card': id }
}

export function columnLabel<C>(column: BoardColumn<C>): string {
  return column.status ? column.status.name : th.tasks.status.categories[column.category]
}

export function TaskBoard<C extends { id: string }>({
  columns,
  renderCard,
  onMove,
  canEdit,
  footer,
  cardLabel,
}: TaskBoardProps<C>) {
  const [focusId, setFocusId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const allIds = columns.flatMap((c) => c.cards.map((x) => x.id))
  const current = focusId !== null && allIds.includes(focusId) ? focusId : (allIds[0] ?? null)
  const columnOf = (cardId: string) => columns.find((c) => c.cards.some((x) => x.id === cardId))
  const active = activeId ? columnOf(activeId)?.cards.find((x) => x.id === activeId) : undefined

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-board-card]')
    if (!el || el !== e.target) return
    const id = el.dataset.boardCard as string
    const ci = columns.findIndex((c) => c.cards.some((x) => x.id === id))
    const col = columns[ci]
    if (!col) return
    const ri = col.cards.findIndex((x) => x.id === id)
    let target: string | undefined
    if (e.key === 'ArrowDown') target = col.cards[ri + 1]?.id
    else if (e.key === 'ArrowUp') target = col.cards[ri - 1]?.id
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const d = e.key === 'ArrowLeft' ? -1 : 1
      for (let k = ci + d; k >= 0 && k < columns.length; k += d) {
        const cards = (columns[k] as BoardColumn<C>).cards
        if (cards.length > 0) {
          target = cards[Math.min(ri, cards.length - 1)]?.id
          break
        }
      }
    } else return
    e.preventDefault()
    if (!target) return
    setFocusId(target)
    const root = e.currentTarget
    requestAnimationFrame(() =>
      root.querySelector<HTMLElement>(`[data-board-card="${CSS.escape(target)}"]`)?.focus(),
    )
  }

  const onDragStart = ({ active: a }: DragStartEvent) => setActiveId(String(a.id))
  const onDragEnd = ({ active: a, over }: DragEndEvent) => {
    setActiveId(null)
    if (!over) return
    const from = columnOf(String(a.id))
    const to = String(over.id)
    if (from && from.key !== to) onMove(String(a.id), to)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className={styles.board} role="region" aria-label={th.tasks.board.label} onKeyDown={onKeyDown}>
        {columns.map((col) => (
          <Column key={col.key} column={col} canEdit={canEdit} footer={footer}>
            {col.cards.map((card) => (
              <CardSlotContext
                key={card.id}
                value={{
                  id: card.id,
                  tabIndex: card.id === current ? 0 : -1,
                  onFocus: () => setFocusId(card.id),
                }}
              >
                <DraggableCard id={card.id} canEdit={canEdit} label={cardLabel?.(card) ?? card.id}>
                  {renderCard(card)}
                </DraggableCard>
              </CardSlotContext>
            ))}
          </Column>
        ))}
      </div>
      <DragOverlay>{active ? <div className={styles.overlay}>{renderCard(active)}</div> : null}</DragOverlay>
    </DndContext>
  )
}

function Column<C>({
  column,
  canEdit,
  footer,
  children,
}: {
  column: BoardColumn<C>
  canEdit: boolean
  footer: ((column: BoardColumn<C>) => ReactNode) | undefined
  children: ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key, disabled: !canEdit })
  const name = columnLabel(column)
  return (
    <div
      ref={setNodeRef}
      role="group"
      aria-label={th.tasks.board.column(name, column.cards.length)}
      className={styles.column}
      data-column-key={column.key}
      data-over={isOver ? 'true' : undefined}
    >
      <div className={styles.columnHeader}>
        {column.status ? (
          <StatusChip status={column.status} />
        ) : (
          <Box
            component="span"
            sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontWeight: 'var(--weight-bold)' }}
          >
            <CategoryIcon category={column.category} />
            {name}
          </Box>
        )}
        <Typography component="span" variant="body2" sx={{ color: 'text.secondary' }}>
          {column.cards.length}
        </Typography>
      </div>
      <div className={styles.cards}>
        {children}
        {column.cards.length === 0 ? <span className={styles.empty}>{th.tasks.board.empty}</span> : null}
      </div>
      {canEdit && footer ? <div className={styles.footer}>{footer(column)}</div> : null}
    </div>
  )
}

function DraggableCard({
  id,
  canEdit,
  label,
  children,
}: {
  id: string
  canEdit: boolean
  label: string
  children: ReactNode
}) {
  const { setNodeRef, setActivatorNodeRef, listeners, attributes, isDragging } = useDraggable({
    id,
    disabled: !canEdit,
  })
  return (
    <div ref={setNodeRef} className={styles.slot} data-dragging={isDragging ? 'true' : undefined}>
      {canEdit ? (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          tabIndex={-1}
          className={styles.handle}
          aria-label={th.tasks.board.cardDragHandle(label)}
        >
          <DragIndicator sx={{ fontSize: 'var(--font-lg)' }} />
        </button>
      ) : null}
      <div className={styles.slotBody}>{children}</div>
    </div>
  )
}
