'use client'
// src/components/layout/PropertyList.tsx — light property rows of the task panel / task page / settings (FR-1604,
// SPEC §8.12, M6.1-D16/D23): `label · value` rows without frames; label `--font-sm` in `--text-secondary`, value
// `--font-md`, row gap `--space-2`, hover `--hover-bg`. `data-light-form` switches the MUI inputs inside to the
// borderless look (theme overrides, M6.1-D22).
import type { JSX, ReactNode } from 'react'
import { useId } from 'react'
import styles from './PropertyList.module.css'

export function PropertyList(p: { children: ReactNode; 'aria-label'?: string }): JSX.Element {
  return (
    <div data-light-form="" role="group" aria-label={p['aria-label']} className={styles.list}>
      {p.children}
    </div>
  )
}

export function PropertyRow(p: { label: string; id?: string; children: ReactNode }): JSX.Element {
  const auto = useId()
  const labelId = `${p.id ?? auto}-label`
  return (
    <div role="group" aria-labelledby={labelId} data-property-row="" className={styles.row}>
      <div id={labelId} className={styles.label}>
        {p.label}
      </div>
      <div className={styles.value}>{p.children}</div>
    </div>
  )
}
