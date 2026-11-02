'use client'
// src/components/database/DatabaseHeader.tsx — the database title, edited in place (FR-1404/1405): placeholder
// "ฐานข้อมูลไม่มีชื่อ", the caret lands here when this tab just inserted the block (S5 marks it), Enter / blur save
// (≤ 200, trimmed; empty allowed), Esc reverts. Read-only viewers see the text. The title id is the block region's
// accessible name; the toolbar sits on the same line (SPEC §8.11).
import { type JSX, type ReactNode, useEffect, useRef, useState } from 'react'
import { DB_LIMITS } from '@/domain/database'
import { th } from '@/i18n/th'
import { consumeDatabaseJustCreated } from '@/lib/editor/database-block-state'
import { useDbApi } from './data/contract'
import s from './DatabaseBlock.module.css'

export interface DatabaseHeaderProps {
  blockId: string
  titleId: string
  /** The toolbar of the open view (right side). */
  children?: ReactNode
}

export function DatabaseHeader(p: DatabaseHeaderProps): JSX.Element {
  const api = useDbApi()
  const stored = api.db.title
  const [draft, setDraft] = useState(stored)
  const [prev, setPrev] = useState(stored)
  if (prev !== stored) {
    setPrev(stored)
    setDraft(stored)
  }
  const ref = useRef<HTMLInputElement>(null)
  const cancelled = useRef(false)
  const { blockId } = p
  useEffect(() => {
    if (consumeDatabaseJustCreated(blockId)) ref.current?.focus()
  }, [blockId])

  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false
      return
    }
    const next = draft.trim()
    if (next !== stored) api.renameDatabase(next)
    if (next !== draft) setDraft(next)
  }

  return (
    <div className={s.header}>
      {api.canEdit ? (
        <input
          ref={ref}
          id={p.titleId}
          className={s.title}
          value={draft}
          maxLength={DB_LIMITS.dbTitle}
          placeholder={th.database.titlePlaceholder}
          aria-label={th.database.titleLabel}
          data-testid="db-title"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return
            if (e.code === 'Enter' || e.key === 'Enter') {
              e.preventDefault()
              e.currentTarget.blur() // blur commits
            } else if (e.code === 'Escape' || e.key === 'Escape') {
              e.preventDefault()
              e.stopPropagation()
              cancelled.current = true
              setDraft(stored)
              e.currentTarget.blur()
            }
          }}
        />
      ) : (
        <h3
          id={p.titleId}
          className={`${s.titleText}${stored === '' ? ` ${s.untitled}` : ''}`}
          data-testid="db-title"
        >
          {stored === '' ? th.database.untitled : stored}
        </h3>
      )}
      {p.children}
    </div>
  )
}
