// src/components/editor/math/open-request.ts — "open the popover of the equation that is about to mount" (FR-1501:
// `/สมการ` inserts an empty block with its LaTeX field open; FR-1502: `/สมการในบรรทัด` the same inline). Block
// equations are addressed by block id; inline ones have no id, so the next empty inline equation that mounts takes
// the one-shot request (it is the one the slash item just inserted).
const blocks = new Set<string>()
let inline = false

export function requestBlockEquationOpen(blockId: string): void {
  blocks.add(blockId)
}

export function takeBlockEquationOpen(blockId: string): boolean {
  return blocks.delete(blockId)
}

export function requestInlineEquationOpen(): void {
  inline = true
}

export function takeInlineEquationOpen(): boolean {
  const was = inline
  inline = false
  return was
}
