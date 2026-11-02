import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { matchCommand, PALETTE_COMMANDS, projectIdFromPath } from './commands'
import { fakeCommandCtx } from './commands.test-utils'

const POS = '6f1c2b8e-3d4a-4b5c-9d6e-7f8a9b0c1d2e'
const create = () => {
  const c = PALETTE_COMMANDS.find((x) => x.id === 'milestone.create')
  if (!c) throw new Error('milestone.create is not registered')
  return c
}

describe('FR-702 / M8-D18 palette commands', () => {
  it('"สร้าง milestone" is registered by id with its Thai label', () => {
    expect(create().label).toBe(th.milestones.palette.create)
  })

  it('matchCommand: label or keyword substring, case-insensitive; empty query matches', () => {
    expect(matchCommand(create(), 'mile')).toBe(true)
    expect(matchCommand(create(), 'MILE')).toBe(true)
    expect(matchCommand(create(), 'มายล์')).toBe(true)
    expect(matchCommand(create(), '')).toBe(true)
    expect(matchCommand(create(), '  ')).toBe(true)
    expect(matchCommand(create(), 'งาน')).toBe(false)
  })

  it('run closes the palette, then opens the dialog with the current project', () => {
    const calls: string[] = []
    const ctx = fakeCommandCtx({
      currentProjectId: POS,
      close: () => calls.push('close'),
      openMilestoneDialog: (o) => calls.push(`open:${o.projectId ?? ''}`),
    })
    create().run(ctx)
    expect(calls).toEqual(['close', `open:${POS}`])
  })

  it('run without a current project opens the dialog with no pre-selection', () => {
    const ctx = fakeCommandCtx()
    create().run(ctx)
    expect(ctx.openMilestoneDialog).toHaveBeenCalledWith({})
  })

  it('projectIdFromPath', () => {
    expect(projectIdFromPath(`/projects/${POS}/plan`)).toBe(POS)
    expect(projectIdFromPath(`/projects/${POS}`)).toBe(POS)
    expect(projectIdFromPath('/home')).toBeNull()
    expect(projectIdFromPath('/projects/new')).toBeNull()
  })
})

describe('FR-1103 / M10-D23 quick commands (taken by id)', () => {
  const byId = (id: string) => {
    const c = PALETTE_COMMANDS.find((x) => x.id === id)
    if (!c) throw new Error(`${id} is not registered`)
    return c
  }
  const ids = ['task.create', 'page.create', 'leave.report', 'nav.today'] as const

  it("the four M10 commands are registered after M8's, with the th labels; ids are unique", () => {
    expect(byId('task.create').label).toBe(th.palette.commands.createTask.label)
    expect(byId('page.create').label).toBe(th.palette.commands.createPage.label)
    expect(byId('leave.report').label).toBe(th.palette.commands.reportLeave.label)
    expect(byId('nav.today').label).toBe(th.palette.commands.goToday.label)
    const all = PALETTE_COMMANDS.map((c) => c.id)
    expect(new Set(all).size).toBe(all.length)
    expect(all.indexOf('milestone.create')).toBeLessThan(all.indexOf('task.create'))
  })

  it('matchCommand on labels and keywords', () => {
    expect(matchCommand(byId('task.create'), 'สร้าง')).toBe(true)
    expect(matchCommand(byId('task.create'), 'new')).toBe(true)
    expect(matchCommand(byId('task.create'), 'ลา')).toBe(false)
    expect(matchCommand(byId('leave.report'), 'ลา')).toBe(true)
    expect(matchCommand(byId('nav.today'), 'today')).toBe(true)
    expect(matchCommand(byId('page.create'), 'page')).toBe(true)
    for (const id of ids) expect(matchCommand(byId(id), '')).toBe(true)
  })

  it('leave.report closes the palette, then opens the leave dialog', () => {
    const calls: string[] = []
    byId('leave.report').run(
      fakeCommandCtx({ close: () => calls.push('close'), openLeaveDialog: () => calls.push('leave') }),
    )
    expect(calls).toEqual(['close', 'leave'])
  })

  it('nav.today closes and navigates to /home', () => {
    const c = fakeCommandCtx()
    byId('nav.today').run(c)
    expect(c.close).toHaveBeenCalled()
    expect(c.navigate).toHaveBeenCalledWith('/home')
  })

  it('task.create starts the create-task steps; page.create runs createPageHere', () => {
    const c = fakeCommandCtx()
    byId('task.create').run(c)
    expect(c.beginCreateTask).toHaveBeenCalledTimes(1)
    expect(c.close).not.toHaveBeenCalled() // the palette stays open for the steps
    byId('page.create').run(c)
    expect(c.createPageHere).toHaveBeenCalledTimes(1)
  })
})
