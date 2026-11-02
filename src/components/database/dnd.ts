'use client'
// src/components/database/dnd.ts — shared dnd-kit setup of the database views (M11-D22/D24): pointer (small distance so
// clicks stay clicks) + keyboard sensors, and Thai screen-reader text (dnd-kit's defaults are English).
import {
  type DndContextProps,
  KeyboardSensor,
  PointerSensor,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { th } from '@/i18n/th'

export function useDbSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
}

/** Pointer only — for items whose keys belong to another widget (tabs); they offer a menu alternative. */
export function usePointerSensors() {
  return useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
}

/** Thai instructions / announcements; `nameOf` turns a draggable id into what is read out. */
export function dndAccessibility(nameOf: (id: UniqueIdentifier) => string): DndContextProps['accessibility'] {
  const t = th.database.dnd
  return {
    screenReaderInstructions: { draggable: t.instructions },
    announcements: {
      onDragStart: ({ active }) => t.start(nameOf(active.id)),
      onDragOver: ({ active, over }) => (over ? t.over(nameOf(active.id), nameOf(over.id)) : undefined),
      onDragEnd: ({ active }) => t.end(nameOf(active.id)),
      onDragCancel: ({ active }) => t.cancel(nameOf(active.id)),
    },
  }
}
