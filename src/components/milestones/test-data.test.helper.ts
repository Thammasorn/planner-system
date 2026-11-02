// Test-only milestone fixtures (not imported by app code).
import type { MilestoneDTO, ProjectMilestonesResponse } from '@/lib/contracts/milestones'
import { PID } from '@/components/tasks/fixtures.test.data'

export const M = {
  beta: '00000000-0000-4000-8000-000000000701',
  uat: '00000000-0000-4000-8000-000000000702',
  kickoff: '00000000-0000-4000-8000-000000000703',
  cutover: '00000000-0000-4000-8000-000000000704',
}

export function milestone(
  over: Partial<MilestoneDTO> & Pick<MilestoneDTO, 'id' | 'name' | 'date'>,
): MilestoneDTO {
  return {
    projectId: PID,
    description: null,
    completedOn: null,
    status: 'UPCOMING',
    late: false,
    lateTaskCount: 0,
    progress: { done: 0, total: 0 },
    ...over,
  }
}

export function milestonesResponse(
  milestones: MilestoneDTO[],
  over: Partial<ProjectMilestonesResponse> = {},
): ProjectMilestonesResponse {
  return { projectId: PID, today: '2026-09-30', canManage: true, milestones, ...over }
}
