import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import { listUnfinishedStrokes } from '../../../server/handler/session'

/**
 * 中断したストロークの列挙（U16）。
 *
 * 完全な失敗に達したセッションへの戻り道は、上層の一覧がこれを読んで出す
 * （`docs/specs/architecture/failure.md`「時間を置いて再開する」）。**見るのは `state.json` が
 * あることだけ**で、実行環境（openspec ルートとスキーマ設定）は検査しない——初回の起動に失敗した
 * セッションこそ戻り道が要るためである。`listSessions` との違いはそこにある。
 */

const roots: string[] = []

async function root(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'unfinished-'))
  roots.push(dir)
  return dir
}

afterAll(async () => {
  await Promise.all(roots.map(dir => rm(dir, { recursive: true, force: true })))
})

async function place(
  dir: string,
  name: string,
  state: Record<string, unknown> | string | null,
): Promise<void> {
  await mkdir(join(dir, name), { recursive: true })
  if (state === null) return
  const body = typeof state === 'string' ? state : JSON.stringify(state)
  await writeFile(join(dir, name, 'state.json'), body, 'utf8')
}

describe('listUnfinishedStrokes', () => {
  it('昇格前のセッションを phase と実行の記録つきで返す', async () => {
    const dir = await root()
    await place(dir, 's1', { phase: 'stroking', currentQuestion: null, invocation: 'error' })
    await place(dir, 's2', { phase: 'proposed', currentQuestion: null, invocation: 'idle' })

    const sessions = await listUnfinishedStrokes(dir)

    expect(sessions.map(s => [s.id, s.phase, s.invocation]).sort()).toEqual([
      ['s1', 'stroking', 'error'],
      ['s2', 'proposed', 'idle'],
    ])
    expect(sessions.find(s => s.id === 's1')?.path).toBe(join(dir, 's1'))
  })

  it('昇格した対象は返さない', async () => {
    const dir = await root()
    await place(dir, 'generating', { phase: 'approved', projectName: 'generating', invocation: 'idle' })
    await place(dir, 'completed', { phase: 'activated', projectName: 'completed', invocation: 'idle' })

    expect(await listUnfinishedStrokes(dir)).toEqual([])
  })

  it('実行環境が無くても載せる', async () => {
    // **ここが U12（`listSessions`）との違いである。** 初回の起動に失敗したセッションは
    // openspec ルートを持たないが、完全な失敗に達して自動では動かないので、戻り道がいちばん
    // 要る対象になる
    const dir = await root()
    await place(dir, 'never-launched', { phase: 'stroking', currentQuestion: null, invocation: 'error' })

    expect((await listUnfinishedStrokes(dir)).map(s => s.id)).toEqual(['never-launched'])
  })

  it('state.json を持たないディレクトリと読めないものは飛ばす', async () => {
    const dir = await root()
    await place(dir, 'no-state', null)
    await place(dir, 'broken', '{')
    await place(dir, 's1', { phase: 'stroking', currentQuestion: null, invocation: 'idle' })

    expect((await listUnfinishedStrokes(dir)).map(s => s.id)).toEqual(['s1'])
  })

  it('保存先が読めなければ空で返す', async () => {
    expect(await listUnfinishedStrokes(join(tmpdir(), 'unfinished-absent-dir'))).toEqual([])
  })
})
