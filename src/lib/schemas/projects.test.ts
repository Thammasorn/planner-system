import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { z } from '@/lib/z'
import { createProjectSchema, deleteProjectSchema, projectIdSchema, updateProjectSchema } from './projects'

const PID = '6f1c1d2e-3b4a-4c5d-8e9f-0a1b2c3d4e5f'
const firstError = (r: { success: boolean; error?: z.ZodError }) => r.error?.issues[0]?.message

describe('project schemas (FR-401, M2-D15)', () => {
  it('trims the name and requires it', () => {
    expect(createProjectSchema.parse({ name: '  POS  ' }).name).toBe('POS')
    expect(firstError(createProjectSchema.safeParse({ name: '   ' }))).toBe(th.projects.errors.nameRequired)
    expect(firstError(createProjectSchema.safeParse({ name: 'x'.repeat(201) }))).toBe(
      th.projects.errors.nameTooLong,
    )
  })

  it('only the name is required; empty code → null; colour normalised to upper case', () => {
    expect(createProjectSchema.parse({ name: 'X' })).toEqual({ name: 'X' })
    expect(createProjectSchema.parse({ name: 'X', code: '' }).code).toBeNull()
    expect(createProjectSchema.parse({ name: 'X', code: ' POS ' }).code).toBe('POS')
    expect(firstError(createProjectSchema.safeParse({ name: 'X', code: 'x'.repeat(21) }))).toBe(
      th.projects.errors.codeTooLong,
    )
    expect(createProjectSchema.parse({ name: 'X', color: '#2f5597' }).color).toBe('#2F5597')
    expect(firstError(createProjectSchema.safeParse({ name: 'X', color: 'blue' }))).toBe(
      th.projects.errors.invalidColor,
    )
  })

  it('validates ids, certainty and the LEAD user id', () => {
    expect(createProjectSchema.safeParse({ name: 'X', clientId: 'x' }).success).toBe(false)
    expect(createProjectSchema.parse({ name: 'X', clientId: PID, certainty: 'TENTATIVE' })).toMatchObject({
      clientId: PID,
      certainty: 'TENTATIVE',
    })
    expect(createProjectSchema.safeParse({ name: 'X', certainty: 'MAYBE' }).success).toBe(false)
    expect(createProjectSchema.parse({ name: 'X', leadUserId: 'u1' }).leadUserId).toBe('u1')
    expect(createProjectSchema.safeParse({ name: 'X', leadUserId: '' }).success).toBe(false)
    expect(firstError(createProjectSchema.safeParse({ name: 'X', certaintyNote: 'x'.repeat(501) }))).toBe(
      th.projects.errors.noteTooLong,
    )
  })

  it('updateProjectSchema: undefined = unchanged, null = clear', () => {
    expect(updateProjectSchema.parse({ projectId: PID, clientId: null })).toEqual({
      projectId: PID,
      clientId: null,
    })
    expect(updateProjectSchema.parse({ projectId: PID })).toEqual({ projectId: PID })
    expect(updateProjectSchema.parse({ projectId: PID, certaintyNote: null }).certaintyNote).toBeNull()
    expect(updateProjectSchema.safeParse({ projectId: 'abc' }).success).toBe(false)
  })

  it('projectId and delete schemas', () => {
    expect(projectIdSchema.parse({ projectId: PID })).toEqual({ projectId: PID })
    expect(deleteProjectSchema.parse({ projectId: PID, confirmName: ' POS ' }).confirmName).toBe(' POS ')
    expect(deleteProjectSchema.safeParse({ projectId: PID, confirmName: 'x'.repeat(401) }).success).toBe(
      false,
    )
  })
})
