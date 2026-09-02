import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  beginRun,
  endRun,
  isRunning,
  projectRunPath,
  sessionRunPath,
} from '../../../../server/utils/stroke/running'

/**
 * busy ガードのキー（fix-rename-during-running-session design.md D2）。
 *
 * 見るのは、改名の前後で同じ物理ディレクトリが**同じキー**になること、別のディレクトリは
 * **違うキー**になること、そして `stat` に失敗したら既定値へ落ちずにそのまま投げること。
 */

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

    const beforeKey = await beginRun(before)
    endRun(beforeKey)

    const after = join(root, 'project-name')
    await rename(before, after)

    // 改名後のパスから引いたキーは、改名前に引いたキーと同じ（inode は保たれる）
    const afterKey = await beginRun(after)
    endRun(afterKey)

    expect(afterKey).toBe(beforeKey)
  })

  it('別のディレクトリは別のキーになる', async () => {
    const a = join(root, 'a')
    const b = join(root, 'b')
    await mkdir(a)
    await mkdir(b)

    const keyA = await beginRun(a)
    const keyB = await beginRun(b)

    expect(keyA).not.toBe(keyB)

    endRun(keyA)
    endRun(keyB)
  })

  it('`stat` に失敗したら枠を取らずにそのまま投げる', async () => {
    const missing = join(root, 'does-not-exist')

    await expect(beginRun(missing)).rejects.toThrow()
    await expect(isRunning(missing)).rejects.toThrow()

    // 失敗しても他のディレクトリの枠には影響しない
    const other = join(root, 'other')
    await mkdir(other)
    const key = await beginRun(other)
    expect(await isRunning(other)).toBe(true)
    endRun(key)
  })
})

describe('beginRun / endRun / isRunning', () => {
  it('既に実行中なら 409 busy で断る', async () => {
    const dir = join(root, 'busy')
    await mkdir(dir)

    const key = await beginRun(dir)
    await expect(beginRun(dir)).rejects.toMatchObject({ statusCode: 409, data: { reason: 'busy' } })

    endRun(key)
    // 解放後は再び取れる
    const reacquired = await beginRun(dir)
    expect(reacquired).toBe(key)
    endRun(reacquired)
  })

  it('`endRun` は `beginRun` が返したキーで解放する。ディレクトリが消えても外せる', async () => {
    const dir = join(root, 'vanishing')
    await mkdir(dir)

    const key = await beginRun(dir)
    expect(await isRunning(dir)).toBe(true)

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

    const keyA = await beginRun(a)
    const keyB = await beginRun(b)
    expect(await isRunning(a)).toBe(true)
    expect(await isRunning(b)).toBe(true)

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

    const key = await beginRun(sessionPath)
    endRun(key)

    const projectPath = projectRunPath(root, 'renamed-project')
    await rename(sessionPath, projectPath)

    const afterKey = await beginRun(projectPath)
    endRun(afterKey)

    expect(afterKey).toBe(key)
  })
})
