import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DeleteError } from '../../../server/handler/delete'
import { deleteSession, listSessions } from '../../../server/handler/session'

/**
 * 保存先にはセッション（uuid）と昇格したプロジェクト（名前）が並ぶ。
 *
 * 見るのは、一覧がどちらも載せること（巡回が昇格後の失敗を拾うために要る）と、
 * 削除が phase を見ないこと。**消す実体は handler に1本**——endpoint（U11）と
 * CLI（`yarn session delete`）の両方がここを通るためで、片方だけに置いても意味がない。
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
  root = await mkdtemp(join(tmpdir(), 'handler-session-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('listSessions', () => {
  it('セッションと昇格したプロジェクトのどちらも載せる', async () => {
    await place(SESSION_ID, 'stroking')
    await place(PROJECT_NAME, 'approved')

    const ids = (await listSessions(root)).map(s => s.id)

    expect(ids).toContain(SESSION_ID)
    expect(ids).toContain(PROJECT_NAME)
  })

  it('state.json を持たないディレクトリは載せない', async () => {
    await mkdir(join(root, 'some-repo', 'openspec'), { recursive: true })
    await writeFile(join(root, 'some-repo', 'openspec', 'config.yaml'), 'schema: custom\n', 'utf8')

    expect((await listSessions(root)).map(s => s.id)).not.toContain('some-repo')
  })

  it('各件に path と invocation を載せる', async () => {
    await place(SESSION_ID, 'stroking')

    const [session] = await listSessions(root)

    // キックする側がこれを cwd として U13 に渡す（endpoint に導出させない）
    expect(session?.path).toBe(join(root, SESSION_ID))
    expect(session?.invocation).toBe('idle')
  })

  it('state.json が壊れていても failed にはしない（巡回が延々と起こし直さない）', async () => {
    const dir = join(root, 'broken')
    await mkdir(join(dir, 'openspec'), { recursive: true })
    await writeFile(join(dir, 'openspec', 'config.yaml'), 'schema: x\n', 'utf8')
    await writeFile(join(dir, 'state.json'), 'not json', 'utf8')

    const broken = (await listSessions(root)).find(s => s.id === 'broken')

    expect(broken?.invocation).toBe('idle')
    expect(broken?.phase).toBe('unknown')
  })

  it('完成した（activated）プロジェクトも activated のまま載せる', async () => {
    await place(PROJECT_NAME, 'activated')

    const project = (await listSessions(root)).find(s => s.id === PROJECT_NAME)

    expect(project?.phase).toBe('activated')
  })

  it('集合に無い phase は unknown に倒す（一覧は壊れた1件で全体を落とさない）', async () => {
    await place('odd', 'nonsense')

    const odd = (await listSessions(root)).find(s => s.id === 'odd')

    expect(odd?.phase).toBe('unknown')
  })

  it('openspec ルートが無いディレクトリは載せない', async () => {
    await mkdir(join(root, 'bare'), { recursive: true })
    await writeFile(join(root, 'bare', 'state.json'), '{"phase":"stroking"}\n', 'utf8')

    expect((await listSessions(root)).map(s => s.id)).not.toContain('bare')
  })
})

describe('deleteSession', () => {
  it('セッションは消せる', async () => {
    await place(SESSION_ID, 'stroking')

    await deleteSession(root, SESSION_ID)

    expect(existsSync(join(root, SESSION_ID))).toBe(false)
  })

  it('phase を見ない。CLI の素通しの口なので昇格済みでも消える', async () => {
    // どの局面のものを消してよいかは削除の口（endpoint）が決める。ここは実行だけを持つ。
    // CLI（`yarn session delete`）には同じ守りが無い——手元の道具として、そう決めてある
    await place(PROJECT_NAME, 'approved')

    await expect(deleteSession(root, PROJECT_NAME)).resolves.toBeUndefined()
    expect(existsSync(join(root, PROJECT_NAME))).toBe(false)
  })

  it('無い id は消さずに失敗する', async () => {
    await expect(deleteSession(root, 'missing')).rejects.toBeInstanceOf(DeleteError)
  })

  it('保存先の外へ出られる形は受け付けない', async () => {
    for (const id of ['../escape', '.hidden', 'a/b']) {
      await expect(deleteSession(root, id)).rejects.toMatchObject({ kind: 'not-found' })
    }
  })
})
