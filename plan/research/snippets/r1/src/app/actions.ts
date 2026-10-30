'use server'
import { refresh } from 'next/cache'

let counter = 0
export async function bump(): Promise<{ ok: true; counter: number }> {
  counter += 1
  refresh()
  return { ok: true, counter }
}
export async function getCounter() {
  return counter
}

import { revalidateTag, updateTag, revalidatePath } from 'next/cache'
export async function bumpTagMax(): Promise<{ ok: true; counter: number }> {
  counter += 1
  revalidateTag('project:1', 'max')
  return { ok: true, counter }
}
export async function bumpUpdateTag(): Promise<{ ok: true; counter: number }> {
  counter += 1
  updateTag('project:1')
  return { ok: true, counter }
}
export async function bumpRevalidatePath(): Promise<{ ok: true; counter: number }> {
  counter += 1
  revalidatePath('/stream')
  return { ok: true, counter }
}
export async function bumpNothing(): Promise<{ ok: true; counter: number }> {
  counter += 1
  return { ok: true, counter }
}
