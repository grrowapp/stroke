import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  accessFile,
  grantProject,
  readAccessStore,
  updateAccessStore,
} from '../../../../server/utils/access/store'

/** 許可と管理者の登録を持つ access.json（design D7・D11） */
describe('access.json', () => {
  let root: string
  const initial = { emails: [], networks: ['192.168.1.0/24'], hosts: [] }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'access-store-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('無ければ、許可は空・管理者の登録は初期値として読む', async () => {
    expect(await readAccessStore(root, initial)).toEqual({ users: {}, admins: initial })
  })

  it('許可を足して書くと、再び読んだときに残っている', async () => {
    await updateAccessStore(root, (store) => grantProject(store, 'Guest@Example.com', 'alpha'), initial)
    const store = await readAccessStore(root, initial)
    expect(store.users).toEqual({ 'guest@example.com': ['alpha'] })
    // 保存した時点で初期値も access.json に入り、以後はそれだけが使われる
    expect(store.admins.networks).toEqual(['192.168.1.0/24'])
  })

  it('保存した後は初期値ではなく保存した内容を読む。初期値も消せる', async () => {
    await updateAccessStore(root, (store) => ({ ...store, admins: { emails: [], networks: [], hosts: [] } }), initial)
    expect((await readAccessStore(root, initial)).admins.networks).toEqual([])
  })

  it('同じ許可を重ねて足しても1件のまま', async () => {
    await updateAccessStore(root, (store) => grantProject(grantProject(store, 'a@example.com', 'alpha'), 'A@example.com', 'alpha'))
    expect(JSON.parse(await readFile(accessFile(root), 'utf8')).users).toEqual({ 'a@example.com': ['alpha'] })
  })
})
