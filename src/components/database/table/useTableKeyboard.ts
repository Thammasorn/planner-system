'use client'
// src/components/database/table/useTableKeyboard.ts — keyboard of the table view while no cell is being edited
// (FR-1421/1422, §8.6, X49 — e.code first): arrows move · Tab / Shift+Tab next / previous cell (wrapping rows) ·
// Enter edits (checkbox: toggles; on "+ แถวใหม่": creates) · Esc clears the selection · Delete / Backspace clears the
// cell or deletes the selected rows · Space opens the row panel on a title cell / toggles a checkbox · typing a
// character starts editing with it (replace, like Excel) · Alt+Shift+↑/↓ moves the row (no sorts). Row index
// `rowCount` is the "+ แถวใหม่" row.
import { type KeyboardEvent, useCallback } from 'react'
import type { DbColumnType } from '@/lib/contracts/databases'

export interface CellPos {
  row: number
  col: number
}

export interface TableKeyboardModel {
  rowCount: number
  colCount: number
  /** The "+ แถวใหม่" row exists (editable table). */
  hasNewRow: boolean
  canEdit: boolean
  active: CellPos
  setActive: (p: CellPos) => void
  typeAt: (col: number) => DbColumnType
  edit: (p: CellPos, initialText?: string) => void
  toggle: (p: CellPos) => void
  clear: (p: CellPos) => void
  open: (row: number) => void
  createRow: () => void
  hasSelection: boolean
  clearSelection: () => void
  deleteSelected: () => void
  /** Alt+Shift+↑/↓: move the row one place (manual order). */
  moveRow: (row: number, delta: -1 | 1) => void
}

const code = (e: KeyboardEvent, ...codes: string[]): boolean =>
  codes.includes(e.code) || codes.includes(e.key)

export function useTableKeyboard(m: TableKeyboardModel): (e: KeyboardEvent) => void {
  return useCallback(
    (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.nativeEvent.isComposing) return
      const mod = e.metaKey || e.ctrlKey || e.altKey
      const { row, col } = m.active
      const lastRow = m.hasNewRow ? m.rowCount : m.rowCount - 1
      const onNewRow = m.hasNewRow && row === m.rowCount
      const move = (p: CellPos) => {
        e.preventDefault()
        m.setActive({
          row: Math.max(0, Math.min(lastRow, p.row)),
          col: Math.max(0, Math.min(m.colCount - 1, p.col)),
        })
      }
      if (e.altKey && e.shiftKey && !e.metaKey && !e.ctrlKey && !onNewRow && m.canEdit) {
        if (code(e, 'ArrowUp') || code(e, 'ArrowDown')) {
          e.preventDefault()
          m.moveRow(row, code(e, 'ArrowUp') ? -1 : 1)
        }
        return
      }
      if (mod) return
      if (code(e, 'ArrowDown')) return move({ row: row + 1, col })
      if (code(e, 'ArrowUp')) return move({ row: row - 1, col })
      if (code(e, 'ArrowRight')) return onNewRow ? undefined : move({ row, col: col + 1 })
      if (code(e, 'ArrowLeft')) return onNewRow ? undefined : move({ row, col: col - 1 })
      if (code(e, 'Home')) return move({ row, col: 0 })
      if (code(e, 'End')) return move({ row, col: m.colCount - 1 })
      if (code(e, 'Tab')) {
        if (onNewRow) return // leave the grid
        const next = e.shiftKey ? col - 1 : col + 1
        if (next >= 0 && next < m.colCount) return move({ row, col: next })
        const r = e.shiftKey ? row - 1 : row + 1
        if (r < 0 || r >= m.rowCount) return // first / last cell: Tab leaves the grid
        return move({ row: r, col: e.shiftKey ? m.colCount - 1 : 0 })
      }
      if (code(e, 'Escape')) {
        if (m.hasSelection) {
          e.preventDefault()
          e.stopPropagation()
          m.clearSelection()
        }
        return
      }
      if (onNewRow) {
        if (code(e, 'Enter', 'NumpadEnter') || code(e, 'Space', ' ')) {
          e.preventDefault()
          m.createRow()
        }
        return
      }
      if (m.rowCount === 0) return
      const type = m.typeAt(col)
      if (code(e, 'Enter', 'NumpadEnter')) {
        if (!m.canEdit) return
        e.preventDefault()
        if (type === 'CHECKBOX') m.toggle(m.active)
        else m.edit(m.active)
        return
      }
      if (code(e, 'Space', ' ')) {
        if (type === 'TITLE') {
          e.preventDefault()
          m.open(row)
        } else if (type === 'CHECKBOX' && m.canEdit) {
          e.preventDefault()
          m.toggle(m.active)
        }
        return
      }
      if (code(e, 'Delete', 'Backspace')) {
        if (!m.canEdit) return
        e.preventDefault()
        if (m.hasSelection) m.deleteSelected()
        else m.clear(m.active)
        return
      }
      if (m.canEdit && e.key.length === 1 && type !== 'CHECKBOX') {
        e.preventDefault()
        m.edit(m.active, e.key)
      }
    },
    [m],
  )
}
