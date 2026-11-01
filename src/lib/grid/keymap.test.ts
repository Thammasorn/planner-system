import { describe, expect, it } from 'vitest'
import { asciiForCode, gridKeyAction } from './keymap'

type E = Parameters<typeof gridKeyAction>[0]
const k = (code: string, o: Partial<E> = {}): E => ({
  code,
  key: o.key ?? '',
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  isComposing: false,
  ...o,
})
const nav = { rowSelected: false }

describe('gridKeyAction (§4.8, X49, M6-D27/D32)', () => {
  it('digits start editing with their ASCII char on the Kedmanee layout', () => {
    expect(gridKeyAction(k('Digit3', { key: 'ๅ' }), 'nav', nav)).toEqual({ kind: 'startEdit', char: '3' })
    expect(gridKeyAction(k('Numpad7', { key: '7' }), 'nav', nav)).toEqual({ kind: 'startEdit', char: '7' })
    expect(gridKeyAction(k('Period', { key: 'ใ' }), 'nav', nav)).toEqual({ kind: 'startEdit', char: '.' })
    expect(gridKeyAction(k('Comma', { key: 'ม' }), 'nav', nav)).toEqual({ kind: 'startEdit', char: ',' })
  })
  it('f / h apply capacity keys (ด / ้ on Kedmanee)', () => {
    expect(gridKeyAction(k('KeyF', { key: 'ด' }), 'nav', nav)).toEqual({ kind: 'full' })
    expect(gridKeyAction(k('KeyH', { key: '้' }), 'nav', nav)).toEqual({ kind: 'half' })
  })
  it('Cmd/Ctrl+←/→ shift the values', () => {
    expect(gridKeyAction(k('ArrowRight', { metaKey: true }), 'nav', nav)).toEqual({ kind: 'shift', dir: 1 })
    expect(gridKeyAction(k('ArrowLeft', { ctrlKey: true }), 'nav', nav)).toEqual({ kind: 'shift', dir: -1 })
    expect(gridKeyAction(k('ArrowRight', { ctrlKey: true }), 'nav', nav)).toEqual({ kind: 'shift', dir: 1 })
  })
  it('arrows move; Shift extends', () => {
    expect(gridKeyAction(k('ArrowDown'), 'nav', nav)).toEqual({ kind: 'move', dr: 1, dc: 0, extend: false })
    expect(gridKeyAction(k('ArrowDown', { shiftKey: true }), 'nav', nav)).toEqual({
      kind: 'move',
      dr: 1,
      dc: 0,
      extend: true,
    })
    expect(gridKeyAction(k('ArrowLeft'), 'nav', nav)).toEqual({ kind: 'move', dr: 0, dc: -1, extend: false })
  })
  it('edit mode: Enter / Tab / Shift+Tab commit, Escape cancels, other keys go to the input', () => {
    expect(gridKeyAction(k('Enter'), 'edit', nav)).toEqual({ kind: 'commit', dir: 'down' })
    expect(gridKeyAction(k('Tab'), 'edit', nav)).toEqual({ kind: 'commit', dir: 'right' })
    expect(gridKeyAction(k('Tab', { shiftKey: true }), 'edit', nav)).toEqual({ kind: 'commit', dir: 'left' })
    expect(gridKeyAction(k('Escape'), 'edit', nav)).toEqual({ kind: 'cancel' })
    expect(gridKeyAction(k('Digit1'), 'edit', nav)).toBeNull()
    expect(gridKeyAction(k('ArrowLeft'), 'edit', nav)).toBeNull()
  })
  it('nav mode: Enter moves down, Tab right, Escape cancels, F2 edits', () => {
    expect(gridKeyAction(k('Enter'), 'nav', nav)).toEqual({ kind: 'move', dr: 1, dc: 0, extend: false })
    expect(gridKeyAction(k('Tab'), 'nav', nav)).toEqual({ kind: 'move', dr: 0, dc: 1, extend: false })
    expect(gridKeyAction(k('Tab', { shiftKey: true }), 'nav', nav)).toEqual({
      kind: 'move',
      dr: 0,
      dc: -1,
      extend: false,
    })
    expect(gridKeyAction(k('Tab'), 'nav', { rowSelected: false, hasSelection: false })).toBeNull()
    expect(gridKeyAction(k('Escape'), 'nav', nav)).toEqual({ kind: 'cancel' })
    expect(gridKeyAction(k('F2'), 'nav', nav)).toEqual({ kind: 'startEdit', char: '' })
  })
  it('Delete / Backspace clear, or delete a selected task row', () => {
    expect(gridKeyAction(k('Delete'), 'nav', { rowSelected: true })).toEqual({ kind: 'deleteRow' })
    expect(gridKeyAction(k('Delete'), 'nav', nav)).toEqual({ kind: 'clear' })
    expect(gridKeyAction(k('Backspace'), 'nav', nav)).toEqual({ kind: 'clear' })
  })
  it('ignores IME composition', () => {
    expect(gridKeyAction(k('Digit1', { isComposing: true }), 'nav', nav)).toBeNull()
  })
  it('Mod+S flushes; N adds a task; undo / redo', () => {
    expect(gridKeyAction(k('KeyS', { metaKey: true }), 'nav', nav)).toEqual({ kind: 'flush' })
    expect(gridKeyAction(k('KeyS', { metaKey: true }), 'edit', nav)).toEqual({ kind: 'flush' })
    expect(gridKeyAction(k('KeyN', { key: 'ื' }), 'nav', nav)).toEqual({ kind: 'newTask' })
    expect(gridKeyAction(k('KeyZ', { metaKey: true }), 'nav', nav)).toEqual({ kind: 'undo' })
    expect(gridKeyAction(k('KeyZ', { ctrlKey: true, shiftKey: true }), 'nav', nav)).toEqual({ kind: 'redo' })
  })
  it('leaves Mod+C / Mod+V to the DOM copy / paste events', () => {
    expect(gridKeyAction(k('KeyC', { metaKey: true }), 'nav', nav)).toBeNull()
    expect(gridKeyAction(k('KeyV', { metaKey: true }), 'nav', nav)).toBeNull()
  })
  it('Shift+Space selects the row (keyboard path to deleteRow)', () => {
    expect(gridKeyAction(k('Space', { shiftKey: true }), 'nav', nav)).toEqual({ kind: 'selectRow' })
  })
})

describe('M7 keys (KEY-07, M7-D11, X49)', () => {
  it('Mod+ArrowDown → expandWeek (Cmd, Ctrl, Thai layout)', () => {
    expect(gridKeyAction(k('ArrowDown', { metaKey: true }), 'nav', nav)).toEqual({ kind: 'expandWeek' })
    expect(gridKeyAction(k('ArrowDown', { ctrlKey: true }), 'nav', nav)).toEqual({ kind: 'expandWeek' })
    expect(gridKeyAction(k('ArrowDown', { key: 'ArrowDown', metaKey: true }), 'nav', nav)).toEqual({ kind: 'expandWeek' })
  })
  it('Mod+ArrowUp → collapseWeek', () => {
    expect(gridKeyAction(k('ArrowUp', { ctrlKey: true }), 'nav', nav)).toEqual({ kind: 'collapseWeek' })
  })
  it('Shift+F10 and the ContextMenu key → cellMenu', () => {
    expect(gridKeyAction(k('F10', { shiftKey: true }), 'nav', nav)).toEqual({ kind: 'cellMenu' })
    expect(gridKeyAction(k('ContextMenu'), 'nav', nav)).toEqual({ kind: 'cellMenu' })
    expect(gridKeyAction(k('F10'), 'nav', nav)).toBeNull()
  })
  it('a plain ArrowDown still moves', () => {
    expect(gridKeyAction(k('ArrowDown'), 'nav', nav)).toEqual({ kind: 'move', dr: 1, dc: 0, extend: false })
  })
  it('in edit mode Mod+ArrowDown stays with the editor', () => {
    expect(gridKeyAction(k('ArrowDown', { metaKey: true }), 'edit', nav)).toBeNull()
  })
})

describe('asciiForCode', () => {
  it('maps digits, numpad, period, comma and minus', () => {
    expect(asciiForCode('Digit0')).toBe('0')
    expect(asciiForCode('Numpad9')).toBe('9')
    expect(asciiForCode('NumpadDecimal')).toBe('.')
    expect(asciiForCode('Period')).toBe('.')
    expect(asciiForCode('Comma')).toBe(',')
    expect(asciiForCode('Minus')).toBe('-')
    expect(asciiForCode('NumpadSubtract')).toBe('-')
    expect(asciiForCode('KeyA')).toBeNull()
  })
})
