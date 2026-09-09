import { access, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  assertNameAvailable,
  promoteSessionToProject,
  revertPromotion,
} from '../../../../server/utils/stroke/project'

/**
 * 昇格の順序（specs/project/generation「昇格に失敗したら承認を確定させず、宙吊りの状態を作らない」）。
 *
 * 順序は **衝突確認 → 改名 → `phase` を書く**。`phase` を先に書くと、書いた直後に処理が
 * 失われたときに「uuid のまま `approved`」の残骸が残り、それが一覧に生成中として並ぶ。
 * 改名を先に済ませれば、その残骸は原理的に生まれない。
 *
 * 巻き戻しも対称になる。`phase` の書き込みに失敗したら**改名を戻す**だけでよい。
 */

const SESSION = '0d0c8a1e-1111-4222-8333-444444444444'

async function root(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'promote-'))
}

async function session(dir: string, id: string): Promise<void> {
  await mkdir(join(dir, id), { recursive: true })
  await writeFile(join(dir, id, 'state.json'), JSON.stringify({ phase: 'proposed' }), 'utf8')
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

describe('昇格の順序', () => {
  it('衝突は改名の前に弾く。何も動かさない', async () => {
    const dir = await root()
    await session(dir, SESSION)
    await mkdir(join(dir, 'taken'), { recursive: true })

    await expect(assertNameAvailable(dir, 'taken')).rejects.toThrow()
    // セッションは元の名前のまま残る
    expect(await exists(join(dir, SESSION))).toBe(true)
  })

  it('改名に成功すると、セッションの名前は無くなりプロジェクト名になる', async () => {
    const dir = await root()
    await session(dir, SESSION)

    const target = await promoteSessionToProject(dir, SESSION, 'new-app')

    expect(target).toBe(join(dir, 'new-app'))
    expect(await exists(join(dir, 'new-app'))).toBe(true)
    expect(await exists(join(dir, SESSION))).toBe(false)
  })

  it('改名を戻すと、元の名前へ返る', async () => {
    const dir = await root()
    await session(dir, SESSION)
    await promoteSessionToProject(dir, SESSION, 'new-app')

    await revertPromotion(dir, 'new-app', SESSION)

    expect(await exists(join(dir, SESSION))).toBe(true)
    expect(await exists(join(dir, 'new-app'))).toBe(false)
  })

  it('改名の直後に処理が失われても、phase は proposed のまま残る', async () => {
    const dir = await root()
    await session(dir, SESSION)

    // `phase` を書く前の状態。ディレクトリはプロジェクト名だが、中身は proposed のまま
    await promoteSessionToProject(dir, SESSION, 'new-app')

    const state = JSON.parse(
      await (await import('node:fs/promises')).readFile(join(dir, 'new-app', 'state.json'), 'utf8'),
    )
    expect(state.phase).toBe('proposed')
  })
})
