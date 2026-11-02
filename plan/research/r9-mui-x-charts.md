# R9 — `@mui/x-charts` 9.14.0 spike (M7.1 S0.1, M7.1-D2)

Date: 2026-11-01 · Author: M7.1 stream S0 · Outcome: **ADOPT** (no fallback, no Deviation row needed)

Everything below was read from the installed package (`node_modules/@mui/x-charts/**/*.d.ts`) or measured on a production
build. Nothing is from memory.

## 1. Package facts

| Item | Value | Source |
|---|---|---|
| Version | `9.14.0`, pinned exact in `package.json` (`pnpm add @mui/x-charts@9.14.0 --save-exact`) | `pnpm view` |
| Licence | MIT (community package; the Pro features live in `@mui/x-charts-pro`, not installed) | `pnpm view … license` |
| Peers | `react`/`react-dom` ^17‖^18‖^19, `@mui/material` ^7.3‖^9, `@mui/system` ^7.3‖^9 (satisfied through `@mui/material` 9.4.0), `@emotion/react` ^11.9, `@emotion/styled` ^11.8.1 | `pnpm view … peerDependencies` |
| Deps | `@mui/x-charts-vendor` (bundled d3 ESM), `@mui/x-internals`, `@mui/x-internal-gestures`, `@mui/utils` ^9.4, `reselect`, `bezier-easing`, `clsx`, `prop-types`, `use-sync-external-store`, `@babel/runtime` (+29 packages in the lockfile) | `pnpm view … dependencies` |
| `sideEffects` | `false` | `package.json` |
| `eval` / `new Function` | none in `@mui/x-charts` or `@mui/x-charts-vendor` (grep) | grep |

## 2. Imports and props S4 uses (exact, from the `.d.ts`)

```ts
import { LineChart } from '@mui/x-charts/LineChart'                 // LineChartProps
import { ChartsReferenceLine } from '@mui/x-charts/ChartsReferenceLine' // children of <LineChart>
import type { LineSeries } from '@mui/x-charts/LineChart'            // = MakeOptional<LineSeriesType, 'type'>
import type { MarkShape } from '@mui/x-charts/models'                // 'circle'|'cross'|'diamond'|'square'|'star'|'triangle'|'wye'
```

- `LineChart` props used: `series: readonly LineSeries[]`, `xAxis: [{ scaleType: 'point', data: string[] , valueFormatter? }]`,
  `yAxis`, `width?`/`height` (responsive width when omitted — needs a sized parent), `skipAnimation` (use it under
  `prefers-reduced-motion` and in tests), `hideLegend`, `slotProps.legend` (`ChartsLegendProps`: `direction`, `onItemClick(event,
  legendItem, index)`, `toggleVisibilityOnClick` default `false`), `highlightedItem` / `onHighlightChange` (controlled highlight —
  used for the D4 "focus person"), `onMarkClick`, `onLineClick`, `grid: { horizontal?, vertical? }`, `axisHighlight`.
- `LineSeries` fields used: `id`, `label` (string or `(location: 'tooltip' | 'legend') => string`), `data: (number | null)[]`
  (`null` = gap; `connectNulls` default `false`, which is what D5 wants), `color` (any CSS colour — **`var(--chart-n)` works**, verified
  in the browser), `colorGetter({ value, dataIndex })` (per-point mark colour, e.g. OVER/RISK), `shape: MarkShape`,
  `showMark: boolean | 'start' | 'end' | (p: { index, x, y, position, value }) => boolean`, `curve` (default `'monotoneX'`; use
  `'linear'` so a line never overshoots between weeks), `valueFormatter`, `highlightScope: { highlight?: 'none'|'item'|'series',
  fade?: 'none'|'series'|'global' }`, `disableHighlight`.
- `ChartsReferenceLine`: `x` (vertical — the plan-marker week, a value of the x axis `data`) **or** `y` (horizontal — 1.0
  "เต็ม capacity"), `label`, `labelAlign: 'start'|'middle'|'end'`, `lineStyle: React.CSSProperties` (stroke, strokeDasharray for
  the yellow/green patterns), `labelStyle`, `spacing`, `axisId`, `classes`. Root class `MuiChartsReferenceLine-root`.
- The "capacity dashed line" of the focused person can be a second series with `showMark: false` and a dashed style via
  `sx` on `.MuiLineElement-root[data-series="cap-…"]`, or a stepped `series` with `curve: 'stepAfter'`; S4 picks, both are
  in the community package.

## 3. Spike results (scratch copy of the repo in `/tmp`, nothing committed)

Spike page: a public route rendering a `next/dynamic(() => import('./SpikeChart'), { ssr: false })` behind a button; the chart =
`LineChart` with 3 series × 12 points (`shape` circle/square/triangle, one `null` gap, `highlightScope`), `slotProps.legend`,
`ChartsReferenceLine x="W5"` (dashed) and `y={1}`.

| Check (M7.1-D2) | Result |
|---|---|
| (a) production CSP (`pnpm exec next build && next start`, headless Chromium, `securitypolicyviolation` listener + console errors — same as the e2e guard) | **0 violations, 0 console errors**. Emotion styles fall under the existing `style-src 'self' 'unsafe-inline'`; no `eval`. |
| (b) size | Chunks fetched only when the pane opens: 89.2 + 13.1 + 8.5 + 3.7 = **114.5 kB gzip** (≤ 120 kB). The main x-charts chunk alone is 88.9 kB (`gzip -9`). **0** chart bytes in the route's initial JS (none of the four chunks is requested before the click). Budget is tight: import only `LineChart` + `ChartsReferenceLine` from their sub-paths, never the package root. |
| (c) jsdom (Vitest `ui` project) | Renders: `<svg>`, 34 paths, legend labels and 2 reference lines, with `offsetWidth/clientWidth = 700`, `offsetHeight/clientHeight = 300` getter stubs, a no-op `ResizeObserver`, explicit `width`/`height` props and `skipAnimation`. |
| Browser look | Lines, marks with distinct shapes, the `null` gap, dashed x reference line with label, y reference line — all correct. |

## 4. Gotchas for S4

1. With `scaleType: 'point'` and short string labels the x tick **labels did not show** in the spike (ticks did); S4 must check the
   week labels render (try `xAxis[0].height`, `tickLabelStyle`, or `valueFormatter`) and the table view covers the data regardless.
2. Default `curve` is `monotoneX` (overshoots) → set `curve: 'linear'`.
3. Responsive width needs a parent with a width; in jsdom pass `width`/`height` explicitly or stub the offset getters (§3c).
4. Legend click does **not** hide series unless `toggleVisibilityOnClick` — keep it `false`; use `onItemClick` for "focus person".
5. Always load through `next/dynamic(…, { ssr: false })` inside `LoadChartPanel`; the server bundle never needs the chart.

## 5. Decision

**Adopt `@mui/x-charts` 9.14.0** for the FR-813 chart (M7.1-D2). The SVG fallback is not needed; no `Deviations` row.
