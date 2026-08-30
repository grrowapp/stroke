import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { assertProjectName, promoteSessionToProject, revertPromotion } from '../../../../server/utils/stroke/project'

/**
 * 昇格は「同じ親の下での改名だけ」である（openspec/specs/project/generation）。
 * 見るのは、中身がそのまま引き継がれること・`.spec-workflow/` を作らないこと・
 * 失敗時に元の名前のまま残ること（宙吊りを作らない）の3点。
 */

const SESSION_ID = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f607'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'promote-'))
  const dir = join(root, SESSION_ID)
  await mkdir(join(dir, 'docs'), { recursive: true })
  await writeFile(join(dir, 'docs', 'proposal.md'), '# proposal\n', 'utf8')
  await writeFile(join(dir, 'state.json'), '{"phase":"proposed"}\n', 'utf8')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('promoteSessionToProject', () => {
  it('セッションディレクトリを名前へ改名して昇格する', async () => {
    const target = await promoteSessionToProject(root, SESSION_ID, 'my-project')

    expect(target).toBe(join(root, 'my-project'))
    await expect(readFile(join(target, 'state.json'), 'utf8')).resolves.toContain('proposed')
  })

  it('中身は同じ相対位置のまま引き継がれる', async () => {
    const target = await promoteSessionToProject(root, SESSION_ID, 'my-project')

    await expect(readFile(join(target, 'docs', 'proposal.md'), 'utf8')).resolves.toBe(
      '# proposal\n',
    )
  })

  it('元のセッションディレクトリは残らない', async () => {
    await promoteSessionToProject(root, SESSION_ID, 'my-project')

    await expect(readFile(join(root, SESSION_ID, 'state.json'), 'utf8')).rejects.toThrow()
  })

  it('`.spec-workflow/` の内部構造は作らない', async () => {
    const target = await promoteSessionToProject(root, SESSION_ID, 'my-project')

    await expect(readFile(join(target, '.spec-workflow', 'config.toml'), 'utf8')).rejects.toThrow()
  })

  it('同名が既にあれば改名せず衝突を返す', async () => {
    await mkdir(join(root, 'taken'))

    await expect(promoteSessionToProject(root, SESSION_ID, 'taken')).rejects.toMatchObject({
      statusCode: 409,
    })

    // セッションは元の名前のまま残り、再度承認できる
    await expect(readFile(join(root, SESSION_ID, 'state.json'), 'utf8')).resolves.toContain(
      'proposed',
    )
  })

  it('相手が空ディレクトリでも黙って置き換えない', async () => {
    await mkdir(join(root, 'empty'))

    await expect(promoteSessionToProject(root, SESSION_ID, 'empty')).rejects.toMatchObject({
      statusCode: 409,
    })
  })

  it('実行環境が受け付けない名前は 400 で弾き、セッションを動かさない', async () => {
    await expect(promoteSessionToProject(root, SESSION_ID, '../escape')).rejects.toMatchObject({
      statusCode: 400,
    })

    await expect(readFile(join(root, SESSION_ID, 'state.json'), 'utf8')).resolves.toContain(
      'proposed',
    )
  })
})

describe('revertPromotion', () => {
  it('改名を元へ戻す。中身はそのまま残る', async () => {
    await promoteSessionToProject(root, SESSION_ID, 'my-project')

    await revertPromotion(root, 'my-project', SESSION_ID)

    // uuid の名前に戻り、中身も一緒に戻っている
    await expect(
      readFile(join(root, SESSION_ID, 'docs', 'proposal.md'), 'utf8'),
    ).resolves.toBe('# proposal\n')
    await expect(readFile(join(root, 'my-project', 'state.json'), 'utf8')).rejects.toThrow()
  })

  it('戻す先が無くても投げない。巻き戻しの失敗で元の失敗を覆い隠さない', async () => {
    await expect(revertPromotion(root, 'not-there', SESSION_ID)).resolves.toBeUndefined()
  })
})

describe('assertProjectName', () => {
  it('保存先の外へ出られる形を通さない', () => {
    for (const name of ['', '  ', '/abs', './rel', '..', 'a/../b', '.hidden']) {
      expect(() => assertProjectName(name)).toThrow()
    }
  })

  it('前後の空白は落として返す', () => {
    expect(assertProjectName('  my-project  ')).toBe('my-project')
  })
})
