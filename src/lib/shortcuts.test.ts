import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { SHORTCUT_KEY_LABELS, SHORTCUT_SCOPE_LABELS, SHORTCUT_SCOPES, SHORTCUTS } from './shortcuts'

describe('shortcut registry (X07)', () => {
  it('ids are unique', () => {
    const ids = SHORTCUTS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every scope is registered and has a Thai heading', () => {
    for (const s of SHORTCUTS) expect(SHORTCUT_SCOPES, s.id).toContain(s.scope)
    for (const scope of SHORTCUT_SCOPES) expect(SHORTCUT_SCOPE_LABELS[scope]).toBeTruthy()
  })

  it('every label is non-empty and every combo has a key label', () => {
    const keys: Record<string, string> = SHORTCUT_KEY_LABELS
    for (const s of SHORTCUTS) {
      expect(s.label.length, s.id).toBeGreaterThan(0)
      expect(s.combos.length, s.id).toBeGreaterThan(0)
      for (const combo of s.combos)
        for (const token of combo) expect(keys[token], `${s.id} ${token}`).toBeTruthy()
    }
  })
})

describe('grid scope (M6, X07)', () => {
  it('registers the grid entries under scope grid with the §4.8 keys', () => {
    const grid = SHORTCUTS.filter((s) => s.scope === 'grid')
    expect(grid.map((s) => s.id)).toEqual([
      'grid.edit',
      'grid.cancel',
      'grid.select',
      'grid.full',
      'grid.half',
      'grid.copy',
      'grid.paste',
      'grid.shift',
      'grid.clear',
      'grid.selectRow',
      'grid.newTask',
      'grid.expandWeek',
      'grid.collapseWeek',
      'grid.cellMenu',
      'grid.moveRow',
      'grid.indentRow',
      'grid.addMarker',
      'grid.milestoneOpen',
    ])
    expect(grid.find((s) => s.id === 'grid.full')?.combos).toEqual([['F']])
    expect(grid.find((s) => s.id === 'grid.shift')?.combos).toEqual([
      ['Mod', 'ArrowLeft'],
      ['Mod', 'ArrowRight'],
    ])
    expect(SHORTCUT_SCOPE_LABELS.grid).toBe(th.shortcuts.scopes.grid)
  })
})

describe('grid day entries (M7, KEY-07, X07)', () => {
  it('Cmd+↓ expands, Cmd+↑ collapses the view, Shift+F10 opens the cell menu', () => {
    const by = (id: string) => SHORTCUTS.find((s) => s.id === id)
    expect(by('grid.expandWeek')).toMatchObject({
      scope: 'grid',
      combos: [['Mod', 'ArrowDown']],
      label: th.shortcuts.items.gridExpandWeek,
    })
    expect(by('grid.collapseWeek')).toMatchObject({
      scope: 'grid',
      combos: [['Mod', 'ArrowUp']],
      label: th.shortcuts.items.gridCollapseWeek,
    })
    expect(by('grid.cellMenu')).toMatchObject({
      scope: 'grid',
      combos: [['Shift', 'F10']],
      label: th.shortcuts.items.gridCellMenu,
    })
    for (const id of ['grid.expandWeek', 'grid.collapseWeek', 'grid.cellMenu'])
      expect(by(id)?.label).not.toBe('')
  })
})

describe('task page (M6.1, FR-685/686)', () => {
  it('Shift+Space opens the page from the list; the taskPage scope has Esc and Enter', () => {
    expect(SHORTCUTS.find((s) => s.id === 'list.openPage')).toMatchObject({
      scope: 'taskList',
      combos: [['Shift', 'Space']],
      label: th.shortcuts.items.listOpenPage,
    })
    expect(SHORTCUTS.filter((s) => s.scope === 'taskPage').map((s) => [s.id, s.combos])).toEqual([
      ['taskPage.back', [['Esc']]],
      ['taskPage.titleEnter', [['Enter']]],
    ])
    expect(SHORTCUT_SCOPES.indexOf('taskPage')).toBe(SHORTCUT_SCOPES.indexOf('taskList') + 1)
    expect(SHORTCUT_SCOPE_LABELS.taskPage).toBe(th.shortcuts.scopes.taskPage)
  })
})

describe('grid rows and markers (M7.1, FR-815/819, X07)', () => {
  it('Alt+↑/↓ moves the row, Alt+→/← indents/outdents, Shift+F10 on a header adds a marker — listed in the help', () => {
    const by = (id: string) => SHORTCUTS.find((s) => s.id === id)
    expect(by('grid.moveRow')).toMatchObject({
      scope: 'grid',
      combos: [
        ['Alt', 'ArrowUp'],
        ['Alt', 'ArrowDown'],
      ],
      label: th.shortcuts.items.gridMoveRow,
    })
    expect(by('grid.indentRow')).toMatchObject({
      scope: 'grid',
      combos: [
        ['Alt', 'ArrowRight'],
        ['Alt', 'ArrowLeft'],
      ],
      label: th.shortcuts.items.gridIndentRow,
    })
    expect(by('grid.addMarker')).toMatchObject({
      scope: 'grid',
      combos: [['Shift', 'F10']],
      label: th.shortcuts.items.gridAddMarker,
    })
    // The `?` help renders SHORTCUTS grouped by SHORTCUT_SCOPES, so a registered grid entry is a listed one.
    expect(SHORTCUT_SCOPES).toContain('grid')
  })
})

describe('M8 grid ◆ entry (plan/m08 S0.7, M8-D10)', () => {
  it('grid.milestoneOpen = Enter in the grid scope; Shift+F10 stays the single grid.cellMenu entry for ◆', () => {
    expect(SHORTCUTS.find((s) => s.id === 'grid.milestoneOpen')).toMatchObject({
      scope: 'grid',
      combos: [['Enter']],
      label: th.shortcuts.items.gridMilestoneOpen,
    })
    expect(SHORTCUTS.filter((s) => /milestone/i.test(s.id)).map((s) => s.id)).toEqual(['grid.milestoneOpen'])
  })
})
