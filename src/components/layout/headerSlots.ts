'use client'
// src/components/layout/headerSlots.ts — the slot elements of the mounted PageHeaderBar (M6.1-D19/D26). A tiny external
// store (one header bar per screen) so `HeaderActions` and the editor's portals reach the bar without a provider.
// While two bars overlap (a route transition) the newest one wins; an unmounting bar clears only its own elements.
import { useSyncExternalStore } from 'react'

export type HeaderSlotName = 'status' | 'lease' | 'actions'

type Slots = Readonly<Record<HeaderSlotName, HTMLElement | null>>

let slots: Slots = { status: null, lease: null, actions: null }
const listeners = new Set<() => void>()
const SERVER: Slots = { status: null, lease: null, actions: null }

function emit(): void {
  for (const l of listeners) l()
}

/** Called by PageHeaderBar's ref callbacks. */
export function setHeaderSlot(name: HeaderSlotName, el: HTMLElement | null): void {
  if (slots[name] === el) return
  slots = { ...slots, [name]: el }
  emit()
}

/** Ref-callback cleanup: clears the slot only while it still points at `el` (a newer bar keeps its slot). */
export function clearHeaderSlot(name: HeaderSlotName, el: HTMLElement): void {
  if (slots[name] !== el) return
  slots = { ...slots, [name]: null }
  emit()
}

/** React 19 ref callback with cleanup for one slot. */
export function slotRef(name: HeaderSlotName): (el: HTMLElement | null) => (() => void) | undefined {
  return (el) => {
    if (!el) return undefined
    setHeaderSlot(name, el)
    return () => clearHeaderSlot(name, el)
  }
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useHeaderSlots(): Slots {
  return useSyncExternalStore(
    subscribe,
    () => slots,
    () => SERVER,
  )
}
