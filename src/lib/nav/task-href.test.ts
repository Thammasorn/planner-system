import { describe, expect, it } from 'vitest'
import { isPlainClick, projectTasksHref, taskPageHref } from './task-href'

const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }

describe('task-href (FR-683/685)', () => {
  it('task page and project tasks URLs', () => {
    expect(taskPageHref('t1')).toBe('/t/t1')
    expect(projectTasksHref('p1')).toBe('/projects/p1/tasks')
    expect(projectTasksHref('p1', 't1')).toBe('/projects/p1/tasks?task=t1')
  })

  it('only an unmodified left click is plain (Cmd/Ctrl/Shift/middle-click open elsewhere)', () => {
    expect(isPlainClick(click)).toBe(true)
    expect(isPlainClick({ ...click, metaKey: true })).toBe(false)
    expect(isPlainClick({ ...click, ctrlKey: true })).toBe(false)
    expect(isPlainClick({ ...click, shiftKey: true })).toBe(false)
    expect(isPlainClick({ ...click, altKey: true })).toBe(false)
    expect(isPlainClick({ ...click, button: 1 })).toBe(false)
  })
})
