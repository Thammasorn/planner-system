'use client'
import { Fragment } from 'react'
import { Command } from 'cmdk'
import type { PaletteItem } from './groups'
import styles from './CommandPalette.module.css'

/**
 * One result row: icon, title, subtitle (project / Wiki ทีม) and text chips (e.g. "พบในเนื้อหา"). The `{' '}` text
 * nodes between flex children are not rendered by flex layout but keep the words apart in the option's accessible name.
 */
export function PaletteItemRow({
  item,
  onSelect,
}: {
  item: PaletteItem
  onSelect: (item: PaletteItem) => void
}) {
  return (
    <Command.Item value={item.value} onSelect={() => onSelect(item)} className={styles.item}>
      {item.icon !== undefined ? (
        <span className={styles.icon} aria-hidden="true">
          {item.icon}
        </span>
      ) : null}
      <span className={styles.text}>
        <span className={styles.title}>{item.title}</span>
        {item.subtitle ? (
          <>
            {' '}
            <span className={styles.subtitle}>{item.subtitle}</span>
          </>
        ) : null}
      </span>
      {item.chips?.map((c) => (
        <Fragment key={c}>
          {' '}
          <span className={styles.chip}>{c}</span>
        </Fragment>
      ))}
    </Command.Item>
  )
}
