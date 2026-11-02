import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PREFERENCES,
  preferenceInput,
  preferencesSchema,
  GRID_PREFERENCE_DEFAULTS,
  gridPreference,
  paletteLastProjectId,
  PLAN_PREFERENCE_DEFAULTS,
  planPreference,
  TASK_PREFERENCE_DEFAULTS,
  taskPreference,
} from './preferences'

describe('preferences (X05, M1-D17)', () => {
  it("U-SCH-10 preferencesSchema.parse({ theme: 'neon', x: 1 }) → defaults; unknown keys rejected by preferenceInput", () => {
    expect(preferencesSchema.parse({ theme: 'neon', x: 1 })).toEqual({
      theme: 'system',
      'sidebar.collapsed': false,
    })
    expect(preferencesSchema.parse({})).toEqual(DEFAULT_PREFERENCES)
    expect(preferencesSchema.parse({ theme: 'dark', 'sidebar.collapsed': true })).toEqual({
      theme: 'dark',
      'sidebar.collapsed': true,
    })
    expect(preferenceInput.safeParse({ key: 'grid.nope', value: 'WEEK' }).success).toBe(false) // undefined key
    expect(preferenceInput.safeParse({ key: 'theme', value: 'neon' }).success).toBe(false)
    expect(preferenceInput.safeParse({ key: 'sidebar.collapsed', value: true }).success).toBe(true)
  })

  it('sidebar.expanded (M2, X05): optional array of node keys; bad stored values fall back to absent', () => {
    const key = 'project:6f1c1d2e-3b4a-4c5d-8e9f-0a1b2c3d4e5f'
    expect(preferenceInput.safeParse({ key: 'sidebar.expanded', value: [key] }).success).toBe(true)
    expect(preferenceInput.safeParse({ key: 'sidebar.expanded', value: ['x'.repeat(81)] }).success).toBe(
      false,
    )
    expect(preferenceInput.safeParse({ key: 'sidebar.expanded', value: Array(501).fill('a') }).success).toBe(
      false,
    )
    expect(preferencesSchema.parse({ 'sidebar.expanded': [key] })['sidebar.expanded']).toEqual([key])
    expect(preferencesSchema.parse({ 'sidebar.expanded': 'oops' })['sidebar.expanded']).toBeUndefined()
    expect('sidebar.expanded' in preferencesSchema.parse({})).toBe(false)
  })

  it('M3 task keys (S0.13): one valid and one invalid value each; absent or bad stored values → defaults', () => {
    const cases: Array<[string, unknown, unknown]> = [
      ['tasks.groupBy', 'status', 'project'],
      ['tasks.sort', 'due', 'name'],
      ['tasks.showCompleted', false, 'no'],
      ['tasks.view', 'BOARD', 'board'],
      ['tasks.board.leafOnly', true, 1],
      ['tasks.board.hideDone', true, null],
    ]
    for (const [key, good, bad] of cases) {
      expect(preferenceInput.safeParse({ key, value: good }).success, key).toBe(true)
      expect(preferenceInput.safeParse({ key, value: bad }).success, key).toBe(false)
      expect(preferencesSchema.parse({ [key]: good })[key as keyof typeof TASK_PREFERENCE_DEFAULTS]).toBe(
        good,
      )
      expect(
        preferencesSchema.parse({ [key]: bad })[key as keyof typeof TASK_PREFERENCE_DEFAULTS],
        key,
      ).toBeUndefined()
      expect(key in preferencesSchema.parse({}), key).toBe(false)
    }
    expect(preferencesSchema.parse({})).toEqual(DEFAULT_PREFERENCES)
    expect(taskPreference(DEFAULT_PREFERENCES, 'tasks.showCompleted')).toBe(true)
    expect(taskPreference(DEFAULT_PREFERENCES, 'tasks.groupBy')).toBe('none')
    expect(taskPreference(DEFAULT_PREFERENCES, 'tasks.view')).toBe('LIST')
    expect(taskPreference({ ...DEFAULT_PREFERENCES, 'tasks.view': 'BOARD' }, 'tasks.view')).toBe('BOARD')
    expect(TASK_PREFERENCE_DEFAULTS).toEqual({
      'tasks.groupBy': 'none',
      'tasks.sort': 'manual',
      'tasks.showCompleted': true,
      'tasks.view': 'LIST',
      'tasks.board.leafOnly': false,
      'tasks.board.hideDone': false,
    })
  })
})

describe('grid preferences (M6-D21)', () => {
  it('grid.unit DAYS|FRACTION and load.view ALL|COMMITTED|AT_RISK parse; other values fail', () => {
    expect(preferenceInput.safeParse({ key: 'grid.unit', value: 'DAYS' }).success).toBe(true)
    expect(preferenceInput.safeParse({ key: 'grid.unit', value: 'FRACTION' }).success).toBe(true)
    expect(preferenceInput.safeParse({ key: 'grid.unit', value: 'MONTH' }).success).toBe(false)
    expect(preferenceInput.safeParse({ key: 'load.view', value: 'AT_RISK' }).success).toBe(true)
    expect(preferenceInput.safeParse({ key: 'load.view', value: 'SOME' }).success).toBe(false)
  })

  it('absent or invalid stored values read as the defaults', () => {
    const prefs = preferencesSchema.parse({ 'grid.unit': 'MONTH' })
    expect(prefs['grid.unit']).toBeUndefined()
    expect(gridPreference(prefs, 'grid.unit')).toBe('DAYS')
    expect(gridPreference(prefs, 'load.view')).toBe('ALL')
    expect(GRID_PREFERENCE_DEFAULTS).toEqual({
      'grid.unit': 'DAYS',
      'load.view': 'ALL',
      'grid.zoom': 'WEEK',
      'grid.showAssignees': true,
      'grid.taskColumnWidth': 240,
      'grid.chart': false,
    })
    const stored = preferencesSchema.parse({ 'grid.unit': 'FRACTION', 'load.view': 'COMMITTED' })
    expect(gridPreference(stored, 'grid.unit')).toBe('FRACTION')
    expect(gridPreference(stored, 'load.view')).toBe('COMMITTED')
  })
})

describe('grid.zoom preference (M7, FR-802, X59)', () => {
  it('WEEK | DAY parse; MONTH fails', () => {
    expect(preferenceInput.safeParse({ key: 'grid.zoom', value: 'DAY' }).success).toBe(true)
    expect(preferenceInput.safeParse({ key: 'grid.zoom', value: 'WEEK' }).success).toBe(true)
    expect(preferenceInput.safeParse({ key: 'grid.zoom', value: 'MONTH' }).success).toBe(false)
  })

  it('stored DAY is kept; MONTH / absent read as WEEK', () => {
    expect(gridPreference(preferencesSchema.parse({ 'grid.zoom': 'DAY' }), 'grid.zoom')).toBe('DAY')
    const bad = preferencesSchema.parse({ 'grid.zoom': 'MONTH' })
    expect(bad['grid.zoom']).toBeUndefined()
    expect(gridPreference(bad, 'grid.zoom')).toBe('WEEK')
    expect(gridPreference(preferencesSchema.parse({}), 'grid.zoom')).toBe('WEEK')
  })
})

describe('M7.1 preference keys (FR-810/813/814/816, X59)', () => {
  it('setPreference input accepts each new key with a valid value and rejects bad ones', () => {
    const cases: Array<[string, unknown[], unknown[]]> = [
      ['plan.view', ['GRID', 'CALENDAR'], ['calendar', 'LIST', null]],
      ['grid.showAssignees', [true, false], ['yes', 1]],
      ['grid.taskColumnWidth', [120, 240, 640], [119, 641, 240.5, '240']],
      ['grid.chart', [true, false], ['on', null]],
    ]
    for (const [key, goods, bads] of cases) {
      for (const value of goods)
        expect(preferenceInput.safeParse({ key, value }).success, `${key}=${String(value)}`).toBe(true)
      for (const value of bads)
        expect(preferenceInput.safeParse({ key, value }).success, `${key}=${String(value)}`).toBe(false)
    }
  })

  it('bad stored values fall back to the defaults (no error)', () => {
    const bad = preferencesSchema.parse({
      'plan.view': 'MONTH',
      'grid.showAssignees': 'no',
      'grid.taskColumnWidth': 9999,
      'grid.chart': 1,
    })
    expect(bad).toEqual(DEFAULT_PREFERENCES)
    expect(planPreference(bad, 'plan.view')).toBe('GRID')
    expect(gridPreference(bad, 'grid.showAssignees')).toBe(true)
    expect(gridPreference(bad, 'grid.taskColumnWidth')).toBe(240)
    expect(gridPreference(bad, 'grid.chart')).toBe(false)
    expect(PLAN_PREFERENCE_DEFAULTS).toEqual({ 'plan.view': 'GRID' })
  })

  it('stored values are kept', () => {
    const p = preferencesSchema.parse({
      'plan.view': 'CALENDAR',
      'grid.showAssignees': false,
      'grid.taskColumnWidth': 320,
      'grid.chart': true,
    })
    expect(planPreference(p, 'plan.view')).toBe('CALENDAR')
    expect(gridPreference(p, 'grid.showAssignees')).toBe(false)
    expect(gridPreference(p, 'grid.taskColumnWidth')).toBe(320)
    expect(gridPreference(p, 'grid.chart')).toBe(true)
  })
})

describe('palette.lastProjectId (M10-D27, X05/X59)', () => {
  const V4 = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
  it('setPreference input accepts a uuid or null; rejects anything else', () => {
    expect(preferenceInput.safeParse({ key: 'palette.lastProjectId', value: V4 }).success).toBe(true)
    expect(preferenceInput.safeParse({ key: 'palette.lastProjectId', value: null }).success).toBe(true)
    expect(preferenceInput.safeParse({ key: 'palette.lastProjectId', value: 'p1' }).success).toBe(false)
  })
  it('absent or bad stored values read as null; a stored uuid is kept', () => {
    expect(paletteLastProjectId(DEFAULT_PREFERENCES)).toBeNull()
    expect(paletteLastProjectId(preferencesSchema.parse({ 'palette.lastProjectId': 42 }))).toBeNull()
    expect(paletteLastProjectId(preferencesSchema.parse({ 'palette.lastProjectId': V4 }))).toBe(V4)
  })
})
