import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { SessionCoreError, deleteSessionCore, listSessionsCore } from './session-core'

/**
 * 保存先にはセッション（uuid）と昇格したプロジェクト（名前）が並ぶ。
 *
 * 見るのは、一覧がどちらも載せること（巡回が昇格後の失敗を拾うために要る）と、
 * 削除が昇格後の対象に届かないこと。**削除の守りは core に置く**——endpoint（U11）と
 * CLI（`yarn session delete`）の両方がここを通るためで、片方だけでは意味がない。
 */

const SESSION_ID = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f607'
const PROJECT_NAME = 'promoted-project'

let root: string

/** 一覧の検査（openspec ルート・スキーマ設定済み）を通る形で置く。 */
async function place(name: string, phase: string): Promise<void> {
  const dir = join(root, name)
  await mkdir(join(dir, 'openspec'), { recursive: true })
  await writeFile(join(dir, 'openspec', 'config.yaml'), 'schema: flontier-strokeflow\n', 'utf8')
  await writeFile(
    join(dir, 'state.json'),
    `${JSON.stringify({ phase, currentQuestion: null, invocation: 'idle', projectName: name })}\n`,
    'utf8',
  )
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'session-core-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('listSessionsCore', () => {
  it('セッションと昇格したプロジェクトのどちらも載せる', async () => {
    await place(SESSION_ID, 'stroking')
    await place(PROJECT_NAME, 'approved')

    const ids = (await listSessionsCore(root)).map(s => s.id)

    expect(ids).toContain(SESSION_ID)
    expect(ids).toContain(PROJECT_NAME)
  })

  it('state.json を持たないディレクトリは載せない', async () => {
    await mkdir(join(root, 'some-repo', 'openspec'), { recursive: true })
    await writeFile(join(root, 'some-repo', 'openspec', 'config.yaml'), 'schema: custom\n', 'utf8')

    expect((await listSessionsCore(root)).map(s => s.id)).not.toContain('some-repo')
  })

  it('各件に path と invocation を載せる', async () => {
    await place(SESSION_ID, 'stroking')

    const [session] = await listSessionsCore(root)

    // キックする側がこれを cwd として U13 に渡す（endpoint に導出させない）
    expect(session?.path).toBe(join(root, SESSION_ID))
    expect(session?.invocation).toBe('idle')
  })

  it('state.json が壊れていても failed にはしない（巡回が延々と起こし直さない）', async () => {
    const dir = join(root, 'broken')
    await mkdir(join(dir, 'openspec'), { recursive: true })
    await writeFile(join(dir, 'openspec', 'config.yaml'), 'schema: x\n', 'utf8')
    await writeFile(join(dir, 'state.json'), 'not json', 'utf8')

    const broken = (await listSessionsCore(root)).find(s => s.id === 'broken')

    expect(broken?.invocation).toBe('idle')
    expect(broken?.phase).toBe('unknown')
  })

  it('openspec ルートが無いディレクトリは載せない', async () => {
    await mkdir(join(root, 'bare'), { recursive: true })
    await writeFile(join(root, 'bare', 'state.json'), '{"phase":"stroking"}\n', 'utf8')

    expect((await listSessionsCore(root)).map(s => s.id)).not.toContain('bare')
  })
})

describe('deleteSessionCore', () => {
  it('セッションは消せる', async () => {
    await place(SESSION_ID, 'stroking')

    await deleteSessionCore(root, SESSION_ID)

    expect(existsSync(join(root, SESSION_ID))).toBe(false)
  })

  it('昇格したプロジェクトは消せない', async () => {
    await place(PROJECT_NAME, 'approved')

    await expect(deleteSessionCore(root, PROJECT_NAME)).rejects.toMatchObject({ kind: 'phase' })
    expect(existsSync(join(root, PROJECT_NAME))).toBe(true)
  })

  it('無い id は消さずに失敗する', async () => {
    await expect(deleteSessionCore(root, 'missing')).rejects.toBeInstanceOf(SessionCoreError)
  })

  it('保存先の外へ出られる形は受け付けない', async () => {
    for (const id of ['../escape', '.hidden', 'a/b']) {
      await expect(deleteSessionCore(root, id)).rejects.toMatchObject({ kind: 'not-found' })
    }
  })
})
