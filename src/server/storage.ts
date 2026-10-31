// src/server/storage.ts — file bytes under UPLOAD_DIR (SPEC §7.6, M4-D16). No `import 'server-only'` (X56): tsx
// scripts and the Playwright resetDb import it. put = mkdir -p → write `<key>.tmp-<random>` → rename (atomic);
// keys are validated against STORAGE_KEY_RE and resolved under the root, so no path traversal is possible.
import { randomBytes, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import type { ISODate } from '@/domain/types'
import { getEnv } from './env'

export interface Storage {
  put(key: string, bytes: Uint8Array): Promise<void>
  /** null when the key has no file. */
  stream(key: string): Promise<{ body: ReadableStream<Uint8Array>; size: number } | null>
  /** Missing file → no error. */
  remove(key: string): Promise<void>
}

/** `yyyy/mm/<uuid>.<ext>` (lower-case ext, 1–5 chars). */
export const STORAGE_KEY_RE = /^\d{4}\/\d{2}\/[0-9a-f-]{36}\.[a-z0-9]{1,5}$/

/** `${yyyy}/${mm}/${uuid}.${ext}` from the server's Bangkok date (X45). */
export function newStorageKey(today: ISODate, ext: string): string {
  const [yyyy, mm] = today.split('-')
  return `${yyyy}/${mm}/${randomUUID()}.${ext}`
}

const isSafeKey = (key: string): boolean => STORAGE_KEY_RE.test(key)

/** Throws on anything that is not a well-formed storage key (`..`, absolute paths, other shapes). */
export function assertSafeKey(key: string): void {
  if (!isSafeKey(key)) throw new Error('storage: unsafe key')
}

const isErrno = (e: unknown, code: string): boolean =>
  e !== null && typeof e === 'object' && 'code' in e && e.code === code

export function localDiskStorage(root: string): Storage {
  const base = path.resolve(root)
  const full = (key: string): string => {
    const p = path.resolve(base, key)
    // Belt and braces: the regex already excludes '..' and absolute paths.
    if (!p.startsWith(base + path.sep)) throw new Error('storage: unsafe key')
    return p
  }
  return {
    async put(key, bytes) {
      assertSafeKey(key)
      const target = full(key)
      await mkdir(path.dirname(target), { recursive: true })
      const tmp = `${target}.tmp-${randomBytes(6).toString('hex')}`
      try {
        await writeFile(tmp, bytes, { flag: 'wx' })
        await rename(tmp, target)
      } catch (e) {
        await unlink(tmp).catch(() => undefined)
        throw e
      }
    },
    async stream(key) {
      if (!isSafeKey(key)) return null // a malformed key can never name a stored file
      const target = full(key)
      try {
        const st = await stat(target)
        if (!st.isFile()) return null
        const body = Readable.toWeb(createReadStream(target)) as ReadableStream<Uint8Array>
        return { body, size: st.size }
      } catch (e) {
        if (isErrno(e, 'ENOENT') || isErrno(e, 'ENOTDIR')) return null
        throw e
      }
    },
    async remove(key) {
      assertSafeKey(key)
      try {
        await unlink(full(key))
      } catch (e) {
        if (!isErrno(e, 'ENOENT')) throw e
      }
    },
  }
}

let memo: { root: string; storage: Storage } | undefined

/** localDiskStorage(UPLOAD_DIR), memoised per root value (tests switch UPLOAD_DIR per worker). */
export function getStorage(): Storage {
  const root = getEnv().UPLOAD_DIR
  if (memo?.root !== root) memo = { root, storage: localDiskStorage(root) }
  return memo.storage
}
