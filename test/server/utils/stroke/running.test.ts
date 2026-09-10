import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  beginRun,
  endRun,
  projectRunPath,
  sessionRunPath,
} from '../../../../server/utils/stroke/running'

/**
 * 実行の枠のキー（fix-rename-during-running-session design.md D2）。
 *
 * 見るのは、改名の前後で同じ物理ディレクトリが**同じキー**になること、別のディレクトリは
 * **違うキー**になること、そして `stat` に失敗したら既定値へ落ちずにそのまま投げること。
 *
 * **`beginRun` は「実行中だから受け付けない」を投げない**（409 busy を契約から無くした）。
 * 取れたかどうかを `started` で返すだけで、断る理由は呼び出し側が自分の文脈で決める。
 */

/** 取れた前提でキーを取り出す。取れなければテストを落とす。 */
async function acquire(path: string): Promise<string> {
  const start = await beginRun(path)
  if (!start.started) throw new Error(`枠を取れなかった: ${path}`)
  return start.key
}

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'running-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('キーの導出', () => {
  it('改名の前後で同じディレクトリは同じキーになる', async () => {
    const before = join(root, 'session-uuid')
    await mkdir(before)

    const beforeKey = await acquire(before)
    endRun(beforeKey)

    const after = join(root, 'project-name')
    await rename(before, after)

    // 改名後のパスから引いたキーは、改名前に引いたキーと同じ（inode は保たれる）
    const afterKey = await acquire(after)
    endRun(afterKey)

    expect(afterKey).toBe(beforeKey)
  })

  it('別のディレクトリは別のキーになる', async () => {
    const a = join(root, 'a')
    const b = join(root, 'b')
    await mkdir(a)
    await mkdir(b)

    const keyA = await acquire(a)
    const keyB = await acquire(b)

    expect(keyA).not.toBe(keyB)

    endRun(keyA)
    endRun(keyB)
  })

  it('`stat` に失敗したら枠を取らずにそのまま投げる', async () => {
    const missing = join(root, 'does-not-exist')

    await expect(beginRun(missing)).rejects.toThrow()

    // 失敗しても他のディレクトリの枠には影響しない
    const other = join(root, 'other')
    await mkdir(other)
    const key = await acquire(other)
    endRun(key)
  })
})

describe('beginRun / endRun', () => {
  it('既に実行中なら started: false を返す。投げない', async () => {
    const dir = join(root, 'running')
    await mkdir(dir)

    const key = await acquire(dir)
    expect(await beginRun(dir)).toEqual({ started: false })

    endRun(key)
    // 解放後は再び取れる
    const reacquired = await acquire(dir)
    expect(reacquired).toBe(key)
    endRun(reacquired)
  })

  it('`endRun` は `beginRun` が返したキーで解放する。ディレクトリが消えても外せる', async () => {
    const dir = join(root, 'vanishing')
    await mkdir(dir)

    const key = await acquire(dir)

    // 実行中にディレクトリそのものが消える（例: 改名で別名になる）
    await rm(dir, { recursive: true, force: true })

    // それでも beginRun が返したキーがあれば解放できる（stat し直さない）
    expect(() => endRun(key)).not.toThrow()
  })

  it('別のディレクトリは同時に走れる', async () => {
    const a = join(root, 'a')
    const b = join(root, 'b')
    await mkdir(a)
    await mkdir(b)

    const keyA = await acquire(a)
    const keyB = await acquire(b)

    expect(keyA).not.toBe(keyB)

    endRun(keyA)
    endRun(keyB)
  })
})

describe('id → パス', () => {
  it('sessionRunPath / projectRunPath は保存先の下の実体を指す', async () => {
    const sessionDirPath = sessionRunPath(root, 'some-uuid')
    const projectDirPath = projectRunPath(root, 'some-project')

    expect(sessionDirPath).toBe(join(root, 'some-uuid'))
    expect(projectDirPath).toBe(join(root, 'some-project'))
  })

  it('同じ物理ディレクトリを指せば、セッション id とプロジェクト名でも同じキーになる', async () => {
    // 改名前は sessionRunPath、改名後は同じ実体を projectRunPath で指す
    const sessionPath = sessionRunPath(root, 'uuid-1')
    await mkdir(sessionPath)

    const key = await acquire(sessionPath)
    endRun(key)

    const projectPath = projectRunPath(root, 'renamed-project')
    await rename(sessionPath, projectPath)

    const afterKey = await acquire(projectPath)
    endRun(afterKey)

    expect(afterKey).toBe(key)
  })
})
