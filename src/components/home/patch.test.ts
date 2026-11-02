import { describe, expect, it } from 'vitest'
import { patchHomeTask, type HomeCache } from './patch'
import { homeResponse, TASK_POS } from './test-data.test.helper'

describe('patchHomeTask (M10-D33)', () => {
  const d: HomeCache = homeResponse()

  it('sets the completed flag of the task only, immutably', () => {
    const next = patchHomeTask(d, TASK_POS, { completed: true })
    expect(next).not.toBe(d)
    expect(next.myTasks.items.find((t) => t.id === TASK_POS)?.completed).toBe(true)
    expect(d.myTasks.items.find((t) => t.id === TASK_POS)?.completed).toBeUndefined()
    expect(next.myTasks.items.filter((t) => t.id !== TASK_POS).every((t) => t.completed === undefined)).toBe(
      true,
    )
    expect(next.myLoad).toBe(d.myLoad)
  })

  it('unticks back to false', () => {
    const ticked = patchHomeTask(d, TASK_POS, { completed: true })
    expect(patchHomeTask(ticked, TASK_POS, { completed: false }).myTasks.items[0]?.completed).toBe(false)
  })

  it('an unknown id returns the same object', () => {
    expect(patchHomeTask(d, 'nope', { completed: true })).toBe(d)
  })
})
