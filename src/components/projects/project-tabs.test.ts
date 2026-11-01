import { describe, expect, it } from 'vitest'
import { PROJECT_TABS, sortedProjectTabs } from './project-tabs'

describe('PROJECT_TABS (FR-408, X84, M2-D10)', () => {
  it('sorted by order: ภาพรวม 0 · แผนงาน 1 · งาน 2 · เอกสาร 3', () => {
    const tabs = sortedProjectTabs()
    expect(tabs.map((t) => t.id)).toEqual(['overview', 'plan', 'tasks', 'pages'])
    expect(tabs.map((t) => t.order)).toEqual([0, 1, 2, 3])
    expect(PROJECT_TABS).toHaveLength(4)
  })
})
