// src/domain/certainty.ts — effective certainty of a task (SPEC §5.5 BR-35/36, X03). Pure.
// Depth is at most 3 levels (BR-30), so the chain is task → parent → grandparent and no recursion is needed (§6.5).
import type { Certainty } from './types'

export type CertaintySource = 'task' | 'ancestor' | 'project'

export interface CertaintyNode {
  id: string
  name: string
  certaintyOverride: Certainty | null
}

export interface CertaintyResolution {
  value: Certainty
  source: CertaintySource
  /** The task whose override won (task or ancestor); null when the project's certainty applies. */
  sourceTaskId: string | null
  /** BR-36 "สืบทอดจาก '<ชื่องานแม่>'"; null when the project's certainty applies. */
  sourceTaskName: string | null
}

/** Deepest chain: task, parent, grandparent (BR-30). */
const MAX_CHAIN = 3

/**
 * BR-35: `task.override ?? parent.override ?? grandparent.override ?? project.certainty`.
 * @param chain [task, parent?, grandparent?] nearest first; length 1..3 (BR-30), otherwise RangeError.
 */
export function resolveCertainty(
  chain: readonly CertaintyNode[],
  projectCertainty: Certainty,
): CertaintyResolution {
  if (chain.length < 1 || chain.length > MAX_CHAIN) {
    throw new RangeError(`certainty chain must hold 1..${MAX_CHAIN} nodes, got ${chain.length}`)
  }
  for (const [i, node] of chain.entries()) {
    if (node.certaintyOverride !== null) {
      return {
        value: node.certaintyOverride,
        source: i === 0 ? 'task' : 'ancestor',
        sourceTaskId: node.id,
        sourceTaskName: node.name,
      }
    }
  }
  return { value: projectCertainty, source: 'project', sourceTaskId: null, sourceTaskName: null }
}

export function effectiveCertainty(chain: readonly CertaintyNode[], projectCertainty: Certainty): Certainty {
  return resolveCertainty(chain, projectCertainty).value
}

export function certaintySource(
  chain: readonly CertaintyNode[],
  projectCertainty: Certainty,
): CertaintySource {
  return resolveCertainty(chain, projectCertainty).source
}
