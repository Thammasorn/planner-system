import { describe, expect, it } from 'vitest'
import { addMemberSchema, changeMemberRoleSchema, removeMemberSchema } from './members'

const projectId = '6f1c1d2e-3b4a-4c5d-8e9f-0a1b2c3d4e5f'

describe('member schemas (FR-403, M2-D14)', () => {
  it('addMember defaults the role to MEMBER and takes text user ids', () => {
    expect(addMemberSchema.parse({ projectId, userId: 'u1' }).role).toBe('MEMBER')
    expect(addMemberSchema.parse({ projectId, userId: 'u1', role: 'LEAD' }).role).toBe('LEAD')
    expect(addMemberSchema.safeParse({ projectId, userId: '' }).success).toBe(false)
    expect(addMemberSchema.safeParse({ projectId, userId: 'x'.repeat(65) }).success).toBe(false)
  })

  it('changeMemberRole requires a role; removeMember needs both ids', () => {
    expect(changeMemberRoleSchema.safeParse({ projectId, userId: 'u1' }).success).toBe(false)
    expect(changeMemberRoleSchema.safeParse({ projectId, userId: 'u1', role: 'OWNER' }).success).toBe(false)
    expect(removeMemberSchema.parse({ projectId, userId: 'u1' })).toEqual({ projectId, userId: 'u1' })
    expect(removeMemberSchema.safeParse({ projectId: 'x', userId: 'u1' }).success).toBe(false)
  })
})
