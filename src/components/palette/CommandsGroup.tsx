'use client'
// src/components/palette/CommandsGroup.tsx — the "คำสั่ง" group of the palette (plan/m08 S4.10, M8-D18): the visible
// PALETTE_COMMANDS that match the query, before the search groups; nothing when none is visible.
import { Command } from 'cmdk'
import { th } from '@/i18n/th'
import { useVisibleCommands } from './commands'
import { useCommandCtx } from './PaletteProvider'
import styles from './CommandPalette.module.css'

export function CommandsGroup({ q }: { q: string }) {
  const commands = useVisibleCommands(q)
  const ctx = useCommandCtx()
  if (commands.length === 0) return null
  return (
    <Command.Group heading={th.milestones.palette.group}>
      {commands.map((c) => (
        <Command.Item key={c.id} value={`cmd:${c.id}`} onSelect={() => c.run(ctx)} className={styles.item}>
          {c.label}
        </Command.Item>
      ))}
    </Command.Group>
  )
}
