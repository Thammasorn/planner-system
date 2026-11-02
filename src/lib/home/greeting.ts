// src/lib/home/greeting.ts — greeting by the Bangkok hour of serverNow() (M10-D19, X68). Pure.
export type GreetingKey = 'morning' | 'afternoon' | 'evening'

/** 05:00–11:59 morning, 12:00–17:59 afternoon, else evening. */
export function greetingKey(hour: number): GreetingKey {
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 18) return 'afternoon'
  return 'evening'
}
