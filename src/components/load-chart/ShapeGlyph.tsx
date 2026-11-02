// src/components/load-chart/ShapeGlyph.tsx — the mark shape of a person in the legend, the table and the chart
// (M7.1-D4, §8.9: colour + shape + name). Plain SVG on a 12 × 12 box centred at (6, 6).
import type { MarkShape } from './chart-model'

export const SHAPE_PATHS: Record<Exclude<MarkShape, 'circle'>, string> = {
  square: 'M2 2h8v8H2z',
  triangle: 'M6 1.5 10.5 10h-9z',
  diamond: 'M6 1 11 6 6 11 1 6z',
  cross: 'M4.5 1h3v3.5H11v3H7.5V11h-3V7.5H1v-3h3.5z',
  star: 'M6 1l1.4 3.2 3.5.3-2.6 2.3.8 3.4L6 8.4 2.9 10.2l.8-3.4L1.1 4.5l3.5-.3z',
  wye: 'M5 1h2v4.2l3.6 2.1-1 1.7L6 6.9 2.4 9 1.4 7.3 5 5.2z',
}

/** The shape as SVG children of a 12 × 12 box (centre 6, 6). */
export function ShapePath({ shape, color }: { shape: MarkShape; color: string }) {
  return shape === 'circle' ? (
    <circle cx={6} cy={6} r={4.5} fill={color} />
  ) : (
    <path d={SHAPE_PATHS[shape]} fill={color} />
  )
}

export function ShapeGlyph({ shape, color }: { shape: MarkShape; color: string }) {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden="true" focusable="false" data-shape={shape}>
      <ShapePath shape={shape} color={color} />
    </svg>
  )
}
