import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import { DeleteError, isSafeSegment, removeTarget, targetExists } from '../../../server/handler/delete'

/**
 * 削除の実行（design.md D12）。
 *
 * **判定は endpoint が持ち、実行は判定を持たない。** 実行に「どちらから呼ばれたか」を渡して
 * いないことは、引数に現れる。局面の判定は各 endpoint のテスト
 * （`test/server/api/sessions/[id]/index.delete.test.ts`・`test/server/api/projects/[projectId]/index.delete.test.ts`）
 * が見る——かつて `handler/phase.ts` に在った判定は endpoint へ戻した（add-activated-phase design D5）。
 */

const roots: string[] = []

async function root(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'delete-'))
  roots.push(dir)
  return dir
}

afterAll(async () => {
  await Promise.all(roots.map(dir => rm(dir, { recursive: true, force: true })))
})

async function place(dir: string, name: string, phase: string | null): Promise<void> {
  await mkdir(join(dir, name), { recursive: true })
  if (phase !== null) {
    await writeFile(join(dir, name, 'state.json'), JSON.stringify({ phase }), 'utf8')
  }
}

describe('削除の実行', () => {
  it('保存先の外へ出られる名前を通さない', () => {
    expect(isSafeSegment('good-name')).toBe(true)
    expect(isSafeSegment('../escape')).toBe(false)
    expect(isSafeSegment('/abs')).toBe(false)
    expect(isSafeSegment('.hidden')).toBe(false)
  })

  it('存在しない対象を消したことにしない', async () => {
    const dir = await root()

    await expect(removeTarget(dir, 'missing')).rejects.toBeInstanceOf(DeleteError)
  })

  it('state.json を持つものを消す', async () => {
    const dir = await root()
    await place(dir, 'gone', 'proposed')

    expect(await targetExists(dir, 'gone')).toBe(true)
    await removeTarget(dir, 'gone')
    expect(await targetExists(dir, 'gone')).toBe(false)
  })

  /**
   * **実行は phase を知らない。** どの局面のものを許すかは呼ぶ側（各 endpoint）が決める
   * （design.md D12）。ここに渡せるのは保存先と名前だけで、呼び出し元を知らせる引数が無い。
   */
  it('phase を問わず消す。判定は持たない', async () => {
    const dir = await root()
    await place(dir, 'activated-one', 'activated')
    await place(dir, 'approved-one', 'approved')
    await place(dir, 'proposed-one', 'proposed')

    await removeTarget(dir, 'activated-one')
    await removeTarget(dir, 'approved-one')
    await removeTarget(dir, 'proposed-one')

    expect(await targetExists(dir, 'activated-one')).toBe(false)
    expect(await targetExists(dir, 'approved-one')).toBe(false)
    expect(await targetExists(dir, 'proposed-one')).toBe(false)
  })

  /**
   * `.spec-workflow/` を持つものでも実行は消す。守るのは endpoint の仕事で、その根拠は
   * `.spec-workflow/` の有無ではなく phase（`activated`）である
   * （specs/api/project/delete「中身のある本物のプロジェクトは消さない」）。
   */
  it('`.spec-workflow` を持つかどうかを実行は見ない', async () => {
    const dir = await root()
    await place(dir, 'real-project', 'approved')
    await mkdir(join(dir, 'real-project', '.spec-workflow'), { recursive: true })

    await removeTarget(dir, 'real-project')

    expect(await targetExists(dir, 'real-project')).toBe(false)
  })
})
