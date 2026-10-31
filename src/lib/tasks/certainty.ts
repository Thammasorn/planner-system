// src/lib/tasks/certainty.ts — effective certainty of a task from the client's task map (BR-35/36).
import { resolveCertainty, type CertaintyNode, type CertaintyResolution } from '@/domain/certainty'
import type { Certainty } from '@/domain/types'
import type { TaskDTO } from '@/lib/contracts/tasks'

/** Task, parent, grandparent (BR-30). */
const MAX_CHAIN = 3

/** Builds the chain task → parent → grandparent (stops at a missing parent) and resolves it. RangeError for an unknown id. */
export function taskCertainty(
  byId: ReadonlyMap<string, TaskDTO>,
  id: string,
  project: Certainty,
): CertaintyResolution {
  const chain: CertaintyNode[] = []
  for (
    let t = byId.get(id);
    t !== undefined && chain.length < MAX_CHAIN;
    t = t.parentId === null ? undefined : byId.get(t.parentId)
  ) {
    chain.push({ id: t.id, name: t.name, certaintyOverride: t.certaintyOverride })
  }
  return resolveCertainty(chain, project)
}
