export type ISODate = string
const bangkok = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' })
/** Only place allowed to touch JS Date (lint rule exempts this file). */
export function todayBangkok(now: Date = new Date()): ISODate {
  return bangkok.format(now)
}
function toUtc(d: ISODate): Date {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, day))
}
export function addDays(d: ISODate, n: number): ISODate {
  const t = toUtc(d)
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}
export function isoWeekday(d: ISODate): number {
  const w = toUtc(d).getUTCDay()
  return w === 0 ? 7 : w
}
export function weekStart(d: ISODate): ISODate {
  return addDays(d, 1 - isoWeekday(d))
}
