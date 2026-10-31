// M4 S1.1 — local disk storage under UPLOAD_DIR (SPEC §7.6, M4-D16): atomic put, stream, idempotent remove,
// keys validated against STORAGE_KEY_RE (no traversal).
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getStorage, localDiskStorage, newStorageKey, STORAGE_KEY_RE } from './storage'

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'storage-test-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function readAll(body: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  return new Uint8Array(await new Response(body).arrayBuffer())
}

describe('localDiskStorage', () => {
  it('put → stream returns the same bytes and size; no temp file is left behind', async () => {
    const s = localDiskStorage(root)
    const key = newStorageKey('2026-09-30', 'png')
    const bytes = new Uint8Array([1, 2, 3, 4, 5])
    await s.put(key, bytes)
    const got = await s.stream(key)
    expect(got).not.toBeNull()
    expect(got!.size).toBe(5)
    expect(await readAll(got!.body)).toEqual(bytes)
    expect(await readdir(path.join(root, '2026/09'))).toEqual([path.basename(key)])
  })

  it('remove twice → no throw; the file is gone', async () => {
    const s = localDiskStorage(root)
    const key = newStorageKey('2026-09-30', 'pdf')
    await s.put(key, new Uint8Array([9]))
    await s.remove(key)
    await expect(s.remove(key)).resolves.toBeUndefined()
    expect(await s.stream(key)).toBeNull()
  })

  it('stream of a missing or malformed key → null (never touches paths outside the root)', async () => {
    const s = localDiskStorage(root)
    expect(await s.stream('2026/09/3f2504e0-4f89-41d3-9a0c-0305e82c3301.png')).toBeNull()
    expect(await s.stream('2026/09/x.png')).toBeNull()
    expect(await s.stream('/etc/passwd')).toBeNull()
    expect(await s.stream('../../etc/passwd')).toBeNull()
  })

  it('put and remove reject unsafe keys', async () => {
    const s = localDiskStorage(root)
    await expect(s.put('../../etc/x.png', new Uint8Array([1]))).rejects.toThrow()
    await expect(s.put('/tmp/x.png', new Uint8Array([1]))).rejects.toThrow()
    await expect(s.remove('2026/09/../../x.png')).rejects.toThrow()
  })

  it('newStorageKey → yyyy/mm/<uuid>.<ext>', () => {
    const key = newStorageKey('2026-09-30', 'png')
    expect(key).toMatch(/^2026\/09\/[0-9a-f-]{36}\.png$/)
    expect(STORAGE_KEY_RE.test(key)).toBe(true)
  })

  it('getStorage() writes under UPLOAD_DIR', async () => {
    const key = newStorageKey('2026-09-30', 'txt')
    await getStorage().put(key, new TextEncoder().encode('hi'))
    const got = await getStorage().stream(key)
    expect(got!.size).toBe(2)
    await got!.body.cancel()
    await getStorage().remove(key)
  })
})
