// Test-only: shared module mocks for the grid UI tests (call setupGridMocks() at the top of a test file through
// vi.mock factories; not imported by app code).
import { vi } from 'vitest'
import type { ProjectTasksResponse } from '@/lib/contracts/tasks'

export const PID = 'p-pos'

export function projectTasksResponse(): ProjectTasksResponse {
  const task = (id: string, name: string) => ({
    id,
    projectId: PID,
    parentId: null,
    depth: 0 as const,
    position: 'a0',
    name,
    hasBody: false,
    startDate: null,
    dueDate: null,
    certaintyOverride: null,
    completedOn: null,
    assignees: [],
    statusId: 's-todo',
    blockers: { open: 0, total: 0 },
  })
  return {
    project: { id: PID, name: 'POS Upgrade', certainty: 'CONFIRMED', archived: false },
    viewer: { role: 'LEAD', canEdit: true, canManage: true },
    members: [
      { userId: 'cindy', role: 'LEAD' },
      { userId: 'ivy', role: 'MEMBER' },
      { userId: 'mint', role: 'MEMBER' },
    ],
    tasks: [
      task('t-pos', 'ปรับปรุงระบบ POS หน้าร้าน'),
      task('t-uat', 'ทำ UAT + คู่มือหน้าร้าน'),
      task('t-rollout', 'Rollout สาขา'),
    ],
    statuses: [],
    blockerEdges: [{ id: 'e1', taskId: 't-rollout', blockerTaskId: 't-uat' }],
  }
}

/** jsdom has no layout: element.scrollTo just stores the offsets and fires `scroll` (TanStack Virtual listens). */
export function stubScrollTo() {
  // the virtualizer clamps to scrollWidth − clientWidth
  vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockReturnValue(100_000)
  vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockReturnValue(100_000)
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(1600)
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(900)
  const pos = new WeakMap<Element, { left: number; top: number }>()
  const get = (el: Element) => pos.get(el) ?? { left: 0, top: 0 }
  vi.spyOn(Element.prototype, 'scrollLeft', 'get').mockImplementation(function (this: Element) {
    return get(this).left
  })
  vi.spyOn(Element.prototype, 'scrollLeft', 'set').mockImplementation(function (this: Element, v: number) {
    pos.set(this, { ...get(this), left: v })
  })
  vi.spyOn(Element.prototype, 'scrollTop', 'get').mockImplementation(function (this: Element) {
    return get(this).top
  })
  vi.spyOn(Element.prototype, 'scrollTop', 'set').mockImplementation(function (this: Element, v: number) {
    pos.set(this, { ...get(this), top: v })
  })
  Element.prototype.scrollTo = function scrollTo(this: Element, a?: ScrollToOptions | number, b?: number) {
    const o: ScrollToOptions = typeof a === 'object' ? a : { left: a ?? 0, top: b ?? 0 }
    if (o.left !== undefined) this.scrollLeft = o.left
    if (o.top !== undefined) this.scrollTop = o.top
    this.dispatchEvent(new Event('scroll'))
  }
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    cb(0)
    return 0
  })
}
