import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { isAfterApproval, isBeforeApproval, readPhase } from '../../../server/handler/phase'
import { DeleteError, isSafeSegment, removeTarget, targetExists } from '../../../server/handler/delete'

/**
 * 削除の判定と実行の分かれ方（design.md D12）。
 *
 * **判定は endpoint が持ち、実行は判定を持たない。** ここでは分けた両方を、それぞれ単体で
 * 確かめる。実行に「どちらから呼ばれたか」を渡していないことは、引数に現れる。
 */

async function root(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'delete-'))
}

async function place(dir: string, name: string, phase: string | null): Promise<void> {
  await mkdir(join(dir, name), { recursive: true })
  if (phase !== null) {
    await writeFile(join(dir, name, 'state.json'), JSON.stringify({ phase }), 'utf8')
  }
}

describe('phase の判定', () => {
  it('承認より前は stroking と proposed だけ', () => {
    expect(isBeforeApproval('stroking')).toBe(true)
    expect(isBeforeApproval('proposed')).toBe(true)
    expect(isBeforeApproval('approved')).toBe(false)
  })

  it('承認以降は approved だけ', () => {
    expect(isAfterApproval('approved')).toBe(true)
    expect(isAfterApproval('proposed')).toBe(false)
    expect(isAfterApproval('stroking')).toBe(false)
  })

  it('知らない値は null にする。分からないものを通さない', async () => {
    const dir = await root()
    await place(dir, 'broken', 'nonsense')

    expect(await readPhase(dir, 'broken')).toBeNull()
  })

  it('state.json が無ければ null', async () => {
    const dir = await root()
    await place(dir, 'bare', null)

    expect(await readPhase(dir, 'bare')).toBeNull()
  })
})

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
    await place(dir, 'approved-one', 'approved')
    await place(dir, 'proposed-one', 'proposed')

    await removeTarget(dir, 'approved-one')
    await removeTarget(dir, 'proposed-one')

    expect(await targetExists(dir, 'approved-one')).toBe(false)
    expect(await targetExists(dir, 'proposed-one')).toBe(false)
  })

  /**
   * `.spec-workflow/` を持つものを守るのは**プロジェクトの endpoint の仕事**で、実行の側では
   * ない（specs/api/project/delete「中身のある本物のプロジェクトは消さない」）。実行に持たせて
   * いないことを、ここで固定する——持たせると、セッションの削除にも同じ判定が効いてしまう。
   */
  it('`.spec-workflow` を持つかどうかを実行は見ない', async () => {
    const dir = await root()
    await place(dir, 'real-project', 'approved')
    await mkdir(join(dir, 'real-project', '.spec-workflow'), { recursive: true })

    await removeTarget(dir, 'real-project')

    expect(await targetExists(dir, 'real-project')).toBe(false)
  })
})
