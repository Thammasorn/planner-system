'use client'
// Classic dnd-kit (core 6.3.1 + sortable 10.0.0) sortable tree. Do NOT put restrictToVerticalAxis on
// DndContext: modifiers are applied before event.delta is computed, so delta.x would always be 0.
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { generateKeyBetween } from 'fractional-indexing'
import { useMemo, useState, type ReactNode } from 'react'
import { getProjection, removeChildrenOf, subtreeHeight, type FlatItem } from './tree-projection'

const INDENT = 24

export type MoveTo = { id: string; parentId: string | null; position: string }

export function SortableTree({
  items, // flattened DFS order (collapsed subtrees already removed)
  maxDepthIndex, // tasks: 2 (3 levels) · pages: 9 (10 levels)
  onMove, // -> server action (moveTask/movePage) — the SERVER re-validates depth & regenerates the key
  renderLabel,
}: {
  items: readonly FlatItem[]
  maxDepthIndex: number
  onMove: (m: MoveTo) => void
  renderLabel: (item: FlatItem) => ReactNode
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [offsetX, setOffsetX] = useState(0)
  const visible = useMemo(() => (activeId ? removeChildrenOf(items, [activeId]) : [...items]), [items, activeId])
  const projection =
    activeId && overId
      ? getProjection(visible, activeId, overId, offsetX, INDENT, maxDepthIndex, subtreeHeight(items, activeId))
      : null
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const byId = (id: string | null) => (id ? items.find((i) => i.id === id) : undefined)
  const reset = () => {
    setActiveId(null)
    setOverId(null)
    setOffsetX(0)
  }
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={({ active }: DragStartEvent) => {
        setActiveId(String(active.id))
        setOverId(String(active.id))
      }}
      onDragMove={({ delta }: DragMoveEvent) => setOffsetX(delta.x)}
      onDragOver={({ over }: DragOverEvent) => setOverId(over ? String(over.id) : null)}
      onDragEnd={({ active }: DragEndEvent) => {
        const p = projection
        reset()
        if (!p || !p.valid) return // invalid drop (depth cap) -> nothing happens, like Tab beyond level 3
        const position = generateKeyBetween(byId(p.prevSiblingId)?.position ?? null, byId(p.nextSiblingId)?.position ?? null)
        onMove({ id: String(active.id), parentId: p.parentId, position })
      }}
      onDragCancel={reset}
    >
      <SortableContext items={visible.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        {visible.map((item) => (
          <TreeRow
            key={item.id}
            item={item}
            depth={item.id === activeId && projection?.valid ? projection.depth : item.depth}
            invalid={item.id === activeId && projection?.valid === false}
            label={renderLabel(item)}
          />
        ))}
      </SortableContext>
      <DragOverlay>{activeId ? renderLabel(byId(activeId) ?? { id: activeId, parentId: null, depth: 0, position: '' }) : null}</DragOverlay>
    </DndContext>
  )
}

function TreeRow({ item, depth, invalid, label }: { item: FlatItem; depth: number; invalid: boolean; label: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        paddingLeft: depth * INDENT,
        opacity: isDragging ? 0.4 : 1,
        outline: invalid ? '2px dashed currentColor' : undefined, // + an icon/text in the real UI (not colour only)
      }}
      {...attributes}
      {...listeners}
    >
      {label}
    </div>
  )
}
