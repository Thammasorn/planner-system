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
