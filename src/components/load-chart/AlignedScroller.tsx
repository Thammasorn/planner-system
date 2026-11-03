'use client'
// src/components/load-chart/AlignedScroller.tsx — the horizontal scroller of the กราฟภาระ pane (M7.1-D30). Same
// clientWidth as the grid's scroller, content = the grid's content width, scrollLeft kept equal to the grid's by
// VirtualGrid (`layout.follow`, both ways: scrolling here scrolls the grid). Its own scrollbar is hidden — the grid's
// is the one the user sees; wheel, touch and the keyboard (it is focusable) still scroll it.
import type { CSSProperties, ReactNode } from 'react'
import { th } from '@/i18n/th'
import styles from './LoadChart.module.css'
import type { ChartLayout } from './types'

export function AlignedScroller({
  layout,
  className,
  children,
}: {
  layout: ChartLayout
  className?: string
  children: ReactNode
}) {
  // a plain local (not `layout.follow`): the React compiler treats a member used as `ref` as a ref object
  const { follow, viewWidth, frozenWidth, totalColWidth, scrollerLabel } = layout
  return (
    <div
      ref={follow}
      className={className ? `${styles.follow} ${className}` : styles.follow}
      style={
        {
          width: viewWidth > 0 ? viewWidth : '100%',
          '--grid-frozen-w': `${frozenWidth}px`,
          '--grid-total-w': `${totalColWidth}px`,
        } as CSSProperties
      }
      role="region"
      aria-label={scrollerLabel ?? th.loadChart.scroller}
      tabIndex={0}
      data-chart-follow=""
      data-no-total={totalColWidth > 0 ? undefined : ''}
    >
      {children}
    </div>
  )
}
