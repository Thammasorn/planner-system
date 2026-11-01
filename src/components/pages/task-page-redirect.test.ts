import { describe, expect, it } from 'vitest'
import { taskPageRedirect } from './task-page-redirect'

describe('taskPageRedirect (M6.1-D5)', () => {
  it('a TASK page goes to its task page', () => {
    expect(taskPageRedirect({ kind: 'TASK', taskId: 't-1' })).toBe('/t/t-1')
  })

  it('DOC pages stay on /p', () => {
    expect(taskPageRedirect({ kind: 'DOC', taskId: null })).toBeNull()
    expect(taskPageRedirect({ kind: 'TASK', taskId: null })).toBeNull()
  })
})
