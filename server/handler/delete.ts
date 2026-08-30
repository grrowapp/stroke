import fse from 'fs-extra'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * 保存先直下の1つを消す実行。
 *
 * セッションもプロジェクトも、消す動作そのものは同じである——保存先直下のディレクトリを
 * 中身ごと落とすだけ。違うのは**どの局面のものを消してよいか**で、それは呼ぶ側
 * （各 endpoint）が決める。ここは判定を持たない。
 *
 * **呼び出し元を知らせて分岐させない。** ここに「セッションから来たのか」を渡して条件を
 * 変えると、実行が呼び出し元を知ることになり、局面が増えるたびにここが太る。
 *
 * CLI（`yarn session delete`）はここを通らず `deleteSessionCore` を直に呼ぶ。判定を持たない
 * 素通しの口として残してある。
 */

export type DeleteErrorKind = 'not-found' | 'io'

export class DeleteError extends Error {
  constructor(
    public readonly kind: DeleteErrorKind,
    message: string,
  ) {
    super(message)
    this.name = 'DeleteError'
  }
}

/**
 * 保存先の直下の1つとして、ディレクトリ名にそのまま使える形か。
 *
 * **保存先の外へ出られる形を通さない**ことだけを見る。緩めれば保存先の外を消せてしまう。
 */
export function isSafeSegment(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) && !value.includes('..')
}

/** `state.json` が在ることをもって、消せる対象として在るとする */
export async function targetExists(root: string, name: string): Promise<boolean> {
  if (!isSafeSegment(name)) return false
  try {
    return (await stat(join(root, name, 'state.json'))).isFile()
  } catch {
    return false
  }
}

/**
 * 消す。存在しない対象は消したことにしない。
 *
 * `fs-extra` の `remove` は存在しないパスで黙って成功するので、検査を先に置く。
 */
export async function removeTarget(root: string, name: string): Promise<void> {
  if (!(await targetExists(root, name))) {
    throw new DeleteError('not-found', `その対象は無い: ${name}`)
  }

  try {
    await fse.remove(join(root, name))
  } catch (error) {
    throw new DeleteError(
      'io',
      `消せなかった: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}
