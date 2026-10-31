'use client'
// Shared sortable tree (FR-604; M4 reuses it for pages with maxDepthIndex 9). Based on
// plan/research/snippets/r4/client/components/tree/SortableTree.tsx with the M3 changes (S3.2, M3-D10/D11):
// PointerSensor only (no KeyboardSensor — Space/Enter belong to the outliner), handle-only listeners, intent-only
// onMove (the server makes the key), an icon + text for an invalid drop, and modifiers only on <DragOverlay> —
// never on DndContext, where they would zero delta.x and the depth would never change (r4 §19).
import { useMemo, useState, type ReactNode } from 'react'
import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DndContextProps,
  type DragStartEvent,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { getProjection, removeChildrenOf, subtreeHeight, type FlatItem } from '@/lib/tree/projection'

export const TREE_INDENT = 24

export type MoveIntent = { id: string; parentId: string | null; afterId: string | null }

export type HandleRef = (el: HTMLElement | null) => void

export interface TreeRowState {
  depth: number
  /** The dragged row has no valid drop position (depth cap): render an icon + text, not colour only. */
  invalid: boolean
  dragging: boolean
  /** Put both on the drag handle (listeners live only there, M3-D10). */
  handleRef: HandleRef
  handleProps: Record<string, unknown>
}

export interface SortableTreeProps<T extends FlatItem> {
  /** Visible rows in DFS order (collapsed subtrees removed). */
  items: readonly T[]
  /** Every row (subtree heights of collapsed rows). */
  fullItems: readonly FlatItem[]
  /** tasks 2 (TASK_MAX_DEPTH_INDEX), pages 9. */
  maxDepthIndex: number
  /** grouped / sorted / read-only views: no DnD at all. */
  disabled: boolean
  onMove: (m: MoveIntent) => void
  renderRow: (item: T, s: TreeRowState) => ReactNode
  /** Drag preview content (defaults to renderRow of the active item). */
  renderOverlay?: (item: T) => ReactNode
  /** Screen-reader instructions + live-region announcements (Thai, from th); dnd-kit's English defaults otherwise. */
  accessibility?: DndContextProps['accessibility']
}

const NO_HANDLE = { handleRef: () => {}, handleProps: {} } satisfies Pick<
  TreeRowState,
  'handleRef' | 'handleProps'
>

export function SortableTree<T extends FlatItem>({
  items,
  fullItems,
  maxDepthIndex,
  disabled,
  onMove,
  renderRow,
  renderOverlay,
  accessibility,
}: SortableTreeProps<T>) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [offsetX, setOffsetX] = useState(0)
  // removeChildrenOf filters, so the objects are still T
  const visible = useMemo(
    () => (activeId ? (removeChildrenOf(items, [activeId]) as T[]) : [...items]),
    [items, activeId],
  )
  const projection =
    activeId && overId
      ? getProjection(
          visible,
          activeId,
          overId,
          offsetX,
          TREE_INDENT,
          maxDepthIndex,
          subtreeHeight(fullItems, activeId),
        )
      : null
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  if (disabled) {
    return (
      <>
        {items.map((item) => (
          <div key={item.id}>
            {renderRow(item, { depth: item.depth, invalid: false, dragging: false, ...NO_HANDLE })}
          </div>
        ))}
      </>
    )
  }

  const reset = () => {
    setActiveId(null)
    setOverId(null)
    setOffsetX(0)
  }
  const active = activeId ? items.find((i) => i.id === activeId) : undefined

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={accessibility}
      onDragStart={({ active: a }: DragStartEvent) => {
        setActiveId(String(a.id))
        setOverId(String(a.id))
      }}
      onDragMove={({ delta }: DragMoveEvent) => setOffsetX(delta.x)}
      onDragOver={({ over }: DragOverEvent) => setOverId(over ? String(over.id) : null)}
      onDragEnd={({ active: a }: DragEndEvent) => {
        const p = projection
        reset()
        if (!p || !p.valid) return // invalid drop: nothing happens, like an over-limit Tab
        const id = String(a.id)
        const item = items.find((i) => i.id === id)
        if (!item) return
        // same place → no call
        const prevSibling = currentPrevSibling(fullItems, id)
        if (item.parentId === p.parentId && prevSibling === p.prevSiblingId) return
        onMove({ id, parentId: p.parentId, afterId: p.prevSiblingId })
      }}
      onDragCancel={reset}
    >
      <SortableContext items={visible.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        {visible.map((item) => (
          <SortableRow
            key={item.id}
            item={item}
            depth={item.id === activeId && projection?.valid ? projection.depth : item.depth}
            invalid={item.id === activeId && projection?.valid === false}
            renderRow={renderRow}
          />
        ))}
      </SortableContext>
      <DragOverlay modifiers={[restrictToVerticalAxis]}>
        {active
          ? (renderOverlay?.(active) ??
            renderRow(active, { depth: active.depth, invalid: false, dragging: true, ...NO_HANDLE }))
          : null}
      </DragOverlay>
    </DndContext>
  )
}

/** The previous sibling of `id` in DFS order (null for a first child). */
function currentPrevSibling(items: readonly FlatItem[], id: string): string | null {
  const item = items.find((i) => i.id === id)
  if (!item) return null
  let prev: string | null = null
  for (const i of items) {
    if (i.id === id) return prev
    if (i.parentId === item.parentId) prev = i.id
  }
  return prev
}

function SortableRow<T extends FlatItem>({
  item,
  depth,
  invalid,
  renderRow,
}: {
  item: T
  depth: number
  invalid: boolean
  renderRow: SortableTreeProps<T>['renderRow']
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id })
  return (
    <div
      ref={setNodeRef}
      data-dragging={isDragging ? 'true' : undefined}
      data-drop-invalid={invalid ? 'true' : undefined}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        outline: invalid ? '2px dashed currentColor' : undefined,
      }}
    >
      {renderRow(item, {
        depth,
        invalid,
        dragging: isDragging,
        handleRef: setActivatorNodeRef,
        handleProps: { ...attributes, ...listeners },
      })}
    </div>
  )
}
